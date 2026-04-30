// File-system persistence for schedule runs. Local dev writes to ./runs;
// Vercel writes to /tmp (only writable directory in their serverless env).
// All run files are JSON; decisions are JSONL append-only.

import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Schedule } from './types';

const RUNS_DIR = (() => {
  if (process.env.RUNS_DIR) return process.env.RUNS_DIR;
  if (process.env.VERCEL === '1') return '/tmp/floater-runs';
  return join(process.cwd(), 'runs');
})();

function ensureDir(): void {
  mkdirSync(RUNS_DIR, { recursive: true });
}

function pendingPath(id: string): string  { return join(RUNS_DIR, `${id}.pending.json`); }
function decisionsPath(id: string): string { return join(RUNS_DIR, `${id}.decisions.jsonl`); }
function executedPath(id: string): string  { return join(RUNS_DIR, `${id}.executed.json`); }

export function newScheduleId(): string {
  return `SCH-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

export function writePending(schedule: Schedule): void {
  ensureDir();
  writeFileSync(pendingPath(schedule.scheduleId), JSON.stringify(schedule, null, 2) + '\n');
}

export function readPending(scheduleId: string): Schedule | null {
  if (!existsSync(pendingPath(scheduleId))) return null;
  return JSON.parse(readFileSync(pendingPath(scheduleId), 'utf8')) as Schedule;
}

export type DecisionRecord = {
  ts: string;
  scheduleId: string;
  invoiceId: string;
  verdict: 'approve' | 'defer' | 'reject';
  reason: string;
};

export function appendDecision(record: DecisionRecord): void {
  ensureDir();
  appendFileSync(decisionsPath(record.scheduleId), JSON.stringify(record) + '\n');
}

export function readDecisions(scheduleId: string): DecisionRecord[] {
  if (!existsSync(decisionsPath(scheduleId))) return [];
  return readFileSync(decisionsPath(scheduleId), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as DecisionRecord);
}

export type ExecutedRun = {
  scheduleId: string;
  executedAt: string;
  schedule: Schedule;
  decisions: DecisionRecord[];
  executed: number;     // count of auto-pay entries committed
  approved: number;     // count of escalations approved
  deferred: number;
  rejected: number;
};

export function writeExecuted(record: ExecutedRun): void {
  ensureDir();
  writeFileSync(executedPath(record.scheduleId), JSON.stringify(record, null, 2) + '\n');
}

export function readExecuted(scheduleId: string): ExecutedRun | null {
  if (!existsSync(executedPath(scheduleId))) return null;
  return JSON.parse(readFileSync(executedPath(scheduleId), 'utf8')) as ExecutedRun;
}
