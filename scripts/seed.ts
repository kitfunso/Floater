// Deterministic seed for Floater. Produces:
//   data/vendors.json    — 12 vendors (10 reliable, V-009 distressed in Specter, V-010 NEW)
//   data/invoices.json   — 40 invoices, hand-tuned so the optimiser yields exactly
//                          [INV-LARGE-NEW, INV-SPECTER-DISTRESSED, INV-FLOOR-BREACH]
//                          as the escalation set under DEMO_REPLAY=1.
//   data/cash-forecast.json — 60-day forecast: opening £80k, floor £40k,
//                          rent day 0, AR every Friday £30k, payroll days 28 + 56.
//
// Run: npx tsx scripts/seed.ts
//
// No RNG. Re-running produces byte-identical output.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Invoice, Vendor, Forecast, CashFlow } from '../lib/types';

const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');

// Forecast opens 2026-05-04 (Monday). Day 0 = 2026-05-04. Day 59 = 2026-07-02.
const OPENING_DATE = new Date('2026-05-04T00:00:00Z');

function dayToISO(day: number): string {
  const d = new Date(OPENING_DATE);
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}

// ============================================================
// Vendors
// ============================================================

const vendors: Vendor[] = [
  { id: 'V-001', name: 'Acme Office Supplies',  specterId: 'specter-clean-1',  paymentHistory: 'reliable', strategicTier: 3 },
  { id: 'V-002', name: 'Brightleaf Logistics',  specterId: 'specter-clean-2',  paymentHistory: 'reliable', strategicTier: 2 },
  { id: 'V-003', name: 'Coral Cloud Hosting',   specterId: 'specter-clean-3',  paymentHistory: 'reliable', strategicTier: 1 },
  { id: 'V-004', name: 'Dunbar Print Services', specterId: 'specter-clean-4',  paymentHistory: 'reliable', strategicTier: 3 },
  { id: 'V-005', name: 'Evergreen Catering',    specterId: 'specter-clean-5',  paymentHistory: 'reliable', strategicTier: 3 },
  { id: 'V-006', name: 'Fjord Software Ltd',    specterId: 'specter-clean-6',  paymentHistory: 'reliable', strategicTier: 1 },
  { id: 'V-007', name: 'Greenline Couriers',    specterId: 'specter-clean-7',  paymentHistory: 'reliable', strategicTier: 2 },
  { id: 'V-008', name: 'Halcyon Energy Co',     specterId: 'specter-clean-8',  paymentHistory: 'reliable', strategicTier: 1 },
  { id: 'V-009', name: 'Iridium Components',    specterId: 'specter-distressed-1', paymentHistory: 'reliable', strategicTier: 2 }, // distressed in Specter fixture
  { id: 'V-010', name: 'Jade Studios (NEW)',                                paymentHistory: 'new',      strategicTier: 3 }, // no specterId, no history
  { id: 'V-011', name: 'Kindred Legal LLP',     specterId: 'specter-clean-9',  paymentHistory: 'reliable', strategicTier: 2 },
  { id: 'V-012', name: 'Larkspur Marketing',    specterId: 'specter-clean-10', paymentHistory: 'reliable', strategicTier: 3 },
];

// ============================================================
// Forecast
// ============================================================
//
// AR £40k each (8×£40k = £320k) leaves enough headroom that DISC pay-earlies
// clustered in days 2-15 don't push the schedule under the floor on the same
// day INV-FB stretches to. Math:
//   cash7 (no INV-FB) ≈ 80 - 8 - 31.5 (INV-EARLY) + 40 (AR day 4) = £80.5k
//   pay INV-FB £45k → £35.5k → below £40k floor → BREACH triggers
//   stretch INV-FB to day 11: 80.5 + 40 (AR 11) - 45 = £75.5k buffer for the
//   ~£32k of DISC pay-earlies that land days 2-15 → still above floor.

