export { vendorHealthAgent } from './vendor-health';
export { cashImpactAgent } from './cash-impact';
export { discountNpvAgent } from './discount-npv';

import { vendorHealthAgent } from './vendor-health';
import { cashImpactAgent } from './cash-impact';
import { discountNpvAgent } from './discount-npv';
import type { SubAgent } from '../lib/cursor';

export const ALL_AGENTS: readonly SubAgent[] = [
  vendorHealthAgent,
  cashImpactAgent,
  discountNpvAgent,
];
