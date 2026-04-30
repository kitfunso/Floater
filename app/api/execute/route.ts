// POST /api/execute { scheduleId } -> { executed, approved, deferred, rejected }
// Idempotent: re-execution returns the existing executed log.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readPending, readDecisions, readExecuted, writeExecuted } from '@/lib/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ scheduleId: z.string().min(1) });

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: (err as Error).message }, { status: 400 });
  }

  const existing = readExecuted(parsed.scheduleId);
  if (existing) {
    return NextResponse.json({
      executed: existing.executed,
      approved: existing.approved,
      deferred: existing.deferred,
      rejected: existing.rejected,
      idempotent: true,
    });
  }

  const pending = readPending(parsed.scheduleId);
  if (!pending) {
    return NextResponse.json({ error: `schedule ${parsed.scheduleId} not found` }, { status: 404 });
  }
  const decisions = readDecisions(parsed.scheduleId);

  const autoEntries = pending.entries.filter((e) => e.reason !== 'flagged').length;
  const approved = decisions.filter((d) => d.verdict === 'approve').length;
  const deferred = decisions.filter((d) => d.verdict === 'defer').length;
  const rejected = decisions.filter((d) => d.verdict === 'reject').length;

  const record = {
    scheduleId: parsed.scheduleId,
    executedAt: new Date().toISOString(),
    schedule: pending,
    decisions,
    executed: autoEntries + approved,
    approved,
    deferred,
    rejected,
  };
  writeExecuted(record);

  return NextResponse.json({
    executed: record.executed,
    approved,
    deferred,
    rejected,
    idempotent: false,
  });
}