const forecast: Forecast = (() => {
  const flows: CashFlow[] = [];
  flows.push({ date: dayToISO(0), inflow: 0, outflow: 8_000, label: 'Office rent' });
  // Day-4 AR is intentionally smaller to keep day-7 cash tight enough that
  // INV-FB at £45k pay-on-due breaches the floor. Subsequent ARs are larger
  // so DISC pay-earlies clustered days 8-30 don't cascade into breaches.
  flows.push({ date: dayToISO(4),  inflow: 30_000, outflow: 0, label: 'AR receipt' });
  for (const day of [11, 18, 25, 32, 39, 46, 53]) {
    flows.push({ date: dayToISO(day), inflow: 45_000, outflow: 0, label: 'AR receipt' });
  }
  flows.push({ date: dayToISO(28), inflow: 0, outflow: 30_000, label: 'Payroll' });
  flows.push({ date: dayToISO(56), inflow: 0, outflow: 30_000, label: 'Payroll' });
  return {
    openingCash: 80_000,
    cashFloor: 40_000,
    flows,
  };
})();

// ============================================================
// Invoices
// ============================================================

type InvoiceSeed = {
  id: string;
  vendorId: string;
  amount: number;
  dueDay: number;
  netDays: number;
  discountPct?: number;
  discountDays?: number;
  category: string;
};

function buildInvoice(s: InvoiceSeed): Invoice {
  const issuedDay = s.dueDay - s.netDays;
  const terms =
    s.discountPct && s.discountDays
      ? `${(s.discountPct * 100).toFixed(0)}/${s.discountDays} net ${s.netDays}`
      : `net ${s.netDays}`;
  return {
    id: s.id,
    vendorId: s.vendorId,
    amount: s.amount,
    issuedDate: dayToISO(issuedDay),
    dueDate: dayToISO(s.dueDay),
    terms,
    discountPct: s.discountPct,
    discountDays: s.discountDays,
    netDays: s.netDays,
    category: s.category,
  };
}

const seeds: InvoiceSeed[] = [];

// ----- 3 escalation invoices -----
seeds.push({
  id: 'INV-LARGE-NEW',
  vendorId: 'V-010',                  // new vendor, no history
  amount: 8_000,                      // > £5k auto-pay threshold
  dueDay: 20,
  netDays: 30,
  category: 'professional',
});
seeds.push({
  id: 'INV-SPECTER-DISTRESSED',
  vendorId: 'V-009',                  // Specter fixture returns 0.72
  amount: 3_500,                      // < £5k, but distress > 0.3 fails the rule
  dueDay: 20,
  netDays: 30,
  category: 'supplies',
});
seeds.push({
  id: 'INV-FLOOR-BREACH',
  vendorId: 'V-001',                  // reliable, low distress, but pay-on-due breaches floor
  amount: 45_000,
  dueDay: 7,                          // forces day-7 cash crunch
  netDays: 30,
  category: 'logistics',
});

// ----- 7 plain net 30 invoices, dueDays 1..6 (forces day-7 floor pressure) -----
const earlySeeds: Array<[string, number, number]> = [
  // [vendorId, dueDay, amount]
  ['V-002', 1, 4500],
  ['V-003', 2, 4400],
  ['V-004', 3, 4600],
  ['V-005', 4, 4500],
  ['V-006', 5, 4400],
  ['V-007', 6, 4500],
  ['V-008', 6, 4600],
];
earlySeeds.forEach(([vendorId, dueDay, amount], i) => {
  seeds.push({
    id: `INV-EARLY-${String(i + 1).padStart(2, '0')}`,
    vendorId: vendorId!,
    amount: amount!,
    dueDay: dueDay!,
    netDays: 30,
    category: 'supplies',
  });
});

