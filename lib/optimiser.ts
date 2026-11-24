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

export type SimResult = {
  breachDay: string | null;
  minBuffer: number;
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

    if (forceNaive) {
      entries.push(probe);
      if (cls.decision === 'flagged') {
        escalations.push({ invoiceId: inv.id, verdicts: [], reasonForEscalation: cls.reason });
      }
      continue;
    }

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

    const stretched = pickStretchDate(inv, 1, entries, forecast, invoiceById, distress);
    entries.push({
      invoiceId: inv.id,
      payDate: stretched.payDate,
      reason: 'flagged',     // breach always flags
      projectedSaving: 0,
      distressScore: distress,
    });
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
