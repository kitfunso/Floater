// Optimiser tests + determinism harness. Run with DEMO_REPLAY=1.
//   DEMO_REPLAY=1 npx tsx lib/__tests__/optimiser.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { optimise, simulate } from '../optimiser';
import { getDistressScore } from '../specter';
import type { Invoice, Vendor, Forecast, DistressMap } from '../types';

const ROOT = join(__dirname, '..', '..');
const data = (name: string) => JSON.parse(readFileSync(join(ROOT, 'data', name), 'utf8'));

const invoices: Invoice[] = data('invoices.json');
const vendors: Vendor[]   = data('vendors.json');
const forecast: Forecast  = data('cash-forecast.json');

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass += 1; console.log(`  ok  ${name}`); }
  else      { fail += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function main() {
  // Pre-fetch distress scores via Specter fixtures.
  const distressScores: DistressMap = {};
  await Promise.all(vendors.map(async (v) => {
    const sig = await getDistressScore(v.specterId);
    distressScores[v.id] = sig.score;
  }));

  // ============================================================
  // (a) reliable + low distress + 2/10 net 30 + cash safe → auto-discount
  // ============================================================
  console.log('\n(a) discount path');
  const aOnly: Invoice[] = [{
    id: 'INV-A', vendorId: 'V-001', amount: 2000,
    issuedDate: '2026-05-25', dueDate: '2026-06-24',
    terms: '2/10 net 30', discountPct: 0.02, discountDays: 10, netDays: 30,
    category: 'saas',
  }];
  const sa = optimise({
    invoices: aOnly, vendors, forecast,
    distressScores: { 'V-001': 0.08 },
  });
  check('(a) one entry produced',         sa.entries.length === 1);
  check('(a) reason auto-discount',       sa.entries[0]?.reason === 'auto-discount');
  check('(a) payDate = issued+10',        sa.entries[0]?.payDate === '2026-06-04');
  check('(a) projectedSaving = 40',       sa.entries[0]?.projectedSaving === 40);
  check('(a) no escalations',             sa.escalations.length === 0);

  // ============================================================
  // (b) Same invoice + tight forecast → pay-on-due (or stretch), no breach
  // ============================================================
  console.log('\n(b) tight forecast falls back to pay-on-due');
  const tight: Forecast = {
    openingCash: 3000, cashFloor: 1000, flows: [],
  };
  const sb = optimise({
    invoices: aOnly, vendors, forecast: tight,
    distressScores: { 'V-001': 0.08 },
  });
  // Discount would breach (3000 - 1960 = 1040 above floor — actually wait 1960 < 2000 so safe?)
  // Let's recalc: amountPaid (discount) = 2000 * 0.98 = 1960. cash 3000 - 1960 = 1040. floor 1000. buffer 40, NOT a breach.
  // So discount is OK. Need tighter:
  const tighter: Forecast = { openingCash: 2500, cashFloor: 1000, flows: [] };
  const sb2 = optimise({
    invoices: aOnly, vendors, forecast: tighter,
    distressScores: { 'V-001': 0.08 },
  });
  // 2500 - 1960 = 540 < 1000 floor. Breach. Discount falls through.
  // Pay-on-due 2000: 2500 - 2000 = 500. Still breach. Stretch.
  // Stretch up to 14 days: still 2500 - 2000 = 500. All breach.
  // Best-effort fallback: payDate = dueDate + 14, reason 'flagged'.
  check('(b) tight forecast yields entry',     sb2.entries.length === 1);
  const reasonOK = sb2.entries[0]?.reason === 'flagged' || sb2.entries[0]?.reason === 'auto-due';
  check('(b) reason is flagged or auto-due',   reasonOK, `got ${sb2.entries[0]?.reason}`);

  // ============================================================
  // (c) High-distress vendor → defer + escalation
  // ============================================================
  console.log('\n(c) distress defer');
  const cInv: Invoice[] = [{
    id: 'INV-C', vendorId: 'V-009', amount: 2000,
    issuedDate: '2026-05-15', dueDate: '2026-06-14',
    terms: 'net 30', netDays: 30, category: 'supplies',
  }];
  const sc = optimise({ invoices: cInv, vendors, forecast, distressScores: { 'V-009': 0.7 } });
  check('(c) escalation present',         sc.escalations.length === 1);
  check('(c) escalation has invoiceId',   sc.escalations[0]?.invoiceId === 'INV-C');
  // dueDate 2026-06-14 + 7d = 2026-06-21
  check('(c) payDate = dueDate + 7d',     sc.entries[0]?.payDate === '2026-06-21');

  // ============================================================
  // Seed determinism harness — exact escalation ID set
  // ============================================================
  console.log('\n(d/e) seed determinism harness');
  const full = optimise({ invoices, vendors, forecast, distressScores });

  const escalationIds = full.escalations.map((e) => e.invoiceId).sort();
  const expectedIds = ['INV-FLOOR-BREACH', 'INV-LARGE-NEW', 'INV-SPECTER-DISTRESSED'];
  check(
    `escalation IDs exactly = ${expectedIds.join(', ')}`,
    JSON.stringify(escalationIds) === JSON.stringify(expectedIds),
    `got ${JSON.stringify(escalationIds)}`,
  );

  // Invariant: full schedule never breaches.
  const fullSim = simulate(full.entries, forecast, new Map(invoices.map((i) => [i.id, i])));
  check('full schedule has zero internal breach', fullSim.breachDay === null,
    `breachDay=${fullSim.breachDay}, minBuffer=£${fullSim.minBuffer}`);

  // Naive baseline must show >= 1 breach.
  const baseline = optimise({ invoices, vendors, forecast, distressScores, forceNaive: true });
  const baselineSim = simulate(baseline.entries, forecast, new Map(invoices.map((i) => [i.id, i])));
  check('naive baseline produces a breach', baselineSim.breachDay !== null,
    `baseline breachDay=${baselineSim.breachDay}, minBuffer=£${baselineSim.minBuffer}`);

  // Total saving target (PRD: > £3500)
  check(`totalSaving >= £3500 (got £${full.totalSaving})`, full.totalSaving >= 3500);

  // Schedule entry count = invoice count
  check('40 entries returned', full.entries.length === 40);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
