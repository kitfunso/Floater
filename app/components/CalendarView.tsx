'use client';

// 60-day payment schedule. Using a coloured table sorted by payDate (Gantt
// fallback, per CLAUDE.md "spending >30 min on calendar visuals" guard).

import type { Schedule, Invoice, Vendor, Forecast } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

type Props = {
  schedule: Schedule | null;
  invoices: Invoice[];
  vendors: Vendor[];
  forecast: Forecast;
};

function gbp(n: number): string {
  return `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

const REASON_TONE: Record<string, string> = {
  'auto-discount': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  'auto-due':      'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  'auto-stretch':  'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  'flagged':       'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
};

const REASON_LABEL: Record<string, string> = {
  'auto-discount': 'discount',
  'auto-due':      'on due',
  'auto-stretch':  'stretch',
  'flagged':       'flagged',
};

export function CalendarView({ schedule, invoices, vendors }: Props) {
  if (!schedule) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Schedule</h2>
        <p className="text-sm text-muted-foreground mt-2">Optimise to populate the schedule.</p>
      </div>
    );
  }

  const invById = new Map(invoices.map((i) => [i.id, i]));
  const vendById = new Map(vendors.map((v) => [v.id, v]));
  const sorted = [...schedule.entries].sort((a, b) => a.payDate.localeCompare(b.payDate));

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Schedule</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sorted.length} payments, schedule id <code>{schedule.scheduleId}</code>
          </p>
        </div>
      </div>
      <div className="max-h-[480px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/70 backdrop-blur">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Pay date</th>
              <th className="px-4 py-2 font-medium">Invoice</th>
              <th className="px-4 py-2 font-medium">Vendor</th>
              <th className="px-4 py-2 font-medium text-right">Amount</th>
              <th className="px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2 font-medium">Specter</th>
              <th className="px-4 py-2 font-medium text-right">Saving</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => {
              const inv = invById.get(e.invoiceId);
              const vendor = inv ? vendById.get(inv.vendorId) : undefined;
              return (
                <tr key={e.invoiceId} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap">{e.payDate}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.invoiceId}</td>
                  <td className="px-4 py-2 truncate max-w-[180px]">{vendor?.name ?? inv?.vendorId ?? '-'}</td>
                  <td className="px-4 py-2 tabular-nums text-right">{inv ? gbp(inv.amount) : '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded border text-[11px] ${REASON_TONE[e.reason] ?? ''}`}>
                      {REASON_LABEL[e.reason] ?? e.reason}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <SpecterBadge score={e.distressScore} />
                  </td>
                  <td className="px-4 py-2 tabular-nums text-right text-emerald-700 dark:text-emerald-400">
                    {e.projectedSaving > 0 ? gbp(e.projectedSaving) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SpecterBadge({ score }: { score: number }) {
  const tone =
    score >= 0.5 ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30' :
    score >= 0.3 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' :
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-[11px] tabular-nums ${tone}`}>
      {score.toFixed(2)}
    </span>
  );
}