// ----- 18 invoices with 5/10 net 30 (the auto-discount workhorses) -----
// dueDays bounded [22, 50] so pay-early dates (issuedDay+10) are >= day 2 and
// <= day 30 — funded by AR receipts before the post-day-53 dry period.
const fiveTenVendors = ['V-001','V-002','V-003','V-004','V-006','V-007','V-008','V-011','V-012'];
const fiveTenSchedule: Array<[number, number]> = [
  // [dueDay, amount]   — every amount under £5k auto-pay threshold
  [22, 4300], [24, 4400], [26, 4200], [28, 4500],
  [30, 4300], [32, 4100], [34, 4400], [36, 4300],
  [38, 4500], [40, 4200], [41, 4300], [43, 4400],
  [45, 4300], [46, 4200], [48, 4400], [49, 4300],
  [50, 4500], [50, 4100],
];
fiveTenSchedule.forEach(([dueDay, amount], i) => {
  seeds.push({
    id: `INV-DISC5-${String(i + 1).padStart(2, '0')}`,
    vendorId: fiveTenVendors[i % fiveTenVendors.length]!,
    amount: amount!,
    dueDay: dueDay!,
    netDays: 30,
    discountPct: 0.05,
    discountDays: 10,
    category: 'saas',
  });
});

// ----- 9 invoices with 2/10 net 30 -----
const twoTenVendors = ['V-007','V-008','V-011','V-012','V-002','V-003','V-001','V-004','V-006'];
const twoTenSchedule: Array<[number, number]> = [
  [21, 1500], [25, 1700], [29, 1400], [31, 1600], [37, 1800],
  [42, 1500], [44, 1700], [47, 1400], [49, 1600],
];
twoTenSchedule.forEach(([dueDay, amount], i) => {
  seeds.push({
    id: `INV-DISC2-${String(i + 1).padStart(2, '0')}`,
    vendorId: twoTenVendors[i]!,
    amount: amount!,
    dueDay: dueDay!,
    netDays: 30,
    discountPct: 0.02,
    discountDays: 10,
    category: 'professional',
  });
});

// ----- 3 plain net 30 mid-window invoices -----
const plainMidSeeds: Array<[string, number, number]> = [
  ['V-005', 23, 1100],
  ['V-005', 35, 900],
  ['V-005', 44, 1000],
];
plainMidSeeds.forEach(([vendorId, dueDay, amount], i) => {
  seeds.push({
    id: `INV-PLAIN-${String(i + 1).padStart(2, '0')}`,
    vendorId: vendorId!,
    amount: amount!,
    dueDay: dueDay!,
    netDays: 30,
    category: 'other',
  });
});

const invoices: Invoice[] = seeds.map(buildInvoice);

// ============================================================
// Sanity assertions before writing
// ============================================================

if (invoices.length !== 40) {
  throw new Error(`Expected 40 invoices, got ${invoices.length}`);
}
const escalationIds = new Set(['INV-LARGE-NEW', 'INV-SPECTER-DISTRESSED', 'INV-FLOOR-BREACH']);
for (const id of escalationIds) {
  if (!invoices.find((inv) => inv.id === id)) throw new Error(`Missing escalation invoice ${id}`);
}

const discountTotal = invoices
  .filter((inv) => inv.discountPct && inv.discountDays)
  .reduce((sum, inv) => sum + inv.amount * (inv.discountPct ?? 0), 0);
console.log(`Max possible discount saving (if every discount captured): £${discountTotal.toFixed(2)}`);

// ============================================================
// Write
// ============================================================

mkdirSync(DATA, { recursive: true });
writeFileSync(join(DATA, 'vendors.json'),       JSON.stringify(vendors,  null, 2) + '\n');
writeFileSync(join(DATA, 'invoices.json'),      JSON.stringify(invoices, null, 2) + '\n');
writeFileSync(join(DATA, 'cash-forecast.json'), JSON.stringify(forecast, null, 2) + '\n');

console.log(`Wrote ${invoices.length} invoices, ${vendors.length} vendors, forecast (${forecast.flows.length} flows)`);
