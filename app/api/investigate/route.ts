// POST /api/investigate { scheduleId, invoiceId, forceDistress? }
//   -> { verdicts, parallelism, narration }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fanOut, _clearCacheForTest } from '@/lib/cursor';
import { ALL_AGENTS } from '@/agents';
import { loadAll } from '@/lib/data';
import { narrate } from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  scheduleId: z.string().min(1),
  invoiceId: z.string().min(1),
  // Stateless: client passes the entry's distressScore from the schedule it
  // already holds. Lets /api/investigate work on Cloudflare Workers where
  // Workers don't share in-memory state across requests.
  distressScore: z.number().min(0).max(1),
  forceDistress: z.number().min(0).max(1).optional(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: (err as Error).message }, { status: 400 });
  }

  const { invoices, vendors, forecast } = loadAll();
  const invoice = invoices.find((i) => i.id === parsed.invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: `invoice ${parsed.invoiceId} not in dataset` }, { status: 404 });
  }
  const vendor = vendors.find((v) => v.id === invoice.vendorId);
  if (!vendor) {
    return NextResponse.json({ error: `vendor ${invoice.vendorId} not in dataset` }, { status: 404 });
  }

  try {
    // Alert-triggered re-investigation needs to bypass the per-(scheduleId,
    // invoiceId) cache. Use a synthetic scheduleId postfix so the cached
    // entry stays around for normal investigate calls.
    const alertTriggered = typeof parsed.forceDistress === 'number';
    const distressForRun = alertTriggered ? parsed.forceDistress! : parsed.distressScore;
    const cacheScheduleId = alertTriggered
      ? `${parsed.scheduleId}-alert${Math.round(parsed.forceDistress! * 100)}`
      : parsed.scheduleId;

    const result = await fanOut(
      {
        invoice,
        vendor,
        forecast,
        distressScore: distressForRun,
        scheduleId: cacheScheduleId,
      },
      ALL_AGENTS,
    );

    return NextResponse.json({
      ...result,
      narration: narrate({ invoiceId: invoice.id, verdicts: result.verdicts, alertTriggered }),
      effectiveDistress: distressForRun,
    });
  } catch (err) {
    console.error('investigate error', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// Avoid unused-import warning when test hooks aren't called from runtime path.
void _clearCacheForTest;
