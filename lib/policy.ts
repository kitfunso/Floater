// HITL escalation policy. Single source of truth for both the optimiser and the
// PolicyPanel UI component. AUTO_PAY_RULES + ESCALATE_RULES are exported as
// typed const arrays so the panel renders directly from this module — no
// duplicated rule strings in JSX.

import type { Invoice, Vendor } from './types';

export const MAX_STRETCH_DAYS = 14;
export const AUTO_PAY_AMOUNT_THRESHOLD = 5_000;     // GBP
export const AUTO_PAY_DISTRESS_THRESHOLD = 0.3;
export const DEFER_DISTRESS_THRESHOLD = 0.5;

export type PolicyRule = {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
};

export const AUTO_PAY_RULES: readonly PolicyRule[] = [
  {
    id: 'auto-amount',
    label: `amount < £${AUTO_PAY_AMOUNT_THRESHOLD.toLocaleString()}`,
    detail: 'Small invoices auto-pay; bigger ones get human eyes.',
  },
  {
    id: 'auto-history',
    label: 'vendor has ≥3 prior on-time payments',
    detail: 'New or unreliable vendors always escalate.',
  },
  {
    id: 'auto-distress',
    label: `Specter distress score < ${AUTO_PAY_DISTRESS_THRESHOLD}`,
    detail: 'Vendors showing financial stress get reviewed before we send cash.',
  },
  {
    id: 'auto-floor',
    label: 'cash floor preserved across full horizon',
    detail: 'Never optimise to a breach. If pay-on-due breaches, we escalate.',
  },
  {
    id: 'auto-stretch',
    label: `payable within ${MAX_STRETCH_DAYS}d of due date`,
    detail: 'Anything beyond two weeks past due flags relationship and late-fee risk.',
  },
];

export const ESCALATE_RULES: readonly PolicyRule[] = [
  {
    id: 'esc-amount',
    label: `amount ≥ £${AUTO_PAY_AMOUNT_THRESHOLD.toLocaleString()}`,
    detail: 'Big invoices need a human signature regardless of vendor health.',
  },
  {
    id: 'esc-history',
    label: 'new vendor or inconsistent history',
    detail: 'Build trust before automating: at least three on-time payments.',
  },
  {
    id: 'esc-specter',
    label: `Specter distress flag (≥${AUTO_PAY_DISTRESS_THRESHOLD})`,
    detail: 'Distressed vendor = relationship call, not a robot decision.',
  },
  {
    id: 'esc-breach',
    label: 'pay-on-due would breach floor in 7d',
    detail: 'Cash crunch → human chooses what to defer.',
  },
  {
    id: 'esc-disagreement',
    label: 'sub-agents dissent (post-investigate only)',
    detail: 'Three agents fan out on flagged invoices. Disagreement keeps it on the panel.',
  },
];

// ============================================================
// classify
// ============================================================
//
// Called by the optimiser once per invoice. Returns 'auto' or 'flagged' plus
// the list of rule ids that failed (so the UI can show "why").
//
// Important: sub-agents do NOT participate in classify(). They only run when
// the invoice has already been flagged, via /api/investigate. This keeps the
// auto-pay path cheap (no LLM calls per line item) and the escalation path
// expensive but rare.

export type ClassifyInput = {
  invoice: Invoice;
  vendor: Vendor;
  distressScore: number;       // 0-1, pre-fetched from Specter
  payOnDueWouldBreach: boolean; // simulated by the optimiser before calling classify
};

export type ClassifyResult = {
  decision: 'auto' | 'flagged';
  failedRuleIds: string[];     // empty when decision === 'auto'
  reason: string;              // human-readable summary
};

export function classify({
  invoice,
  vendor,
  distressScore,
  payOnDueWouldBreach,
}: ClassifyInput): ClassifyResult {
  const failed: string[] = [];

  if (invoice.amount >= AUTO_PAY_AMOUNT_THRESHOLD) failed.push('esc-amount');
  if (vendor.paymentHistory !== 'reliable') failed.push('esc-history');
  if (distressScore >= AUTO_PAY_DISTRESS_THRESHOLD) failed.push('esc-specter');
  if (payOnDueWouldBreach) failed.push('esc-breach');

  if (failed.length === 0) {
    return { decision: 'auto', failedRuleIds: [], reason: 'all auto-pay rules satisfied' };
  }

  const labels = failed.map((id) => ESCALATE_RULES.find((r) => r.id === id)?.label ?? id);
  return {
    decision: 'flagged',
    failedRuleIds: failed,
    reason: labels.join('; '),
  };
}
