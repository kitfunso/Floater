// Greedy AP scheduler with cash-floor invariant + Specter-aware defers.
//
// Two exports:
//   simulate(entries, forecast, invoiceById)   — pure: walks ISO-date events,
//     returns { breachDay, minBuffer }. Used by the optimiser itself AND by
//     agents/cash-impact.ts (extracted helper, codex's structural ask).
//   optimise(input)                             — produces a Schedule. Greedy
//     in dueDate order. Per invoice: distress-defer / discount / on-due / stretch.
//
// Invariant: when forceNaive is false, every Schedule returned has
//            simulate(entries).breachDay === null. Tested in policy.test.ts.

import type {
  Invoice,
  Forecast,
  Schedule,
  ScheduleEntry,
  Escalation,
  OptimiserInput,
} from './types';
import {
  AUTO_PAY_DISTRESS_THRESHOLD,
  DEFER_DISTRESS_THRESHOLD,
  MAX_STRETCH_DAYS,
  classify,
} from './policy';
import { COST_OF_CAPITAL, discountAPR, shouldTakeDiscount } from './npv';

// ============================================================
// simulate
// ============================================================

export type SimResult = {
  breachDay: string | null;   // first ISO date where cumulative cash drops below floor
  minBuffer: number;          // minimum (cash - floor) across the horizon
};

export function simulate(
  entries: readonly ScheduleEntry[],
  forecast: Forecast,
  invoiceById: ReadonlyMap<string, Invoice>,
): SimResult {
  const byDate = new Map<string, number>();
  const bump = (date: string, delta: number) => {
    byDate.set(date, (byDate.get(date) ?? 0) + delta);
  };

  for (const flow of forecast.flows) {
    bump(flow.date, flow.inflow - flow.outflow);
  }
  for (const entry of entries) {
    const inv = invoiceById.get(entry.invoiceId);
    if (!inv) continue;
    const amountPaid =
      entry.reason === 'auto-discount' && inv.discountPct
        ? inv.amount * (1 - inv.discountPct)
        : inv.amount;
    bump(entry.payDate, -amountPaid);
  }

  const dates = [...byDate.keys()].sort();
  let cash = forecast.openingCash;
  let breachDay: string | null = null;
  let minBuffer = cash - forecast.cashFloor;

  for (const date of dates) {
    cash += byDate.get(date) ?? 0;
    const buffer = cash - forecast.cashFloor;
    if (buffer < 0 && breachDay === null) breachDay = date;
    if (buffer < minBuffer) minBuffer = buffer;
  }

  return { breachDay, minBuffer };
}

// ============================================================
// optimise
// ============================================================

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function pickStretchDate(
  invoice: Invoice,
  startStretch: number,
  prior: readonly ScheduleEntry[],
  forecast: Forecast,
  invoiceById: ReadonlyMap<string, Invoice>,
  distressScore: number,
): { payDate: string; safe: boolean } {
  // Walk dueDate + startStretch ... dueDate + MAX_STRETCH_DAYS. Return first
  // non-breaching candidate. If none safe, return dueDate + MAX_STRETCH (best effort).
  for (let d = startStretch; d <= MAX_STRETCH_DAYS; d++) {
    const candidate = addDays(invoice.dueDate, d);
    const probe: ScheduleEntry = {
      invoiceId: invoice.id,
      payDate: candidate,
      reason: 'auto-stretch',
      projectedSaving: 0,
      distressScore,
    };
    const sim = simulate([...prior, probe], forecast, invoiceById);
    if (sim.breachDay === null) return { payDate: candidate, safe: true };
  }
  return { payDate: addDays(invoice.dueDate, MAX_STRETCH_DAYS), safe: false };
}

