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
  // Start at openingCash BEFORE any day-0 flows so the chart matches
  // the setup band's "Opening cash £80k". Day-0 rent drop is visible
  // as the first step down on the line.
  pts.push({ day: 0, cash });
  for (let d = 0; d <= maxDay; d++) {
    const delta = byDay.get(d) ?? 0;
    if (delta !== 0) {
      cash += delta;
      pts.push({ day: d, cash });
    }
  }
  return pts;
}

function CashChart({ trajectory, floor }: { trajectory: Point[]; floor: number }) {
  if (trajectory.length < 2) return null;

  const W = 640, H = 200;
  const ML = 52, MR = 16, MT = 20, MB = 32; // margins
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;

  const maxDay = trajectory[trajectory.length - 1]!.day;
  const allCash = trajectory.map((p) => p.cash);
  const rawMin = Math.min(...allCash, floor);
  const rawMax = Math.max(...allCash);
  const pad = (rawMax - rawMin) * 0.12;
  const minC = rawMin - pad;
  const maxC = rawMax + pad;

  const x = (d: number) => ML + (d / maxDay) * plotW;
  const y = (c: number) => MT + (1 - (c - minC) / (maxC - minC)) * plotH;

  // Y-axis tick values (4-5 nice ticks)
  const yTicks = niceTicksK(minC, maxC, 5);
  // X-axis ticks every 7 days
  const xTicks: number[] = [];
  for (let d = 0; d <= maxDay; d += 7) xTicks.push(d);

  const line = trajectory.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p.cash).toFixed(1)}`
  ).join(' ');

  const areaPath = line +
    ` L${x(maxDay).toFixed(1)},${(MT + plotH).toFixed(1)}` +
    ` L${x(0).toFixed(1)},${(MT + plotH).toFixed(1)} Z`;

  const floorY = y(floor);

  // Key moments: payroll dips (local minima)
  // Only annotate payroll dips well past the opening (skip day <= 7 to avoid
  // cluttering the opening dot area). Skip the peak too — y-axis labels cover it.
  const annotations: { day: number; cash: number; label: string }[] = [];
  for (let i = 1; i < trajectory.length - 1; i++) {
    const prev = trajectory[i - 1]!.cash;
    const curr = trajectory[i]!.cash;
    const next = trajectory[i + 1]!.cash;
    if (curr < prev && curr <= next && trajectory[i]!.day > 7) {
      annotations.push({ day: trajectory[i]!.day, cash: curr, label: `£${(curr / 1000).toFixed(0)}k` });
    }
  }

  return (
    <div className="relative">
      <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">60-day cash projection (before invoice payments)</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
        <defs>
          <linearGradient id="cashAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.72 0.15 220)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="oklch(0.72 0.15 220)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="floorAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.63 0.2 25)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="oklch(0.63 0.2 25)" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((v) => (
          <g key={`yt-${v}`}>
            <line x1={ML} y1={y(v)} x2={ML + plotW} y2={y(v)} stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
            <text x={ML - 6} y={y(v) + 3.5} fill="currentColor" fillOpacity="0.4" fontSize="9" fontFamily="ui-monospace, monospace" textAnchor="end">
              £{(v / 1000).toFixed(0)}k
            </text>
          </g>
        ))}
        {xTicks.map((d) => (
          <g key={`xt-${d}`}>
            <line x1={x(d)} y1={MT} x2={x(d)} y2={MT + plotH} stroke="currentColor" strokeOpacity="0.05" strokeWidth="1" />
            <text x={x(d)} y={MT + plotH + 14} fill="currentColor" fillOpacity="0.4" fontSize="9" fontFamily="ui-monospace, monospace" textAnchor="middle">
              D{d}
            </text>
          </g>
        ))}

        {/* Floor danger zone */}
        <rect x={ML} y={floorY} width={plotW} height={MT + plotH - floorY} fill="url(#floorAreaGrad)" />

        {/* Cash area + line */}
        <path d={areaPath} fill="url(#cashAreaGrad)" />
        <path d={line} fill="none" stroke="oklch(0.72 0.15 220)" strokeWidth="2" strokeLinejoin="round" />

        {/* Floor line */}
        <line x1={ML} y1={floorY} x2={ML + plotW} y2={floorY} stroke="oklch(0.63 0.2 25)" strokeWidth="1.5" strokeDasharray="6 4" />
        <text x={ML + plotW + 4} y={floorY + 4} fill="oklch(0.63 0.2 25)" fontSize="10" fontWeight="600" fontFamily="ui-monospace, monospace">
          FLOOR
        </text>

        {/* Annotation dots + labels */}
        {annotations.map((a, i) => (
          <g key={`ann-${i}`}>
            <circle cx={x(a.day)} cy={y(a.cash)} r="3" fill="oklch(0.72 0.15 220)" stroke="white" strokeWidth="1.5" />
            <text
              x={x(a.day)}
              y={y(a.cash) + (a.cash === rawMax ? -10 : 14)}
              fill="currentColor"
              fillOpacity="0.6"
              fontSize="9"
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
            >
              {a.label}
            </text>
          </g>
        ))}

        {/* Opening marker */}
        <circle cx={x(0)} cy={y(trajectory[0]!.cash)} r="3.5" fill="oklch(0.72 0.15 220)" stroke="white" strokeWidth="2" />
        <text x={x(0) + 8} y={y(trajectory[0]!.cash) - 8} fill="oklch(0.72 0.15 220)" fontSize="10" fontWeight="600" fontFamily="ui-monospace, monospace">
          £{(trajectory[0]!.cash / 1000).toFixed(0)}k open
        </text>

        {/* Axis lines */}
        <line x1={ML} y1={MT} x2={ML} y2={MT + plotH} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
        <line x1={ML} y1={MT + plotH} x2={ML + plotW} y2={MT + plotH} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
      </svg>
    </div>
  );
}

function niceTicksK(min: number, max: number, count: number): number[] {
  const range = max - min;
  const rough = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const nice = rough / mag >= 5 ? 10 * mag : rough / mag >= 2 ? 5 * mag : 2 * mag;
  const start = Math.ceil(min / nice) * nice;
  const ticks: number[] = [];
  for (let v = start; v <= max; v += nice) ticks.push(v);
  return ticks;
}
