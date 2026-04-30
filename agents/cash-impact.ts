// Sub-agent: cash impact. Uses lib/optimiser.simulate to test "what if we
// pay this invoice on its current schedule date?" and reports breach status
// + minimum buffer across the horizon. Pure compute under both DEMO_REPLAY
// and live paths (no LLM call needed — the simulator already produces a
// crisp answer).

import type { SubAgent, AgentInput, AgentRunResult } from '../lib/cursor';
import type { Verdict, ScheduleEntry, Invoice } from '../lib/types';
import { simulate } from '../lib/optimiser';

export const cashImpactAgent: SubAgent = {
  name: 'cash-impact',
  async run(input: AgentInput): Promise<AgentRunResult> {
    const startedAt = Date.now();
    // Tiny stagger keeps the parallelism timestamp strip honest in the UI.
    await new Promise((r) => setTimeout(r, 40));

    const { invoice, forecast } = input;

    // Probe pay-on-due as the candidate.
    const probe: ScheduleEntry = {
      invoiceId: invoice.id,
      payDate: invoice.dueDate,
      reason: 'auto-due',
      projectedSaving: 0,
      distressScore: input.distressScore,
    };
    const invoiceById = new Map<string, Invoice>([[invoice.id, invoice]]);
    const sim = simulate([probe], forecast, invoiceById);

    let verdict: Verdict;
    if (sim.breachDay !== null) {
      verdict = {
        agent: 'cash-impact',
        recommendation: 'stretch',
        rationale: `Pay-on-due breaches floor on ${sim.breachDay} (buffer £${sim.minBuffer.toFixed(0)}). Stretch within 14d to recover.`,
        score: sim.minBuffer,
      };
    } else if (sim.minBuffer < 5_000) {
      verdict = {
        agent: 'cash-impact',
        recommendation: 'pay-on-time',
        rationale: `Pay-on-due fits but min buffer is only £${sim.minBuffer.toFixed(0)} - no early payment.`,
        score: sim.minBuffer,
      };
    } else {
      verdict = {
        agent: 'cash-impact',
        recommendation: 'pay-early',
        rationale: `Pay-on-due safe (min buffer £${sim.minBuffer.toFixed(0)}); plenty of room to capture discount if available.`,
        score: sim.minBuffer,
      };
    }

    return { verdict, startedAt, finishedAt: Date.now() };
  },
};
