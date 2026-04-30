// Deterministic seed for Floater. Produces:
//   data/vendors.json    — 12 vendors (10 reliable, 1 distressed (V-009), 1 new (V-010))
//   data/invoices.json   — 40 invoices, hand-tuned so the optimiser yields exactly
//                          [INV-LARGE-NEW, INV-SPECTER-DISTRESSED, INV-FLOOR-BREACH]
//                          as the escalation set under DEMO_REPLAY=1.
//   data/cash-forecast.json — 60-day forecast: opening £80k, floor £40k,
//                          rent day 0, AR every Friday, payroll days 28 + 56.
//
// Run: npx tsx scripts/seed.ts
//
// No RNG. Re-running this script produces byte-identical output.

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

const forecast: Forecast = (() => {
  const flows: CashFlow[] = [];
  flows.push({ date: dayToISO(0), inflow: 0, outflow: 8_000, label: 'Office rent' });
  // AR receipts every Friday: opening Mon 2026-05-04, so first Fri is day 4.
  for (const day of [4, 11, 18, 25, 32, 39, 46, 53]) {
    flows.push({ date: dayToISO(day), inflow: 20_000, outflow: 0, label: 'AR receipt' });
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
  netDays: number;          // 30 typical
  discountPct?: number;     // 0.02 or 0.05
  discountDays?: number;    // 10
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

// ----- 5 plain net 30 invoices, due days 1..6 (forces day-7 floor pressure) -----
const earlyVendors = ['V-002', 'V-003', 'V-004', 'V-005', 'V-006'];
for (let i = 0; i < 5; i++) {
  seeds.push({
    id: `INV-EARLY-${String(i + 1).padStart(2, '0')}`,
    vendorId: earlyVendors[i]!,
    amount: 3_000 + i * 200,           // 3000, 3200, 3400, 3600, 3800 = £17k total
    dueDay: i + 2,                     // due days 2..6
    netDays: 30,
    category: 'supplies',
  });
}

// ----- 26 invoices with 5/10 net 30 (the auto-discount workhorses) -----
// Hand-picked amounts/dates so total ≥ £70k → saving £3500.
// Issued days vary; due days spread across 15..58. Pay-early dates = issued + 10.
const fiveTenVendors = ['V-001','V-002','V-003','V-004','V-006','V-007','V-008','V-011','V-012'];
const fiveTenSchedule: Array<[number, number]> = [
  // [dueDay, amount]
  [15, 2700], [17, 2800], [19, 2500], [22, 2900], [24, 2600], [26, 2700],
  [29, 2800], [31, 2500], [33, 2900], [35, 2600], [37, 2700], [38, 2800],
  [40, 2500], [42, 2900], [44, 2600], [45, 2700], [47, 2800], [49, 2500],
  [51, 2900], [52, 2600], [54, 2700], [55, 2800], [56, 2500], [57, 2900],
  [58, 2600], [58, 2700],
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

// ----- 6 invoices with 2/10 net 30 -----
const twoTenVendors = ['V-007','V-008','V-011','V-012','V-002','V-003'];
const twoTenSchedule: Array<[number, number]> = [
  [16, 1400], [25, 1500], [30, 1600], [40, 1500], [48, 1400], [55, 1600],
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

// Discount eligibility headline (saving floor for the demo metric).
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
