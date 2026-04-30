// Sub-agent: vendor health. Reads the pre-fetched Specter distress score and
// translates it into a recommendation + rationale. Does NOT re-hit Specter
// (the score was pre-fetched in /api/optimise so the same value flows through
// the optimiser AND the agent fan-out).
//
// Under DEMO_REPLAY=1 (default in deploy): deterministic, no LLM call.
// Under DEMO_REPLAY=0: would prompt gpt-5-mini for a one-line rationale via
// the Cursor SDK. Wired but not the demo path.

import { loadCursorSdk } from '../lib/cursor';
import type { SubAgent, AgentInput, AgentRunResult } from '../lib/cursor';
import type { Verdict } from '../lib/types';
import {
  AUTO_PAY_DISTRESS_THRESHOLD,
  DEFER_DISTRESS_THRESHOLD,
} from '../lib/policy';

function rationaleFor(distressScore: number): { recommendation: Verdict['recommendation']; rationale: string } {
  if (distressScore >= DEFER_DISTRESS_THRESHOLD) {
    return {
      recommendation: 'defer',
      rationale: `Specter distress ${distressScore.toFixed(2)} - vendor showing financial stress, defer past due date and check in before paying`,
    };
  }
  if (distressScore >= AUTO_PAY_DISTRESS_THRESHOLD) {
    return {
      recommendation: 'pay-on-time',
      rationale: `Specter distress ${distressScore.toFixed(2)} - elevated risk, no early payment but pay on schedule`,
    };
  }
  return {
    recommendation: 'pay-early',
    rationale: `Specter distress ${distressScore.toFixed(2)} - vendor clean, safe to capture discount`,
  };
}

async function runDemoReplay(input: AgentInput): Promise<Verdict> {
  // Tiny stagger so the parallelism timestamp strip in the UI shows non-zero
  // spread even on this fast path.
  await new Promise((r) => setTimeout(r, 30 + Math.floor(input.distressScore * 50)));
  const { recommendation, rationale } = rationaleFor(input.distressScore);
  return {
    agent: 'vendor-health',
    recommendation,
    rationale,
    score: input.distressScore,
  };
}

async function runLive(input: AgentInput): Promise<Verdict> {
  // Live path: Cursor SDK call. Kept small (single send/wait) for cost control.
  // Falls back to the deterministic path on any error so the demo never blocks.
  try {
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) return runDemoReplay(input);
    const sdk = await loadCursorSdk();
    if (!sdk) return runDemoReplay(input);
    const agent = await sdk.Agent.create({
      apiKey,
      model: { id: 'gpt-5-mini' },
      name: `vendor-health-${input.invoice.id}`,
      local: { cwd: process.cwd() },
    });
    try {
      const prompt = `Vendor ${input.vendor.name} has Specter distress score ${input.distressScore.toFixed(2)}. Invoice ${input.invoice.id} for £${input.invoice.amount} is due ${input.invoice.dueDate}. Recommend pay-early, pay-on-time, stretch, or defer in 1 line. Then 1 sentence rationale.`;
      const run = await agent.send(prompt);
      const result = await run.wait();
      const text = (result && result.status === 'finished' ? result.text ?? '' : '') ?? '';
      const fallback = rationaleFor(input.distressScore);
      // Cheap parse: if model output mentions "defer" use defer; else fallback.
      const lower = text.toLowerCase();
      const recommendation: Verdict['recommendation'] =
        lower.includes('defer') ? 'defer'
        : lower.includes('stretch') ? 'stretch'
        : lower.includes('pay-early') || lower.includes('pay early') ? 'pay-early'
        : fallback.recommendation;
      return {
        agent: 'vendor-health',
        recommendation,
        rationale: text.slice(0, 200) || fallback.rationale,
        score: input.distressScore,
      };
    } finally {
      agent.close();
    }
  } catch {
    return runDemoReplay(input);
  }
}

export const vendorHealthAgent: SubAgent = {
  name: 'vendor-health',
  async run(input: AgentInput): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const verdict =
      process.env.DEMO_REPLAY === '1' ? await runDemoReplay(input) : await runLive(input);
    return { verdict, startedAt, finishedAt: Date.now() };
  },
};
