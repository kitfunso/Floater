// POST /api/agent/[name] — single sub-agent invocation. The client fires three
// of these in parallel from the browser so the UI can show each verdict
// landing independently (progressive reveal). Server still runs each agent
// concurrently if the client uses Promise.all.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ALL_AGENTS } from '@/agents';
import { loadAll } from '@/lib/data';
import { narrate } from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  scheduleId: z.string().min(1),
  invoiceId: z.string().min(1),
  distressScore: z.number().min(0).max(1),
  forceDistress: z.number().min(0).max(1).optional(),
});

const VALID_AGENTS = new Set(['vendor-health', 'cash-impact', 'discount-npv']);

export async function POST(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!VALID_AGENTS.has(name)) {
    return NextResponse.json({ error: `unknown agent: ${name}` }, { status: 400 });
  }

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: (err as Error).message }, { status: 400 });
  }

  const { invoices, vendors, forecast } = loadAll();
  const invoice = invoices.find((i) => i.id === parsed.invoiceId);
  if (!invoice) return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
  const vendor = vendors.find((v) => v.id === invoice.vendorId);
  if (!vendor) return NextResponse.json({ error: 'vendor not found' }, { status: 404 });

  const subAgent = ALL_AGENTS.find((a) => a.name === name);
  if (!subAgent) return NextResponse.json({ error: 'agent unavailable' }, { status: 500 });

  const alertTriggered = typeof parsed.forceDistress === 'number';
  const distress = alertTriggered ? parsed.forceDistress! : parsed.distressScore;

  try {
    const t0 = Date.now();
    const result = await subAgent.run({
      invoice,
      vendor,
      forecast,
      distressScore: distress,
      scheduleId: parsed.scheduleId + (alertTriggered ? `-alert${Math.round(distress * 100)}` : ''),
    });
    const wall = Date.now() - t0;

    return NextResponse.json({
      verdict: result.verdict,
      durationMs: wall,
      effectiveDistress: distress,
      // narration is per-invoice, not per-agent. Send it on the
      // vendor-health response (first one rendered) so the UI shows it
      // alongside the per-agent verdicts.
      narration:
        name === 'vendor-health'
          ? narrate({ invoiceId: invoice.id, verdicts: [result.verdict], alertTriggered })
          : undefined,
    });
  } catch (err) {
    console.error(`agent ${name} error`, err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
