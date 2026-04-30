'use client';

import type { Schedule } from '@/lib/types';

type Props = {
  schedule: Schedule | null;
  executeResult: { executed: number; approved: number; deferred: number; rejected: number } | null;
};

function gbp(n: number): string {
  return `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

export function SavingsCounter({ schedule, executeResult }: Props) {
  if (!schedule) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Click <strong>Optimise</strong> to run the scheduler.
      </div>
    );
  }
  const flagged = schedule.entries.filter((e) => e.reason === 'flagged').length;
  const autoPaid = schedule.entries.length - flagged;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat label="£ saved (vs naive)" value={gbp(schedule.totalSaving)} accent="emerald" />
      <Stat label="Floor breaches avoided" value={schedule.breachesAvoidedVsBaseline.toString()} accent="emerald" />
      <Stat label="Auto-paid silently" value={`${autoPaid} / ${schedule.entries.length}`} />
      <Stat label="Flagged for human" value={flagged.toString()} accent="amber" />
      {executeResult && (
        <div className="col-span-2 md:col-span-4 mt-2 text-sm rounded-md border bg-muted/50 p-3">
          Schedule executed: <strong>{executeResult.executed}</strong> payments committed (
          <strong>{executeResult.approved}</strong> approved, <strong>{executeResult.deferred}</strong> deferred, <strong>{executeResult.rejected}</strong> rejected).
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'amber' }) {
  const accentCls =
    accent === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/5' :
    accent === 'amber'   ? 'border-amber-500/30 bg-amber-500/5' :
    '';
  return (
    <div className={`rounded-lg border p-4 ${accentCls}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