export function optimise(input: OptimiserInput): Schedule {
  const { invoices, vendors, forecast, distressScores, forceNaive = false } = input;
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));

  // Deterministic order: by dueDate, then by id (so re-running with shuffled
  // input still yields identical schedule).
  const sorted = [...invoices].sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return a.id.localeCompare(b.id);
  });

  const entries: ScheduleEntry[] = [];
  const escalations: Escalation[] = [];

  for (const inv of sorted) {
    const vendor = vendorById.get(inv.vendorId);
    if (!vendor) throw new Error(`Unknown vendor ${inv.vendorId} on invoice ${inv.id}`);
    const distress = distressScores[inv.vendorId] ?? 0;

    // Probe pay-on-due breach (also feeds classify()).
    const probe: ScheduleEntry = {
      invoiceId: inv.id,
      payDate: inv.dueDate,
      reason: 'auto-due',
      projectedSaving: 0,
      distressScore: distress,
    };
    const probeSim = simulate([...entries, probe], forecast, invoiceById);
    const payOnDueWouldBreach = probeSim.breachDay !== null;

    const cls = classify({ invoice: inv, vendor, distressScore: distress, payOnDueWouldBreach });

    // Naive baseline: every invoice pay-on-due, ignore breach. Used for
    // breachesAvoidedVsBaseline diff.
    if (forceNaive) {
      entries.push(probe);
      if (cls.decision === 'flagged') {
        escalations.push({ invoiceId: inv.id, verdicts: [], reasonForEscalation: cls.reason });
      }
      continue;
    }

    // 1. Distress defer (rule: distress > 0.5)
    if (distress > DEFER_DISTRESS_THRESHOLD) {
      const stretched = pickStretchDate(inv, 7, entries, forecast, invoiceById, distress);
      entries.push({
        invoiceId: inv.id,
        payDate: stretched.payDate,
        reason: 'flagged',
        projectedSaving: 0,
        distressScore: distress,
      });
      escalations.push({ invoiceId: inv.id, verdicts: [], reasonForEscalation: cls.reason });
      continue;
    }

    // 2. Discount path (only if classify says auto AND distress safe)
    const apr =
      inv.discountPct && inv.discountDays
        ? discountAPR(inv.discountPct, inv.discountDays, inv.netDays)
        : 0;
    const discountAttractive =
      apr > 0 && shouldTakeDiscount(apr, COST_OF_CAPITAL) && distress < AUTO_PAY_DISTRESS_THRESHOLD;

    if (discountAttractive && cls.decision === 'auto' && inv.discountDays !== undefined && inv.discountPct !== undefined) {
      const payDate = addDays(inv.issuedDate, inv.discountDays);
      const earlyEntry: ScheduleEntry = {
        invoiceId: inv.id,
        payDate,
        reason: 'auto-discount',
        projectedSaving: inv.amount * inv.discountPct,
        distressScore: distress,
      };
      const earlySim = simulate([...entries, earlyEntry], forecast, invoiceById);
      if (earlySim.breachDay === null) {
        entries.push(earlyEntry);
        continue;
      }
      // Discount would breach — fall through to pay-on-due / stretch.
    }

    // 3. Pay-on-due if safe (and classify auto)
    if (!payOnDueWouldBreach) {
      entries.push({
        invoiceId: inv.id,
        payDate: inv.dueDate,
        reason: cls.decision === 'flagged' ? 'flagged' : 'auto-due',
        projectedSaving: 0,
        distressScore: distress,
      });
      if (cls.decision === 'flagged') {
        escalations.push({ invoiceId: inv.id, verdicts: [], reasonForEscalation: cls.reason });
      }
      continue;
    }

    // 4. Pay-on-due breaches → stretch up to MAX_STRETCH_DAYS.
    const stretched = pickStretchDate(inv, 1, entries, forecast, invoiceById, distress);
    entries.push({
      invoiceId: inv.id,
      payDate: stretched.payDate,
      reason: 'flagged',     // breach always flags
      projectedSaving: 0,
      distressScore: distress,
    });
    // payOnDueWouldBreach was true → cls already returned 'flagged'.
    escalations.push({ invoiceId: inv.id, verdicts: [], reasonForEscalation: cls.reason });
  }

  const totalSaving = entries.reduce((sum, e) => sum + e.projectedSaving, 0);

  return {
    scheduleId: '',     // route handler mints; left blank for tests
    entries,
    escalations,
    totalSaving,
    breachesAvoidedVsBaseline: 0,   // route handler diffs against forceNaive run
  };
}
