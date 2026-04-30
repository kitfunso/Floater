'use client';

import { useEffect, useState } from 'react';
import type { Invoice, Schedule } from '@/lib/types';

type Props = {
  invoices: Invoice[];
  schedule: Schedule | null;
  executeResult: { executed: number; approved: number; deferred: number; rejected: number } | null;
};

function gbp(n: number): string {
  return `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

// Tween a number from 0 → target over `duration` ms with eased steps.
function useCountUp(target: number, duration = 1200): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target === 0) { setV(0); return; }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setV(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

export function SavingsCounter({ invoices, schedule, executeResult }: Props) {
  if (!schedule) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Click <strong>Optimise</strong> to run the scheduler.
      </div>
    );
  }
  const flagged = schedule.entries.filter((e) => e.reason === 'flagged').length;
  const autoPaid = schedule.entries.length - flagged;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const savingTween = useCountUp(schedule.totalSaving);

  const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0);
  const totalAfter = totalInvoiced - schedule.totalSaving;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      <Stat label="Total invoiced" value={gbp(totalInvoiced)} />
      <Stat label="After discounts" value={gbp(totalAfter)} accent="emerald" subtitle={`${gbp(savingTween)} saved`} />
      <Stat label="Floor breaches avoided" value={schedule.breachesAvoidedVsBaseline.toString()} accent="emerald" />
      <Stat label="Auto-paid silently" value={`${autoPaid} / ${schedule.entries.length}`} />
      <Stat label="Flagged for human" value={flagged.toString()} accent="amber" />
      <Stat label="Discount captured" value={`${((schedule.totalSaving / totalInvoiced) * 100).toFixed(1)}%`} accent="emerald" />
      {executeResult && (
        <div className="col-span-2 md:col-span-4 mt-2 text-sm rounded-md border bg-muted/50 p-3">
          Schedule executed: <strong>{executeResult.executed}</strong> payments committed (
          <strong>{executeResult.approved}</strong> approved, <strong>{executeResult.deferred}</strong> deferred, <strong>{executeResult.rejected}</strong> rejected).
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent, subtitle }: { label: string; value: string; accent?: 'emerald' | 'amber'; subtitle?: string }) {
  const accentCls =
    accent === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/5' :
    accent === 'amber'   ? 'border-amber-500/30 bg-amber-500/5' :
    '';
  return (
    <div className={`rounded-lg border p-4 ${accentCls}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      {subtitle && <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5 font-medium">{subtitle}</div>}
    </div>
  );
}
