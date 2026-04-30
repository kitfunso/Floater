# Working Capital Optimiser - Architecture

## System Overview

```
[Mock invoice JSON]
       │
       ▼
[POST /api/optimise] ──► lib/optimiser.ts (greedy + cash-floor)
       │
       ├──► auto-pay queue   (small + clean + cash-safe)
       │
       └──► flagged set
                │
                ▼
[POST /api/investigate?invoiceId=…]
       │
       ├──► agents/vendor-health.ts   (Specter MCP via lib/specter.ts)
       ├──► agents/cash-impact.ts     (lib/optimiser.ts simulate)
       └──► agents/discount-npv.ts    (lib/npv.ts)
                │
                ▼
       [Aggregator in /api/investigate]
                │
                ├──► unanimous proceed → schedule (auto)
                └──► dissent / risk    → escalation panel (HITL)
                                              │
                                              ▼
                                       [POST /api/decide]
                                              │
                                              ▼
                                       [POST /api/execute]
```

UI is one page (`app/page.tsx`) reading from these endpoints; calendar, cards, escalation panel, savings counter, policy panel are client components.

## Tech Stack

| Layer            | Technology                              | Rationale                                                        |
|------------------|-----------------------------------------|------------------------------------------------------------------|
| Frontend / API   | Next.js 15 App Router                   | Already used for Luminus; fast scaffold; Vercel deploy is 1 command. |
| UI components    | Tailwind + shadcn/ui                    | Defaults are good enough for a 4.5h demo; no design polish needed. |
| Agent runtime    | `@cursor/sdk` (TypeScript)              | Rubric bonus requires structural Cursor SDK usage; local runtime for hackathon speed, cloud as stretch. |
| Market intel     | Specter via MCP; HTTP fallback          | Rubric bonus; MCP is the theatrical version, HTTP keeps us shipping if MCP wiring is shaky. |
| LLM              | OpenAI gpt-5 / gpt-5-mini               | Sub-agent reasoning + escalation narration. Mini for fast parallel calls. |
| Data store       | JSON files in `data/`                   | No DB. Don't lose 45 min to migrations.                          |
| Math             | Pure TS                                 | Greedy with cash-floor constraint; no LP solver.                 |
| Deploy           | Vercel                                  | One-command preview URL.                                         |

## Repository Structure

```
working-capital-optimiser/
├── README.md                      # one-shot setup + demo URL
├── CLAUDE.md                      # agent instructions, escalation policy, stack notes
├── .env.local.example             # committed template, no values
├── .env.local                     # gitignored, real keys
├── .gitignore                     # MUST contain .env.local + node_modules + .next
├── package.json                   # next, react, tailwind, shadcn, @cursor/sdk, openai, zod
├── tsconfig.json                  # strict TS
├── next.config.ts                 # default
├── tailwind.config.ts             # shadcn preset
├── data/                          # all mock data, hand-tuned for demo
│   ├── invoices.json              # 30-50 mock invoices, varied terms
│   ├── cash-forecast.json         # 60-day AR/AP rolling forecast w/ floor
│   └── vendors.json               # vendor catalog w/ Specter identifiers
├── lib/                           # pure logic, no React, no Next.js
│   ├── optimiser.ts               # greedy scheduler w/ cash-floor + vendor-risk
│   ├── policy.ts                  # HITL escalation rules (thresholds + dissent logic)
│   ├── npv.ts                     # discount APR vs cost-of-capital math
│   ├── specter.ts                 # MCP client wrapper (HTTP fallback)
│   ├── cursor.ts                  # @cursor/sdk orchestration helpers
│   ├── llm.ts                     # OpenAI narration helper
│   └── types.ts                   # shared types: Invoice, Vendor, Forecast, Verdict, Schedule
├── agents/                        # sub-agent task definitions for cursor.ts
│   ├── vendor-health.ts           # Specter signals → distress score + rationale
│   ├── cash-impact.ts             # simulate forecast w/ this payment → breach? + buffer
│   └── discount-npv.ts            # APR vs cost of capital + recommendation
├── app/                           # Next.js App Router
│   ├── api/                       # server routes; no DB, all read JSON files via lib/
│   │   ├── optimise/route.ts      # full optimiser → proposed schedule
│   │   ├── investigate/route.ts   # spawns Cursor sub-agents for one invoice
│   │   ├── execute/route.ts       # commits the auto-pay queue
│   │   └── decide/route.ts        # human verdict on an escalation
│   ├── components/                # client UI
│   │   ├── CalendarView.tsx       # 60-day Gantt-style calendar of payments
│   │   ├── InvoiceCard.tsx        # per-invoice status + sub-agent verdicts
│   │   ├── EscalationPanel.tsx    # the "needs human" stack
│   │   ├── SavingsCounter.tsx     # £ saved + cash-floor breaches avoided
│   │   └── PolicyPanel.tsx        # visible "what the agent will / won't do"
│   ├── layout.tsx                 # tailwind globals
│   └── page.tsx                   # single-page demo
└── scripts/
    └── seed.ts                    # generates mock invoices + cash forecast deterministically
```

Every directory has one job. No `utils/` grab-bag. No `helpers/` dumping ground.

## Data Model

JSON files; types defined in `lib/types.ts`. Treat JSON files as immutable inputs read at request time; in-memory state lives only inside one API request.

