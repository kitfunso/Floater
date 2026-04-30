'use client';

import { useEffect, useRef, useState } from 'react';
import type { Schedule, Invoice, Vendor, Verdict, Escalation } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Props = {
  schedule: Schedule | null;
  invoices: Invoice[];
  vendors: Vendor[];
  onScheduleChange: (s: Schedule) => void;
  onDecisionRecorded?: (d: { invoiceId: string; verdict: 'approve' | 'defer' | 'reject' }) => void;
};

const AGENT_NAMES = ['vendor-health', 'cash-impact', 'discount-npv'] as const;
type AgentName = typeof AGENT_NAMES[number];

type AgentRowState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number }
  | { status: 'done'; verdict: Verdict; durationMs: number }
  | { status: 'error'; error: string };

type CardState = {
  agentRows: Record<AgentName, AgentRowState>;
  decisionMade: 'approve' | 'defer' | 'reject' | null;
  alertActive: boolean;
  narration: string | null;
  effectiveDistress: number | null;
  fanOutStartedAt: number | null;
  fanOutDoneAt: number | null;
};

function freshState(): CardState {
  return {
    agentRows: {
      'vendor-health': { status: 'idle' },
      'cash-impact':   { status: 'idle' },
      'discount-npv':  { status: 'idle' },
    },
    decisionMade: null,
    alertActive: false,
    narration: null,
    effectiveDistress: null,
    fanOutStartedAt: null,
    fanOutDoneAt: null,
  };
}

function gbp(n: number): string {
  return `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

export function EscalationPanel({ schedule, invoices, vendors, onDecisionRecorded }: Props) {
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});

  if (!schedule) return null;
  if (schedule.escalations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Escalations</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">No escalations - all invoices auto-paid.</CardContent>
      </Card>
    );
  }

  const invById = new Map(invoices.map((i) => [i.id, i]));
  const vendById = new Map(vendors.map((v) => [v.id, v]));

  function getState(invoiceId: string): CardState {
    return cardStates[invoiceId] ?? freshState();
  }
  function setState(invoiceId: string, updater: (prev: CardState) => CardState): void {
    setCardStates((s) => ({ ...s, [invoiceId]: updater(s[invoiceId] ?? freshState()) }));
  }

  async function investigate(invoiceId: string, forceDistress?: number) {
    if (!schedule) return;
    const entry = schedule.entries.find((e) => e.invoiceId === invoiceId);
    if (!entry) return;

    const fanOutStartedAt = Date.now();
    setState(invoiceId, () => ({
      ...freshState(),
      alertActive: forceDistress !== undefined,
      fanOutStartedAt,
      agentRows: {
        'vendor-health': { status: 'running', startedAt: fanOutStartedAt },
        'cash-impact':   { status: 'running', startedAt: fanOutStartedAt },
        'discount-npv':  { status: 'running', startedAt: fanOutStartedAt },
      },
    }));

    // Fire all three agents in parallel from the browser. Each fetch resolves
    // independently so React re-renders as each verdict lands.
    const body: Record<string, unknown> = {
      scheduleId: schedule.scheduleId,
      invoiceId,
      distressScore: entry.distressScore,
    };
    if (forceDistress !== undefined) body.forceDistress = forceDistress;

    await Promise.all(
      AGENT_NAMES.map(async (name) => {
        const t0 = Date.now();
        try {
          const res = await fetch(`/api/agent/${name}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error(`${name} ${res.status}`);
          const data = await res.json() as { verdict: Verdict; durationMs: number; narration?: string; effectiveDistress: number };
          const dt = Date.now() - t0;
          setState(invoiceId, (prev) => ({
            ...prev,
            agentRows: {
              ...prev.agentRows,
              [name]: { status: 'done', verdict: data.verdict, durationMs: dt },
            },
            narration: data.narration ?? prev.narration,
            effectiveDistress: data.effectiveDistress,
          }));
        } catch (e) {
          setState(invoiceId, (prev) => ({
            ...prev,
            agentRows: { ...prev.agentRows, [name]: { status: 'error', error: (e as Error).message } },
          }));
        }
      }),
    );

    setState(invoiceId, (prev) => ({ ...prev, fanOutDoneAt: Date.now() }));
  }

  async function triggerSpecterAlert() {
    if (!schedule) return;
    const target = schedule.escalations.find((e) => e.invoiceId === 'INV-FLOOR-BREACH');
    if (!target) return;
    await investigate(target.invoiceId, 0.7);
  }

  async function decide(invoiceId: string, verdict: 'approve' | 'defer' | 'reject') {
    if (!schedule) return;
    const reason = `${verdict} (sub-agent verdicts reviewed)`;
    try {
      const res = await fetch('/api/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scheduleId: schedule.scheduleId, invoiceId, verdict, reason }),
      });
      if (!res.ok) throw new Error(`decide ${res.status}`);
      setState(invoiceId, (prev) => ({ ...prev, decisionMade: verdict }));
      onDecisionRecorded?.({ invoiceId, verdict });
    } catch {
      // swallow - demo path
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Escalations ({schedule.escalations.length})
        </h2>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">3 sub-agents fan out via @cursor/sdk</p>
          <Button onClick={triggerSpecterAlert} size="sm" variant="outline">
            Trigger Specter alert
          </Button>
        </div>
      </div>
      {schedule.escalations.map((esc) => {
        const inv = invById.get(esc.invoiceId);
        const vendor = inv ? vendById.get(inv.vendorId) : undefined;
        const entry = schedule.entries.find((e) => e.invoiceId === esc.invoiceId);
        if (!inv || !vendor || !entry) return null;
        const state = getState(esc.invoiceId);
        const effectiveDistress = state.effectiveDistress ?? entry.distressScore;
        return (
          <InvoiceCard
            key={esc.invoiceId}
            escalation={esc}
            invoice={inv}
            vendor={vendor}
            distressScore={effectiveDistress}
            originalDistress={entry.distressScore}
            payDate={entry.payDate}
            state={state}
            onInvestigate={() => investigate(esc.invoiceId)}
            onDecide={(v) => decide(esc.invoiceId, v)}
          />
        );
      })}
    </section>
  );
}

