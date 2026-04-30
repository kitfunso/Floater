# CLAUDE.md - Working Capital Optimiser (Floater)

## Project Overview
Hackathon AP scheduling agent (Cursor x Briefcase London 2026, Money Movement track, 4.5h build). Decides per invoice: pay early / on time / stretch. Auto-executes clean ones, escalates wobbly ones via Cursor SDK sub-agents (vendor-health, cash-impact, discount-NPV). Specter is a structural input to the pay-early decision.

## Architecture
See `docs/ARCHITECTURE.md`. Stack: Next.js 15 App Router + Tailwind + shadcn/ui, `@cursor/sdk` (TS), Specter via MCP (HTTP fallback), OpenAI gpt-5 / gpt-5-mini, JSON files in `data/`. No DB. Pure TS optimiser.

## Non-Negotiable Rules

1. **`.env.local` is gitignored before any key is written.** The Specter key in the brief is shared and assumed burned post-event. Why: leaking the key fails the security rubric and the event organisers will rotate it on us.
2. **Never breach the cash floor, including under deferred payments.** `cashBalance(t) >= forecast.cashFloor` for every `t` in the 60-day horizon. Defers respect a hard cap: `MAX_STRETCH_DAYS = 14` past `dueDate`. Why: a breach kills the demo, and stretching beyond two weeks creates late-fee + relationship risk that the pitch can't defend.
3. **HITL escalation is earned, not blanket.** Auto-pay only when ALL of: `amount < £5k`, vendor `paymentHistory == 'reliable'` (>=3 prior on-time), `distressScore < 0.3`, cash floor preserved across the full horizon. Sub-agents do **not** gate auto-pay; they only run on flagged invoices via `/api/investigate`. Otherwise escalate. Why: judges see "obvious what it will and will not do" without spawning agents on every line item.
4. **Sub-agents must fan out in parallel via `@cursor/sdk`.** Not sequential, not "an agent that calls tools". Three concurrent agent runs per flagged invoice. Why: this is the structural Cursor SDK usage that earns the 3-pt bonus. Sequential calls do not.
5. **Specter is a decision input, not decoration.** `vendor.distressScore` from Specter directly gates the pay-early branch in `lib/optimiser.ts`. Why: rubric says "structural", not "name-checked".
6. **Deterministic demo.** Seed mocks so the same 3 escalation cases fire every run (large+new vendor, Specter alert, cash breach). `DEMO_REPLAY=1` swaps Specter + OpenAI for fixtures; LLM narration is fixture-cached by `invoiceId` and **never live in the demo critical path**. Why: live LLM variance kills demos.
7. **No DB, no migrations, no auth.** JSON files in `data/`, run logs in `runs/`. Why: 4.5h. Schema work is the easiest way to lose the build.
8. **Never use `--no-verify` on commits.** Why: project-wide rule across Keith's repos; hooks are there to catch leaked keys.

## Coding Conventions

- **TypeScript strict mode.** `tsconfig.json` has `strict: true`, `noUncheckedIndexedAccess: true`. Every API route + lib function annotates inputs and outputs.
- **Pure functions in `lib/`.** No `fs` reads inside `lib/optimiser.ts` / `lib/npv.ts` / `lib/policy.ts`. Reads happen at the API route boundary; pure logic takes data in, returns data out. Why: testable + replayable.
- **Zod for API request bodies.** Every `app/api/*/route.ts` validates the body with a Zod schema before doing work. Reject with 400 + a JSON `{ error }` on parse failure.
- **No em dashes in UI strings or commit messages.** Use hyphens, colons, or commas. Why: project-wide rule.
- **No `any`.** Use `unknown` + a Zod parse, or define the type. Why: bug magnets in 4.5h.
- **Components are dumb.** Fetch in `app/page.tsx` or a top-level container; pass props down. No `useEffect` fetches inside leaf cards.
- **Tailwind utility classes only.** No CSS modules, no `@apply` blocks. shadcn defaults are good enough.

## Critical Files

Read before editing in their area:

- `lib/optimiser.ts` - the schedule producer. Cash-floor invariant lives here. Don't touch without re-running the seeded test cases.
- `lib/policy.ts` - the auto-pay vs escalate thresholds. Exports `AUTO_PAY_RULES` and `ESCALATE_RULES` as typed `const` arrays. `app/components/PolicyPanel.tsx` imports them directly. Never duplicate rule text in the UI; if the panel literal drifts from the runtime, judges will catch it.
- `lib/cursor.ts` - the Cursor SDK fan-out. If sub-agents stop running in parallel, the bonus is gone.
- `data/invoices.json` + `scripts/seed.ts` - the demo cases are hand-tuned; regenerating breaks the script.
- `.env.local.example` - the source of truth for required env vars. Update when adding a new key.

## Safety Rules

- **Secrets:** `.env.local` only. Never log them. Never echo them. Never commit them. Pre-commit grep for `sk-`, `SPECTER_API_KEY=`, `OPENAI_API_KEY=` before pushing.
- **External calls:** Specter and OpenAI are the only outbound. Both are wrapped (`lib/specter.ts`, `lib/llm.ts`) with timeouts and a deterministic stub for offline / demo-replay mode.
- **No real money.** `/api/execute` writes a JSON run log. Never integrate Stripe / Plaid / bank rails in this build.
- **Demo replay mode.** A `DEMO_REPLAY=1` env var swaps live Specter + OpenAI calls for cached fixtures so the demo cannot fail on a flaky network.

## Common Mistakes to Avoid

- **Calling sub-agents sequentially** because `await` is easier than `Promise.all`. This kills the bonus. Use `Promise.all` over an array of agent runs.
- **Reading `data/*.json` inside `lib/`** for "convenience". Breaks testability and replay. Read in the API route, pass data in.
- **Letting `/api/optimise` mutate `data/invoices.json`.** It must be read-only. Run logs go to `runs/`.
- **Showing escalations the policy didn't actually flag.** The PolicyPanel must `import { AUTO_PAY_RULES, ESCALATE_RULES } from 'lib/policy'`. Never re-write the rules as JSX strings.
- **Spending >30 min on calendar visuals.** Fall back to a coloured table sorted by date if Gantt eats time. The savings counter and escalation panel are the demo, not the calendar.
- **Running live LLM on the demo critical path.** Pre-bake narration fixtures keyed by `invoiceId` under `DEMO_REPLAY=1`. A flaky network during the pitch is the only fail you can't unwind.
- **Static-importing `data/*.json` from a client component.** `page.tsx` is a server component; pass props down. Mixing static import + `/api/optimise` reads of the same file is asymmetric and hides bugs.
- **Letting `floorBreaches` mean two things.** The schedule field is `breachesAvoidedVsBaseline` (count > 0 = optimiser saved a breach). The optimiser's own output is always 0; if it isn't, the invariant is broken — fail the test, don't ship the schedule.
