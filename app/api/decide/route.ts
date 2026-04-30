// POST /api/decide { scheduleId, invoiceId, verdict, reason } -> { ok }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { appendDecision, readPending } from '@/lib/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  scheduleId: z.string().min(1),
  invoiceId: z.string().min(1),
  verdict: z.enum(['approve', 'defer', 'reject']),
  reason: z.string().min(1).max(500),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: (err as Error).message }, { status: 400 });
  }

  if (!readPending(parsed.scheduleId)) {
    return NextResponse.json({ error: `schedule ${parsed.scheduleId} not found` }, { status: 404 });
  }

  appendDecision({
    ts: new Date().toISOString(),
    scheduleId: parsed.scheduleId,
    invoiceId: parsed.invoiceId,
    verdict: parsed.verdict,
    reason: parsed.reason,
  });

  return NextResponse.json({ ok: true });
}
