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

  return (
    <main className="min-h-screen p-6 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Floater</h1>
          <p className="text-sm text-muted-foreground">
            AP scheduling agent. Auto-pay clean invoices, escalate the wobbly ones.
          </p>
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
