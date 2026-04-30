// Sub-agent: discount NPV. Compares discount APR vs cost of capital, factors
// in vendor reliability + distress, and recommends a payment timing. Pure TS;
// no LLM call (math doesn't need one).

import type { SubAgent, AgentInput, AgentRunResult } from '../lib/cursor';
import type { Verdict } from '../lib/types';
import { discountAPR, COST_OF_CAPITAL, shouldTakeDiscount } from '../lib/npv';
import { AUTO_PAY_DISTRESS_THRESHOLD } from '../lib/policy';

export const discountNpvAgent: SubAgent = {
  name: 'discount-npv',
  async run(input: AgentInput): Promise<AgentRunResult> {
    const startedAt = Date.now();
    await new Promise((r) => setTimeout(r, 25));

    const { invoice, distressScore, vendor } = input;

    if (!invoice.discountPct || !invoice.discountDays) {
      return {
        verdict: {
          agent: 'discount-npv',
          recommendation: 'pay-on-time',
          rationale: 'No discount terms - APR irrelevant; pay on due date.',
          score: 0,
        },
        startedAt,
        finishedAt: Date.now(),
      };
    }

    const apr = discountAPR(invoice.discountPct, invoice.discountDays, invoice.netDays);
    const aprPct = (apr * 100).toFixed(1);
    const cocPct = (COST_OF_CAPITAL * 100).toFixed(1);
    const delta = apr - COST_OF_CAPITAL;

    if (!shouldTakeDiscount(apr)) {
      return {
        verdict: {
          agent: 'discount-npv',
          recommendation: 'pay-on-time',
          rationale: `Discount APR ${aprPct}% < cost of capital ${cocPct}% - skip discount, pay on due.`,
          score: delta,
        },
        startedAt,
        finishedAt: Date.now(),
      };
    }

    if (distressScore >= AUTO_PAY_DISTRESS_THRESHOLD) {
      return {
        verdict: {
          agent: 'discount-npv',
          recommendation: 'pay-on-time',
          rationale: `Discount APR ${aprPct}% beats cost of capital but vendor distress ${distressScore.toFixed(2)} blocks early payment.`,
          score: delta,
        },
        startedAt,
        finishedAt: Date.now(),
      };
    }

    if (vendor.paymentHistory !== 'reliable') {
      return {
        verdict: {
          agent: 'discount-npv',
          recommendation: 'pay-on-time',
          rationale: `Discount APR ${aprPct}% > ${cocPct}% but vendor history is "${vendor.paymentHistory}" - build trust before prepaying.`,
          score: delta,
        },
        startedAt,
        finishedAt: Date.now(),
      };
    }

    const saving = invoice.amount * invoice.discountPct;
    return {
      verdict: {
        agent: 'discount-npv',
        recommendation: 'pay-early',
        rationale: `Discount APR ${aprPct}% vs cost of capital ${cocPct}% (delta ${(delta * 100).toFixed(1)}pp). Capture £${saving.toFixed(0)}.`,
        score: delta,
      },
      startedAt,
      finishedAt: Date.now(),
    };
  },
};
