# Working Capital Optimiser - Product Requirements Document

## One-Line Description
An AP scheduling agent that decides per invoice whether to pay early (capture discount), pay on time, or stretch (preserve cash) — auto-executes the clean ones and escalates only when sub-agents disagree or vendors look wobbly.

## Problem Statement
SMB finance teams leave material discount income on the table (2/10 net 30 ≈ 37% APR) because they batch-pay everything on due date to "be safe". The opposite is also bad: prepaying a vendor about to default is a literal cash bonfire. Neither bookkeeping software nor ERPs make per-invoice pay-timing decisions, and humans don't have time to underwrite every invoice.

## Target Users
- **Primary (demo):** Cursor × Briefcase London 2026 hackathon judges, Money Movement track. Technical, want to see HITL done with earned escalations and visible policy.
- **Realistic post-event:** SMB finance ops (CFO / FP&A at 10-200-person companies) running QuickBooks / Xero with 50-500 invoices/month and a tight cash floor.

## Core Features (MVP)
1. **Invoice ingest + parse** — load 30-50 mock invoices with terms (e.g. "2/10 net 30"), parse discount % / discount days / net days.
2. **Cash-aware scheduler** — greedy optimiser produces a 60-day payment schedule that captures discounts where APR > cost of capital AND cash balance never breaches the floor.
3. **Policy gate** — auto-pay queue for small + clean + cash-safe invoices; everything else flagged for sub-agent investigation.
4. **Cursor SDK sub-agent fan-out** — for each flagged invoice, three parallel sub-agents (vendor-health, cash-impact, discount-NPV) return verdicts.
5. **HITL escalation panel** — dissent or risk surfaces a card with all three sub-agent transcripts; human approves / defers / rejects with one click + one-line reason.
6. **Visible policy panel** — on-screen table of the auto-pay vs escalate rules. Judges see guardrails as code, not vibes.
7. **Live demo theatre** — calendar reshuffles on `Optimise`, savings counter ticks up, scripted Specter alert mid-run re-evaluates the schedule.

## What This Product IS NOT
1. **NOT a general ERP or AP automation suite.** No PO matching, no 3-way match, no GL postings, no approval workflows beyond HITL escalations.
2. **NOT a payments rail.** It schedules and produces a queue; it does not actually move money. (Stripe / bank rails are out of scope for the hackathon.)
3. **NOT an OCR / invoice intake tool.** Mock data only. No PDF ingest, no email parsing, no Plaid / open banking.
4. **NOT a general-purpose treasury system.** No FX, no multi-entity, no intercompany. Single GBP entity, one cash account.
5. **NOT an LP / MIP solver.** Greedy with cash-floor constraint is the optimiser. No CPLEX, no PuLP, no convex optimisation.
6. **NOT a multi-user app.** Single demo session. No auth, no roles, no audit log beyond the escalation reason field.
7. **NOT a database product.** JSON files on disk. No Postgres, no Prisma, no schema migrations.
8. **NOT a polished design system.** Shadcn defaults + Tailwind utility classes. Functional, not pretty. No dark-mode toggle, no marketing site.

## Success Metrics
**Demo-time (rubric-aligned):**
- Money visibly moves on a schedule the agent reorders (calendar reshuffles live).
- £ saved counter > £3,500 on the demo dataset.
- `breachesAvoidedVsBaseline` >= 1 (the optimised schedule prevents at least one cash-floor breach the naive pay-on-due schedule would cause).
- Exactly 3 escalations surface on the demo dataset, with deterministic IDs (`INV-LARGE-NEW`, `INV-SPECTER-DISTRESSED`, `INV-FLOOR-BREACH`).
- Specter distress score is visible as a coloured badge on **every** invoice card, not just flagged ones (judges see Specter as structural input).
- Sub-agents fan out in parallel and the UI renders the timestamp spread (`max - min < 50 ms`) on each escalation card.
- Policy panel renders all 5 auto-pay rules and 5 escalate rules, sourced directly from `lib/policy.ts` (no duplicated literals).

**Engineering quality:**
- All four foundation docs (PRD, ARCHITECTURE, CLAUDE.md, Phase 1 plan) committed before code.
- `.env.local` is gitignored before any key is written.
- Three demo escalation cases reproducible deterministically (seeded). A test in `lib/__tests__/seed.test.ts` asserts the exact escalation ID set every commit.
- Live LLM is never on the demo critical path. `DEMO_REPLAY=1` deploys serve cached narrations.

## Constraints
- **Time:** 4.5h hackathon window. Honest internal estimate is 6h. The pre-agreed cuts if 4.5h pinches: (1) Gantt calendar falls back to a coloured table; (2) live LLM narration is dropped entirely (fixtures only).
- **Team:** Solo (Keith).
- **Stack lock:** Next.js 15 App Router + Tailwind + shadcn/ui, `@cursor/sdk` (TS), Specter via MCP (HTTP fallback acceptable), OpenAI (gpt-5 / gpt-5-mini, fixture-cached on the demo critical path), JSON files only.
- **Bonus rubric:** Must use Cursor SDK structurally (parallel sub-agent fan-out via `Promise.all`, not just a chat call) and Specter structurally (`distressScore` pre-fetched in `/api/optimise` and gating the pay-early branch in `lib/optimiser.ts`, with a visible badge on every invoice card).
- **Security:** `SPECTER_API_KEY` in the brief is shared and assumed burned post-event; rotate before any real use. `.env.local` gitignored before any key is written.
- **Deploy:** Vercel preview URL must work in incognito with `DEMO_REPLAY=1` set.
