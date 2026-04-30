// POST /api/investigate { scheduleId, invoiceId } -> { verdicts, parallelism }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fanOut } from '@/lib/cursor';
import { ALL_AGENTS } from '@/agents';
import { readPending } from '@/lib/runs';
import { loadAll } from '@/lib/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  scheduleId: z.string().min(1),
  invoiceId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: (err as Error).message }, { status: 400 });
  }

  const pending = readPending(parsed.scheduleId);
  if (!pending) {
    return NextResponse.json({ error: `schedule ${parsed.scheduleId} not found` }, { status: 404 });
  }

  const entry = pending.entries.find((e) => e.invoiceId === parsed.invoiceId);
  if (!entry) {
    return NextResponse.json({ error: `invoice ${parsed.invoiceId} not in schedule` }, { status: 404 });
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
    const result = await fanOut(
      {
        invoice,
        vendor,
        forecast,
        distressScore: entry.distressScore,
        scheduleId: parsed.scheduleId,
      },
      ALL_AGENTS,
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error('investigate error', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
