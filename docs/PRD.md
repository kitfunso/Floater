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
- ≥ 1 cash-floor breach avoided vs naive baseline.
- Exactly 3 escalations surface on the demo dataset, each exercising a different rule path (large/new vendor, Specter alert, cash breach).
- Sub-agents fan out in parallel and visibly complete in < 3s for one flagged invoice.
- Policy panel renders all 5 auto-pay rules and 5 escalate rules.

**Engineering quality:**
- All four foundation docs (PRD, ARCHITECTURE, CLAUDE.md, Phase 1 plan) committed before code.
- `.env.local` is gitignored before any key is written.
- Three demo escalation cases reproducible deterministically (seeded).

## Constraints
- **Time:** 4.5h build window (hackathon).
- **Team:** Solo (Keith).
- **Stack lock:** Next.js 15 App Router + Tailwind + shadcn/ui, `@cursor/sdk` (TS), Specter via MCP (HTTP fallback acceptable), OpenAI (gpt-5 / gpt-5-mini), JSON files only.
- **Bonus rubric:** Must use Cursor SDK structurally (sub-agent fan-out, not just a chat call) and Specter (vendor distress as input to the pay-early decision).
- **Security:** `SPECTER_API_KEY` in the brief is shared and assumed burned post-event; rotate before any real use.
- **Deploy:** Vercel preview URL must work in incognito.
