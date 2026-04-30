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

  const trajectory = buildTrajectory(forecast);

  return (
    <div className="rounded-lg border bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Inputs</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
          <Pair label="Bills" value={`${invoices.length} · ${gbp(total)}`} />
          <Pair label="Horizon" value={`${horizonDays} days`} />
          <Pair label="Opening cash" value={gbp(forecast.openingCash)} accent="sky" />
          <Pair label="Cash floor" value={gbp(forecast.cashFloor)} accent="rose" />
        </div>
      </div>
      <CashChart trajectory={trajectory} floor={forecast.cashFloor} />
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

type Point = { day: number; cash: number };

function buildTrajectory(forecast: Forecast): Point[] {
  if (forecast.flows.length === 0) return [{ day: 0, cash: forecast.openingCash }];
  const sorted = [...forecast.flows].sort((a, b) => a.date.localeCompare(b.date));
  const day0 = sorted[0]!.date;
  const byDay = new Map<number, number>();
  for (const f of sorted) {
    const d = daysBetween(day0, f.date);
    byDay.set(d, (byDay.get(d) ?? 0) + f.inflow - f.outflow);
  }
  const maxDay = Math.max(...byDay.keys());
  const pts: Point[] = [];
  let cash = forecast.openingCash;
  for (let d = 0; d <= maxDay; d++) {
    cash += byDay.get(d) ?? 0;
    pts.push({ day: d, cash });
  }
  return pts;
}

function CashChart({ trajectory, floor }: { trajectory: Point[]; floor: number }) {
  if (trajectory.length < 2) return null;
  const W = 600, H = 140, PX = 36, PY = 16;
  const maxDay = trajectory[trajectory.length - 1]!.day;
  const allCash = trajectory.map((p) => p.cash);
  const minC = Math.min(...allCash, floor) * 0.9;
  const maxC = Math.max(...allCash) * 1.05;

  const x = (d: number) => PX + ((d / maxDay) * (W - PX * 2));
  const y = (c: number) => PY + ((1 - (c - minC) / (maxC - minC)) * (H - PY * 2));

  const line = trajectory.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p.cash).toFixed(1)}`).join(' ');
  const area = line + ` L${x(maxDay).toFixed(1)},${y(minC).toFixed(1)} L${x(0).toFixed(1)},${y(minC).toFixed(1)} Z`;
  const floorY = y(floor);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-36 select-none" preserveAspectRatio="none">
      <defs>
        <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.15 220)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="oklch(0.72 0.15 220)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#cashGrad)" />
      <path d={line} fill="none" stroke="oklch(0.72 0.15 220)" strokeWidth="2" strokeLinejoin="round" />
      <line x1={PX} y1={floorY} x2={W - PX} y2={floorY} stroke="oklch(0.63 0.2 25)" strokeWidth="1" strokeDasharray="4 3" />
      <text x={W - PX + 4} y={floorY + 4} fill="oklch(0.63 0.2 25)" fontSize="10" fontFamily="monospace">floor £{(floor / 1000).toFixed(0)}k</text>
      <text x={PX - 4} y={y(trajectory[0]!.cash) - 6} fill="oklch(0.72 0.15 220)" fontSize="10" fontFamily="monospace" textAnchor="end">
        £{(trajectory[0]!.cash / 1000).toFixed(0)}k
      </text>
    </svg>
  );
}
