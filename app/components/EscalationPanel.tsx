'use client';

import { useState } from 'react';
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

type InvestigateResult = {
  verdicts: Verdict[];
  parallelism: { spreadMs: number; durationMs: number; sequentialMs: number; speedup: number; agentCount: number };
  narration?: string;
  effectiveDistress?: number;
};

type CardState = {
  loading: boolean;
  result: InvestigateResult | null;
  decisionMade: 'approve' | 'defer' | 'reject' | null;
  error: string | null;
  alertActive: boolean;
};

const initialCardState: CardState = { loading: false, result: null, decisionMade: null, error: null, alertActive: false };

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
    return cardStates[invoiceId] ?? initialCardState;
  }
  function setState(invoiceId: string, patch: Partial<CardState>): void {
    setCardStates((s) => ({ ...s, [invoiceId]: { ...getState(invoiceId), ...patch } }));
  }

  async function investigate(invoiceId: string, forceDistress?: number) {
    if (!schedule) return;
    const entry = schedule.entries.find((e) => e.invoiceId === invoiceId);
    if (!entry) return;
    setState(invoiceId, { loading: true, error: null, alertActive: forceDistress !== undefined });
    try {
      const body: Record<string, unknown> = {
        scheduleId: schedule.scheduleId,
        invoiceId,
        distressScore: entry.distressScore,
      };
      if (forceDistress !== undefined) body.forceDistress = forceDistress;
      const res = await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`investigate ${res.status}`);
      const result: InvestigateResult = await res.json();
      setState(invoiceId, { loading: false, result });
    } catch (e) {
      setState(invoiceId, { loading: false, error: (e as Error).message });
    }
  }

  async function triggerSpecterAlert() {
    if (!schedule) return;
    // Demo trigger: flip INV-FLOOR-BREACH's vendor to high distress and
    // re-investigate. The card colour flips and the recommendation moves
    // to "defer" - the live demo moment for the rubric "earned HITL" beat.
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
      setState(invoiceId, { decisionMade: verdict });
      onDecisionRecorded?.({ invoiceId, verdict });
    } catch (e) {
      setState(invoiceId, { error: (e as Error).message });
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
        const effective = state.result?.effectiveDistress ?? entry.distressScore;
        return (
          <InvoiceCard
            key={esc.invoiceId}
            escalation={esc}
            invoice={inv}
            vendor={vendor}
            distressScore={effective}
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
  distressScore: number;       // effective (post-alert) score for UI
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

function InvoiceCard({ escalation, invoice, vendor, distressScore, originalDistress, payDate, state, onInvestigate, onDecide }: CardProps) {
  const alertActive = state.alertActive && distressScore !== originalDistress;
  const dissent = state.result
    ? new Set(state.result.verdicts.map((v) => v.recommendation)).size > 1
    : false;
  const border = severityBorder(distressScore, dissent);

  return (
    <Card className={`border-2 ${border}`}>
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
            {alertActive && <Badge variant="destructive" className="text-[10px]">SPECTER ALERT</Badge>}
            <Badge variant="outline" className="text-[10px]">{vendor.paymentHistory}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!state.result && !state.loading && (
          <Button onClick={onInvestigate} variant="default" size="sm">
            Investigate (3 agents in parallel)
          </Button>
        )}
        {state.loading && <p className="text-sm text-muted-foreground">Running sub-agents…</p>}
        {state.error && <p className="text-sm text-destructive">Error: {state.error}</p>}
        {state.result && (
          <>
            {state.result.narration && (
              <div className="text-sm rounded-md border bg-muted/40 p-2 italic">
                {state.result.narration}
              </div>
            )}
            <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
              {state.result.parallelism.agentCount} agents in {state.result.parallelism.durationMs}ms · ~{state.result.parallelism.sequentialMs}ms sequential · {state.result.parallelism.speedup}× speedup
            </div>
            <div className="space-y-2">
              {state.result.verdicts.map((v) => (
                <VerdictRow key={v.agent} verdict={v} />
              ))}
            </div>
            {!state.decisionMade ? (
              <div className="flex gap-2 pt-1">
                <Button onClick={() => onDecide('approve')} size="sm" variant="default">Approve</Button>
                <Button onClick={() => onDecide('defer')}   size="sm" variant="secondary">Defer</Button>
                <Button onClick={() => onDecide('reject')}  size="sm" variant="destructive">Reject</Button>
              </div>
            ) : (
              <div className="text-sm pt-1 text-emerald-700 dark:text-emerald-400">
                ✓ Decision: <strong>{state.decisionMade}</strong>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function VerdictRow({ verdict }: { verdict: Verdict }) {
  const tone = recommendationTone(verdict.recommendation);
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{verdict.agent}</div>
      <span className={`px-2 py-0.5 rounded border text-[11px] shrink-0 ${tone}`}>{verdict.recommendation}</span>
      <div className="text-muted-foreground text-xs leading-snug">{verdict.rationale}</div>
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
