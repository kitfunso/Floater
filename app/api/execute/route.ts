// POST /api/execute — stateless. Client sends the schedule it holds plus
// the decisions it has tracked locally; server returns the executed summary.
// No persistence (works on Cloudflare Workers without KV).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Decision = z.object({
  invoiceId: z.string().min(1),
  verdict: z.enum(['approve', 'defer', 'reject']),
});

const Body = z.object({
  scheduleId: z.string().min(1),
  autoPayCount: z.number().int().min(0),
  decisions: z.array(Decision).default([]),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: (err as Error).message }, { status: 400 });
  }

  const approved = parsed.decisions.filter((d) => d.verdict === 'approve').length;
  const deferred = parsed.decisions.filter((d) => d.verdict === 'defer').length;
  const rejected = parsed.decisions.filter((d) => d.verdict === 'reject').length;
  const executed = parsed.autoPayCount + approved;

  return NextResponse.json({
    executed,
    approved,
    deferred,
    rejected,
    idempotent: false,
  });
}
