// In-memory persistence for schedule runs. A single demo session lives in
// one Worker / Node instance and the state never needs to outlive it. This
// avoids fs writes (Cloudflare Workers don't have a writable filesystem)
// without breaking the Optimise -> Investigate -> Decide -> Execute flow.

import type { Schedule } from './types';

type GlobalStore = {
  pending: Map<string, Schedule>;
  decisions: Map<string, DecisionRecord[]>;
  executed: Map<string, ExecutedRun>;
};

// Hang the store off globalThis so module reloads (next dev) don't lose
// state mid-session.
const g = globalThis as unknown as { __floaterRuns?: GlobalStore };
const store: GlobalStore = (g.__floaterRuns ??= {
  pending: new Map(),
  decisions: new Map(),
  executed: new Map(),
});

export function newScheduleId(): string {
  return `SCH-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

export function writePending(schedule: Schedule): void {
  store.pending.set(schedule.scheduleId, schedule);
}

export function readPending(scheduleId: string): Schedule | null {
  return store.pending.get(scheduleId) ?? null;
}

export type DecisionRecord = {
  ts: string;
  scheduleId: string;
  invoiceId: string;
  verdict: 'approve' | 'defer' | 'reject';
  reason: string;
};

export function appendDecision(record: DecisionRecord): void {
  const list = store.decisions.get(record.scheduleId) ?? [];
  list.push(record);
  store.decisions.set(record.scheduleId, list);
}

export function readDecisions(scheduleId: string): DecisionRecord[] {
  return store.decisions.get(scheduleId) ?? [];
}

export type ExecutedRun = {
  scheduleId: string;
  executedAt: string;
  schedule: Schedule;
  decisions: DecisionRecord[];
  executed: number;
  approved: number;
  deferred: number;
  rejected: number;
};

export function writeExecuted(record: ExecutedRun): void {
  store.executed.set(record.scheduleId, record);
}

export function readExecuted(scheduleId: string): ExecutedRun | null {
  return store.executed.get(scheduleId) ?? null;
}
