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
  const distressScores: DistressMap = {};
  await Promise.all(vendors.map(async (v) => {
    const sig = await getDistressScore(v.specterId);
    distressScores[v.id] = sig.score;
  }));

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

  console.log('\n(b) tight forecast falls back to pay-on-due');
  const tight: Forecast = {
    openingCash: 3000, cashFloor: 1000, flows: [],
  };
  const sb = optimise({
    invoices: aOnly, vendors, forecast: tight,
    distressScores: { 'V-001': 0.08 },
  });
  const tighter: Forecast = { openingCash: 2500, cashFloor: 1000, flows: [] };
  const sb2 = optimise({
    invoices: aOnly, vendors, forecast: tighter,
    distressScores: { 'V-001': 0.08 },
  });
  check('(b) tight forecast yields entry',     sb2.entries.length === 1);
  const reasonOK = sb2.entries[0]?.reason === 'flagged' || sb2.entries[0]?.reason === 'auto-due';
  check('(b) reason is flagged or auto-due',   reasonOK, `got ${sb2.entries[0]?.reason}`);

  console.log('\n(c) distress defer');
  const cInv: Invoice[] = [{
    id: 'INV-C', vendorId: 'V-009', amount: 2000,
    issuedDate: '2026-05-15', dueDate: '2026-06-14',
    terms: 'net 30', netDays: 30, category: 'supplies',
  }];
  const sc = optimise({ invoices: cInv, vendors, forecast, distressScores: { 'V-009': 0.7 } });
  check('(c) escalation present',         sc.escalations.length === 1);
  check('(c) escalation has invoiceId',   sc.escalations[0]?.invoiceId === 'INV-C');
  check('(c) payDate = dueDate + 7d',     sc.entries[0]?.payDate === '2026-06-21');

  console.log('\n(d/e) seed determinism harness');
  const full = optimise({ invoices, vendors, forecast, distressScores });

  const escalationIds = full.escalations.map((e) => e.invoiceId).sort();
  const expectedIds = ['INV-FLOOR-BREACH', 'INV-LARGE-NEW', 'INV-SPECTER-DISTRESSED'];
  check(
    `escalation IDs exactly = ${expectedIds.join(', ')}`,
    JSON.stringify(escalationIds) === JSON.stringify(expectedIds),
    `got ${JSON.stringify(escalationIds)}`,
  );

  const fullSim = simulate(full.entries, forecast, new Map(invoices.map((i) => [i.id, i])));
  check('full schedule has zero internal breach', fullSim.breachDay === null,
    `breachDay=${fullSim.breachDay}, minBuffer=£${fullSim.minBuffer}`);

  const baseline = optimise({ invoices, vendors, forecast, distressScores, forceNaive: true });
  const baselineSim = simulate(baseline.entries, forecast, new Map(invoices.map((i) => [i.id, i])));
  check('naive baseline produces a breach', baselineSim.breachDay !== null,
    `baseline breachDay=${baselineSim.breachDay}, minBuffer=£${baselineSim.minBuffer}`);

  check(`totalSaving >= £3500 (got £${full.totalSaving})`, full.totalSaving >= 3500);

  check('40 entries returned', full.entries.length === 40);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
