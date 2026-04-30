'use client';

// Always-visible setup row. Shows the input dataset (bills, cash position,
// floor, horizon) so judges have the demo's setup line on screen before
// anyone clicks Optimise.

import type { Invoice, Forecast } from '@/lib/types';

type Props = {
  invoices: Invoice[];
  forecast: Forecast;
};

function gbp(n: number): string {
  return `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

export function SetupBand({ invoices, forecast }: Props) {
  const total = invoices.reduce((s, i) => s + i.amount, 0);
  const horizonDays = forecast.flows.length > 0
    ? Math.max(...forecast.flows.map((f) => daysBetween(forecast.flows[0]!.date, f.date)))
    : 60;

  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Inputs</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
          <Pair label="Bills" value={`${invoices.length} · ${gbp(total)}`} />
          <Pair label="Horizon" value={`${horizonDays} days`} />
          <Pair label="Opening cash" value={gbp(forecast.openingCash)} accent="sky" />
          <Pair label="Cash floor" value={gbp(forecast.cashFloor)} accent="rose" />
        </div>
      </div>
    </div>
  );
}

function Pair({ label, value, accent }: { label: string; value: string; accent?: 'sky' | 'rose' }) {
  const tone =
    accent === 'sky'  ? 'text-sky-700 dark:text-sky-300' :
    accent === 'rose' ? 'text-rose-700 dark:text-rose-300' :
    '';
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((db - da) / 86_400_000);
}
