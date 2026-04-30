'use client';

// Top-level client component. Holds page state (schedule, decisions) and
// dispatches API calls. Renders the Calendar, SavingsCounter, PolicyPanel,
// EscalationPanel.

import { useState } from 'react';
import type { Invoice, Vendor, Forecast, Schedule } from '@/lib/types';
import type { PolicyRule } from '@/lib/policy';
import { CalendarView } from './CalendarView';
import { SavingsCounter } from './SavingsCounter';
import { PolicyPanel } from './PolicyPanel';
import { EscalationPanel } from './EscalationPanel';
import { SetupBand } from './SetupBand';
import { Button } from '@/components/ui/button';

type Props = {
  invoices: Invoice[];
  vendors: Vendor[];
  forecast: Forecast;
  autoPayRules: readonly PolicyRule[];
  escalateRules: readonly PolicyRule[];
};

export function Dashboard({ invoices, vendors, forecast, autoPayRules, escalateRules }: Props) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [optimising, setOptimising] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<{ executed: number; approved: number; deferred: number; rejected: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<{ invoiceId: string; verdict: 'approve' | 'defer' | 'reject' }[]>([]);

  async function runOptimise() {
    setOptimising(true);
    setError(null);
    setExecuteResult(null);
    try {
      const res = await fetch('/api/optimise', { method: 'POST' });
      if (!res.ok) throw new Error(`/api/optimise returned ${res.status}`);
      const data: Schedule = await res.json();
      setSchedule(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOptimising(false);
    }
  }

  async function runExecute() {
    if (!schedule) return;
    setExecuting(true);
    try {
      const autoPayCount = schedule.entries.filter((e) => e.reason !== 'flagged').length;
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scheduleId: schedule.scheduleId,
          autoPayCount,
          decisions,
        }),
      });
      const data = await res.json();
      setExecuteResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExecuting(false);
    }
  }

  // Demo flow step inferred from state: 1 Optimise -> 2 Investigate -> 3 Specter -> 4 Execute
  const currentStep = !schedule ? 1
    : decisions.length === 0 ? 2
    : executeResult ? 4
    : 3;

  return (
    <main className="min-h-screen p-6 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-emerald-500/20">F</div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Floater</h1>
            <p className="text-sm text-muted-foreground">
              AP scheduling agent. Auto-pay clean invoices, escalate the wobbly ones.
            </p>
          </div>
          <span className="ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live demo
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={runOptimise} disabled={optimising} size="lg">
            {optimising ? 'Optimising…' : 'Optimise'}
          </Button>
          <Button
            onClick={runExecute}
            disabled={executing || !schedule}
            variant="secondary"
            size="lg"
          >
            {executing ? 'Executing…' : 'Execute schedule'}
          </Button>
        </div>
      </header>

      <DemoStepper current={currentStep} />

      <SetupBand invoices={invoices} forecast={forecast} />

      <SavingsCounter schedule={schedule} executeResult={executeResult} />

      {error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          Error: {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <CalendarView
            schedule={schedule}
            invoices={invoices}
            vendors={vendors}
            forecast={forecast}
          />
          <EscalationPanel
            schedule={schedule}
            invoices={invoices}
            vendors={vendors}
            onScheduleChange={setSchedule}
            onDecisionRecorded={(d) => setDecisions((arr) => [...arr, d])}
          />
        </div>
        <PolicyPanel autoPayRules={autoPayRules} escalateRules={escalateRules} />
      </div>
    </main>
  );
}

function DemoStepper({ current }: { current: number }) {
  const steps = [
    { n: 1, label: 'Optimise',      hint: 'click Optimise' },
    { n: 2, label: 'Investigate',   hint: 'expand a flagged card' },
    { n: 3, label: 'Specter alert', hint: 'trigger the alert' },
    { n: 4, label: 'Execute',       hint: 'commit the schedule' },
  ];
  return (
    <ol className="flex items-center gap-1 text-xs overflow-x-auto">
      {steps.map((s, i) => {
        const done = current > s.n;
        const active = current === s.n;
        return (
          <li key={s.n} className="flex items-center gap-1 shrink-0">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
              active ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shadow-sm shadow-emerald-500/10' :
              done ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700/80 dark:text-emerald-400/80' :
              'border-border bg-muted/30 text-muted-foreground'
            }`}>
              <span className={`inline-flex items-center justify-center size-5 rounded-full text-[10px] font-bold ${
                active ? 'bg-emerald-500 text-white animate-pulse' :
                done ? 'bg-emerald-500/80 text-white' :
                'bg-muted text-muted-foreground'
              }`}>{done ? '✓' : s.n}</span>
              <span className="font-medium">{s.label}</span>
              {active && <span className="text-[10px] text-muted-foreground">- {s.hint}</span>}
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px w-4 ${current > s.n ? 'bg-emerald-500/40' : 'bg-border'}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
