// Fixture-cached narration. Bundled via static JSON import so it works on
// Cloudflare Workers as well as Node.

import narrationsJson from '@/data/fixtures/narrations.json';
import type { Verdict } from './types';

const FIXTURES = narrationsJson as Record<string, string>;

export type NarrateInput = {
  invoiceId: string;
  verdicts: Verdict[];
  alertTriggered?: boolean;
};

export function narrate({ invoiceId, alertTriggered }: NarrateInput): string {
  if (alertTriggered && invoiceId === 'INV-FLOOR-BREACH') {
    return FIXTURES['INV-FLOOR-BREACH-AFTER-ALERT'] ?? FIXTURES['_default'] ?? '';
  }
  return FIXTURES[invoiceId] ?? FIXTURES['_default'] ?? '';
}
