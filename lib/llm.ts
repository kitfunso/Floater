// One-liner narration for an escalation. Fixture-cached under DEMO_REPLAY=1
// so the demo cannot fail on a flaky network. Live path (DEMO_REPLAY=0)
// would call gpt-5-mini; for the hackathon we never use it on the critical
// path. Falls back to fixture default when the invoiceId isn't pre-baked.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Verdict } from './types';

let fixtures: Record<string, string> | null = null;

function loadFixtures(): Record<string, string> {
  if (fixtures) return fixtures;
  const p = join(process.cwd(), 'data', 'fixtures', 'narrations.json');
  if (!existsSync(p)) return (fixtures = {});
  fixtures = JSON.parse(readFileSync(p, 'utf8')) as Record<string, string>;
  return fixtures;
}

export type NarrateInput = {
  invoiceId: string;
  verdicts: Verdict[];
  alertTriggered?: boolean;
};

export function narrate({ invoiceId, alertTriggered }: NarrateInput): string {
  const map = loadFixtures();
  if (alertTriggered && invoiceId === 'INV-FLOOR-BREACH') {
    return map['INV-FLOOR-BREACH-AFTER-ALERT'] ?? map['_default'] ?? '';
  }
  return map[invoiceId] ?? map['_default'] ?? '';
}
