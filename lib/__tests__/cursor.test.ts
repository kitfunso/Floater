// Test cursor.ts fan-out behaviour: parallel exec, cache, verdict shape.
//   DEMO_REPLAY=1 npx tsx lib/__tests__/cursor.test.ts
import { fanOut, _clearCacheForTest } from '../cursor';
import { vendorHealthAgent } from '../../agents/vendor-health';
import { ALL_AGENTS } from '../../agents';
import type { AgentInput } from '../cursor';
import type { Invoice, Vendor, Forecast } from '../types';

const inv: Invoice = {
  id: 'INV-T', vendorId: 'V-001', amount: 2000,
  issuedDate: '2026-05-04', dueDate: '2026-06-03',
  terms: '2/10 net 30', netDays: 30, discountPct: 0.02, discountDays: 10,
  category: 'saas',
};
const vendor: Vendor = { id: 'V-001', name: 'Test', paymentHistory: 'reliable', strategicTier: 2 };
const forecast: Forecast = { openingCash: 100_000, cashFloor: 40_000, flows: [] };

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { pass += 1; console.log(`  ok  ${name}`); }
  else      { fail += 1; console.error(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`); }
}

async function main() {
  _clearCacheForTest();

  // Step 7a checkpoint: 1 agent, fanOut still uses Promise.all (extends to N=3 in 7b).
  const t0 = Date.now();
  const r1 = await fanOut(
    { invoice: inv, vendor, forecast, distressScore: 0.1, scheduleId: 'SCH-T' },
    [vendorHealthAgent],
  );
  const t1 = Date.now();

  check('1 verdict returned',           r1.verdicts.length === 1);
  check('verdict from vendor-health',   r1.verdicts[0]?.agent === 'vendor-health');
  check('low distress = pay-early',     r1.verdicts[0]?.recommendation === 'pay-early');
  check('parallelism object present',   typeof r1.parallelism.spreadMs === 'number');
  check('first call took >0ms',         (t1 - t0) >= 20);

  // Cache hit: second call instant
  const c0 = Date.now();
  const r2 = await fanOut(
    { invoice: inv, vendor, forecast, distressScore: 0.1, scheduleId: 'SCH-T' },
    [vendorHealthAgent],
  );
  const c1 = Date.now();
  check('cache hit < 50ms',             (c1 - c0) < 50);
  check('same verdicts on cache hit',   r2.verdicts[0]?.recommendation === r1.verdicts[0]?.recommendation);

  // Different distress scores
  _clearCacheForTest();
  const distressed = await fanOut(
    { invoice: inv, vendor, forecast, distressScore: 0.7, scheduleId: 'SCH-D' },
    [vendorHealthAgent],
  );
  check('high distress = defer',        distressed.verdicts[0]?.recommendation === 'defer');

  const moderate = await fanOut(
    { invoice: inv, vendor, forecast, distressScore: 0.4, scheduleId: 'SCH-M' },
    [vendorHealthAgent],
  );
  check('moderate distress = pay-on-time', moderate.verdicts[0]?.recommendation === 'pay-on-time');

  // Step 7b: full N=3 fan-out
  console.log('\n7b: 3-agent fan-out');
  _clearCacheForTest();
  const t3start = Date.now();
  const r3 = await fanOut(
    { invoice: inv, vendor, forecast: { openingCash: 200_000, cashFloor: 40_000, flows: [] }, distressScore: 0.1, scheduleId: 'SCH-3' },
    ALL_AGENTS,
  );
  const t3total = Date.now() - t3start;

  check('3 verdicts returned',          r3.verdicts.length === 3);
  const agents = r3.verdicts.map((v) => v.agent);
  check('agents = vendor-health, cash-impact, discount-npv',
    agents[0] === 'vendor-health' && agents[1] === 'cash-impact' && agents[2] === 'discount-npv');
  // Parallel proof: total wallclock < sum of individual durations.
  // Each agent has 25-80ms stagger; if sequential, total >= 90ms. Promise.all
  // should land it under 120ms total.
  check(`total wallclock < 200ms (got ${t3total}ms)`, t3total < 200);
  check('cache hit on second call', (await (async () => {
    const c0 = Date.now();
    await fanOut({ invoice: inv, vendor, forecast: { openingCash: 200_000, cashFloor: 40_000, flows: [] }, distressScore: 0.1, scheduleId: 'SCH-3' }, ALL_AGENTS);
    return Date.now() - c0;
  })()) < 30);

  // Discount-NPV recommendation for 2/10 net 30 reliable + low distress
  check('discount-npv says pay-early',
    r3.verdicts[2]?.recommendation === 'pay-early');

  // Cash-impact safe forecast says pay-early
  check('cash-impact says pay-early on safe forecast',
    r3.verdicts[1]?.recommendation === 'pay-early');

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
