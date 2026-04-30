// POST /api/decide — stateless on Cloudflare. Just validates the body and
// returns ok. The client tracks decisions locally and replays them to
// /api/execute. (Worker instances don't share memory; persistence would
// need KV / Durable Objects, which is overkill for the demo.)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  scheduleId: z.string().min(1),
  invoiceId: z.string().min(1),
  verdict: z.enum(['approve', 'defer', 'reject']),
  reason: z.string().min(1).max(500),
});

export async function POST(req: NextRequest) {
  try {
    Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: (err as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