**Invoice** (`data/invoices.json`)

```ts
type Invoice = {
  id: string;              // INV-0001
  vendorId: string;        // V-001
  amount: number;          // GBP
  issuedDate: string;      // ISO yyyy-mm-dd
  dueDate: string;         // ISO yyyy-mm-dd
  terms: string;           // "2/10 net 30"
  discountPct?: number;    // parsed from terms (0.02)
  discountDays?: number;   // 10
  netDays: number;         // 30
  poRef?: string;
  category: string;        // "saas" | "supplies" | "logistics" | ...
};
```

**CashForecast** (`data/cash-forecast.json`)

```ts
type CashFlow  = { date: string; inflow: number; outflow: number; label: string };
type Forecast  = {
  openingCash: number;
  cashFloor: number;       // hard constraint - never breach
  flows: CashFlow[];       // payroll, rent, AR receipts, recurring
};
```

**Vendor** (`data/vendors.json`)

```ts
type Vendor = {
  id: string;
  name: string;
  specterId?: string;
  paymentHistory: 'reliable' | 'late' | 'inconsistent' | 'new';
  strategicTier: 1 | 2 | 3;   // 1 = critical, 3 = commodity
};
```

**Scheduled output** (constructed in `lib/optimiser.ts`, returned by `/api/optimise`)

```ts
type ScheduleEntry = {
  invoiceId: string;
  payDate: string;            // ISO
  reason: 'auto-discount' | 'auto-due' | 'auto-stretch' | 'flagged';
  projectedSaving: number;    // GBP
};
type Verdict        = { agent: string; recommendation: 'pay-early' | 'pay-on-time' | 'stretch' | 'defer'; rationale: string; score?: number };
type Escalation     = { invoiceId: string; verdicts: Verdict[]; reasonForEscalation: string };
type Schedule       = { entries: ScheduleEntry[]; escalations: Escalation[]; totalSaving: number; floorBreaches: number };
```

**Constraints / invariants**
- `cash_balance(t) >= forecast.cashFloor` for every `t` in the 60-day horizon. Never optimise to a breach.
- Discount taken only if `discountAPR > costOfCapital` AND `vendor.distressScore < 0.3` AND no breach.
- If `vendor.distressScore > 0.5`, defer past due date (don't prepay the funeral) and escalate.

No indexes, no relationships beyond `Invoice.vendorId → Vendor.id` (linear scan; max 50 invoices).

## API Design

All routes are unauthenticated (single demo session). All accept / return JSON. No middleware.

| Method | Path                  | Body                                    | Returns                  | Purpose                                |
|--------|-----------------------|-----------------------------------------|--------------------------|----------------------------------------|
| POST   | `/api/optimise`       | `{}`                                    | `Schedule`               | Run full greedy optimiser, return proposed schedule + escalations. |
| POST   | `/api/investigate`    | `{ invoiceId: string }`                 | `{ verdicts: Verdict[] }`| Spawn 3 Cursor sub-agents in parallel; return verdicts. |
| POST   | `/api/execute`        | `{ scheduleId: string }`                | `{ executed: number }`   | Commit auto-pay queue (writes a `runs/` JSON for replay). |
| POST   | `/api/decide`         | `{ invoiceId: string; verdict: 'approve' | 'defer' | 'reject'; reason: string }` | `{ ok: true }` | Human decision on an escalation; appended to run log. |

Auth model: none. All rails read mock JSON; nothing leaves the box except Specter and OpenAI calls.

## Service Boundaries

- **`lib/`** — pure TS, no Next.js imports, no React. Reusable from API routes and tests.
- **`agents/`** — task definitions consumed by `lib/cursor.ts`. Each exports a `run(input)` returning a `Verdict`.
- **`app/api/`** — thin HTTP wrappers over `lib/` and `agents/`. No business logic.
- **`app/components/`** — React only. Fetches via `fetch('/api/…')`. No direct file reads.
- **`scripts/seed.ts`** — only writer to `data/`. Hand-tuned to guarantee 3 deterministic escalation cases.

Rule: if a function touches both a request object and the optimiser, it lives in the API route, not in `lib/`.

## Data Flow (primary use case: Optimise → Investigate → Decide → Execute)

1. UI loads → `GET` mock data via static imports (initial render).
2. User clicks **Optimise** → `POST /api/optimise` reads JSON, runs `lib/optimiser.ts`, returns `Schedule` with auto-pay entries + flagged escalations.
3. Calendar component animates the new dates; SavingsCounter increments.
4. For each flagged invoice the EscalationPanel calls `POST /api/investigate` → fan-out via `lib/cursor.ts` to three sub-agents in parallel, returns 3 verdicts.
5. Aggregator inside `/api/investigate` (or client-side) renders the cards: unanimous-proceed turns green, dissent stays in the panel.
6. User clicks **Approve / Defer / Reject** → `POST /api/decide` records reason + decision in `runs/<id>.json`.
7. User clicks **Execute** → `POST /api/execute` finalises auto-pay queue and writes the run log. UI shows total saved + breaches avoided.

Latency targets: `/api/optimise` < 200 ms (pure TS over 50 invoices). `/api/investigate` < 3 s (three parallel sub-agent calls; cache by invoiceId for demo determinism).