type CardProps = {
  escalation: Escalation;
  invoice: Invoice;
  vendor: Vendor;
  distressScore: number;
  originalDistress: number;
  payDate: string;
  state: CardState;
  onInvestigate: () => void;
  onDecide: (v: 'approve' | 'defer' | 'reject') => void;
};

function severityBorder(distressScore: number, dissent: boolean): string {
  if (distressScore >= 0.5) return 'border-rose-500/40 bg-rose-500/5';
  if (dissent)              return 'border-amber-500/40 bg-amber-500/5';
  return 'border-emerald-500/40 bg-emerald-500/5';
}

function fanOutStarted(state: CardState): boolean {
  return state.fanOutStartedAt !== null;
}
function allDone(state: CardState): boolean {
  return AGENT_NAMES.every((n) => {
    const r = state.agentRows[n];
    return r.status === 'done' || r.status === 'error';
  });
}

function InvoiceCard({ escalation, invoice, vendor, distressScore, originalDistress, payDate, state, onInvestigate, onDecide }: CardProps) {
  const alertActive = state.alertActive && distressScore !== originalDistress;
  const verdicts = AGENT_NAMES.map((n) => state.agentRows[n]).filter((r) => r.status === 'done').map((r) => (r as { verdict: Verdict }).verdict);
  const dissent = verdicts.length === AGENT_NAMES.length && new Set(verdicts.map((v) => v.recommendation)).size > 1;
  const border = severityBorder(distressScore, dissent);

  const started = fanOutStarted(state);
  const done = allDone(state);

  return (
    <Card className={`border-2 ${border} transition-colors duration-300`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-mono">{invoice.id}</CardTitle>
            <div className="text-sm text-muted-foreground mt-0.5">
              {vendor.name} · {gbp(invoice.amount)} · due {invoice.dueDate} · scheduled {payDate}
            </div>
            <div className="text-xs mt-2"><strong>Why escalated:</strong> {escalation.reasonForEscalation}</div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <SpecterBadge score={distressScore} />
            {alertActive && <Badge variant="destructive" className="text-[10px] animate-pulse">SPECTER ALERT</Badge>}
            <Badge variant="outline" className="text-[10px]">{vendor.paymentHistory}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!started && (
          <Button onClick={onInvestigate} variant="default" size="sm">
            Investigate (3 agents in parallel)
          </Button>
        )}

        {started && state.narration && (
          <div className="text-sm rounded-md border bg-muted/40 p-2 italic">
            {state.narration}
          </div>
        )}

        {started && (
          <div className="space-y-2">
            {AGENT_NAMES.map((name) => (
              <AgentRow key={name} name={name} row={state.agentRows[name]} />
            ))}
          </div>
        )}

        {done && state.fanOutStartedAt !== null && state.fanOutDoneAt !== null && (
          <div className="text-[11px] text-muted-foreground font-mono tabular-nums pt-1 border-t">
            {AGENT_NAMES.length} agents in {state.fanOutDoneAt - state.fanOutStartedAt}ms · ~{
              AGENT_NAMES.reduce((sum, n) => {
                const r = state.agentRows[n];
                return sum + (r.status === 'done' ? r.durationMs : 0);
              }, 0)
            }ms sequential
          </div>
        )}

        {done && !state.decisionMade && verdicts.length === AGENT_NAMES.length && (
          <div className="flex gap-2 pt-1">
            <Button onClick={() => onDecide('approve')} size="sm" variant="default">Approve</Button>
            <Button onClick={() => onDecide('defer')}   size="sm" variant="secondary">Defer</Button>
            <Button onClick={() => onDecide('reject')}  size="sm" variant="destructive">Reject</Button>
          </div>
        )}
        {state.decisionMade && (
          <div className="text-sm pt-1 text-emerald-700 dark:text-emerald-400">
            ✓ Decision: <strong>{state.decisionMade}</strong>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentRow({ name, row }: { name: AgentName; row: AgentRowState }) {
  if (row.status === 'idle' || row.status === 'running') {
    return <RunningRow name={name} startedAt={row.status === 'running' ? row.startedAt : Date.now()} />;
  }
  if (row.status === 'error') {
    return (
      <div className="flex items-start gap-3 text-sm">
        <div className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{name}</div>
        <span className="text-destructive text-xs">error: {row.error}</span>
      </div>
    );
  }
  return <DoneRow name={name} verdict={row.verdict} durationMs={row.durationMs} />;
}

function RunningRow({ name, startedAt }: { name: AgentName; startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    tickRef.current = setInterval(() => setElapsed(Date.now() - startedAt), 33);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [startedAt]);
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="w-32 shrink-0 font-mono text-xs text-muted-foreground flex items-center gap-2">
        <span className="inline-block size-1.5 rounded-full bg-sky-500 animate-pulse" />
        {name}
      </div>
      <span className="px-2 py-0.5 rounded border text-[11px] bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300 shrink-0 animate-pulse">
        running…
      </span>
      <div className="text-muted-foreground text-xs leading-snug font-mono tabular-nums">{elapsed}ms</div>
    </div>
  );
}

function DoneRow({ name, verdict, durationMs }: { name: AgentName; verdict: Verdict; durationMs: number }) {
  const tone = recommendationTone(verdict.recommendation);
  return (
    <div className="flex items-start gap-3 text-sm animate-in fade-in slide-in-from-left-1 duration-300">
      <div className="w-32 shrink-0 font-mono text-xs text-muted-foreground flex items-center gap-2">
        <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
        {name}
      </div>
      <span className={`px-2 py-0.5 rounded border text-[11px] shrink-0 ${tone}`}>{verdict.recommendation}</span>
      <div className="text-muted-foreground text-xs leading-snug flex-1 min-w-0">{verdict.rationale}</div>
      <div className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">{durationMs}ms</div>
    </div>
  );
}

function recommendationTone(r: Verdict['recommendation']): string {
  switch (r) {
    case 'pay-early':   return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
    case 'pay-on-time': return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30';
    case 'stretch':     return 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30';
    case 'defer':       return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
  }
}

function SpecterBadge({ score }: { score: number }) {
  const tone =
    score >= 0.5 ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30' :
    score >= 0.3 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' :
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-[11px] tabular-nums ${tone}`}>
      Specter {score.toFixed(2)}
    </span>
  );
}
