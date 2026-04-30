# Working Capital Optimiser - Architecture

## System Overview

```
[Mock invoice JSON]
       │
       ▼
[POST /api/optimise]
       │
       ├──► lib/specter.ts (pre-fetch distressScores for every vendor, MCP w/ HTTP fallback)
       ├──► lib/optimiser.ts (greedy + cash-floor + max-stretch)
       │       │
       │       ├──► auto-pay queue   (small + clean + cash-safe)
       │       └──► flagged set
       │
       └──► persist runs/<scheduleId>.pending.json; return Schedule { scheduleId, ... }

[POST /api/investigate?invoiceId=…]
       │
       ├──► agents/vendor-health.ts   (reads pre-fetched Specter score; explains it)
       ├──► agents/cash-impact.ts     (lib/optimiser.simulate)
       └──► agents/discount-npv.ts    (lib/npv.ts)
                │
                ▼
       [Aggregator returns Verdict[]]
                │
                ├──► unanimous proceed → human one-click approve
                └──► dissent / risk    → escalation panel (HITL)
                                              │
                                              ▼
                                       [POST /api/decide]
                                              │
                                              ▼
                                       [POST /api/execute scheduleId]
                                              │
                                              ▼
                                       runs/<scheduleId>.executed.json
```

`app/page.tsx` is a server component: reads `data/*.json` at the boundary and passes
props into a client `<Dashboard>` (calendar, cards, escalation panel, savings counter,
policy panel). Client components fetch via `/api/...`, never read filesystem.

## Tech Stack

| Layer            | Technology                              | Rationale                                                        |
|------------------|-----------------------------------------|------------------------------------------------------------------|
| Frontend / API   | Next.js 15 App Router                   | Already used for Luminus; fast scaffold; Vercel deploy is 1 command. |
| UI components    | Tailwind + shadcn/ui                    | Defaults are good enough for a 4.5h demo; no design polish needed. |
| Agent runtime    | `@cursor/sdk` (TypeScript)              | Rubric bonus requires structural Cursor SDK usage; local runtime for hackathon speed, cloud as stretch. |
| Market intel     | Specter via MCP; HTTP fallback          | Rubric bonus; MCP is the theatrical version, HTTP keeps us shipping if MCP wiring is shaky. |
| LLM              | OpenAI gpt-5 / gpt-5-mini               | Sub-agent reasoning. Escalation narration is **fixture-cached by `invoiceId`** under `DEMO_REPLAY=1`; live LLM is never on the demo critical path. |
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

**Scheduled output** (constructed in `lib/optimiser.ts`, returned by `/api/optimise`,
persisted to `runs/<scheduleId>.pending.json`)

```ts
type ScheduleEntry = {
  invoiceId: string;
  payDate: string;            // ISO
  reason: 'auto-discount' | 'auto-due' | 'auto-stretch' | 'flagged';
  projectedSaving: number;    // GBP
  distressScore: number;      // 0-1, from Specter, copied onto every entry for UI badge
};
type Verdict        = { agent: string; recommendation: 'pay-early' | 'pay-on-time' | 'stretch' | 'defer'; rationale: string; score?: number };
type Escalation     = { invoiceId: string; verdicts: Verdict[]; reasonForEscalation: string };
type Schedule       = {
  scheduleId: string;                  // ULID; persisted to runs/<id>.pending.json
  entries: ScheduleEntry[];
  escalations: Escalation[];
  totalSaving: number;                 // GBP captured in discounts vs naive baseline
  breachesAvoidedVsBaseline: number;   // count of cash-floor breaches the naive (pay-on-due) schedule would cause that this schedule avoids
};
```

**Constraints / invariants** (every `Schedule` returned by `lib/optimiser.ts` must satisfy)
- `cashBalance(t) >= forecast.cashFloor` for every `t` in the 60-day horizon, **including deferred payments.** Never optimise to a breach.
- Discount taken only if `discountAPR > costOfCapital` AND `distressScore < 0.3` AND simulator confirms no breach across the whole horizon.
- If `distressScore > 0.5`, defer to `min(dueDate + 7d, dueDate + MAX_STRETCH_DAYS)` where `MAX_STRETCH_DAYS = 14`, and emit an escalation. Never stretch beyond 14d past due (late-fee + relationship risk).
- `breachesAvoidedVsBaseline` is computed by running the optimiser twice in `/api/optimise`: once with `forceNaive=true` (always pay on due date) for the baseline, once with the full policy. Diff the breach count.

No indexes, no relationships beyond `Invoice.vendorId → Vendor.id` (linear scan; max 50 invoices).

## API Design

All routes are unauthenticated (single demo session). All accept / return JSON. No middleware.

**Stateless on Cloudflare:** Worker instances don't share memory across requests, so persistence happens client-side. `/api/optimise` mints a `scheduleId` and returns the full `Schedule` with each entry's `distressScore`; the client carries that data on subsequent calls.

| Method | Path                  | Body                                    | Returns                  | Purpose                                |
|--------|-----------------------|-----------------------------------------|--------------------------|----------------------------------------|
| POST   | `/api/optimise`       | `{}`                                    | `Schedule`               | Pre-fetch Specter scores for all vendors, run baseline + full optimiser, mint `scheduleId`, return Schedule + escalations (no server-side persistence). |
| POST   | `/api/investigate`    | `{ scheduleId: string; invoiceId: string; distressScore: number; forceDistress?: number }` | `{ verdicts, parallelism, narration, effectiveDistress }` | Spawn 3 Cursor sub-agents in parallel via `lib/cursor.ts::fanOut`; return verdicts + narration. Cache by `(scheduleId, invoiceId)`. `forceDistress` overrides for the Specter alert demo. |
| POST   | `/api/decide`         | `{ scheduleId: string; invoiceId: string; verdict: 'approve' \| 'defer' \| 'reject'; reason: string }` | `{ ok: true }` | Validates the decision; client tracks it locally. |
| POST   | `/api/execute`        | `{ scheduleId: string; autoPayCount: number; decisions: { invoiceId, verdict }[] }` | `{ executed, approved, deferred, rejected }` | Returns the execution summary. |

Auth model: none. All rails read mock JSON; nothing leaves the box except Specter and OpenAI calls.

## Service Boundaries

- **`lib/`** — pure TS, no Next.js imports, no React, no `fs` reads. Reusable from API routes and tests.
- **`lib/policy.ts`** — single source of truth. Exports `AUTO_PAY_RULES` and `ESCALATE_RULES` as data (typed const arrays). `app/components/PolicyPanel.tsx` imports these constants directly. No duplicate string literals; if rule text drifts, the type-checker catches it.
- **`agents/`** — task definitions consumed by `lib/cursor.ts`. Each exports a `run(input)` returning a `Verdict`.
- **`app/api/`** — thin HTTP wrappers over `lib/` and `agents/`. Only place that does `fs` reads + Zod parsing.
- **`app/page.tsx`** — server component. Reads `data/*.json` once, passes props to `<Dashboard>` (client component).
- **`app/components/`** — React only. Fetches via `fetch('/api/…')`. No direct file reads, no static JSON imports.
- **`scripts/seed.ts`** — only writer to `data/`. Hand-tuned to guarantee 3 deterministic escalation cases.

Rule: if a function touches both a request object and the optimiser, it lives in the API route, not in `lib/`.

## Data Flow (primary use case: Optimise → Investigate → Decide → Execute)

1. Server `app/page.tsx` reads `data/*.json` and passes initial state into client `<Dashboard>`.
2. User clicks **Optimise** → `POST /api/optimise`. Route handler:
   a. Reads `data/*.json` (static imports, bundled at build time).
   b. Pre-fetches Specter `distressScore` for every vendor in parallel (`Promise.all`), using DEMO_REPLAY fixtures when set.
   c. Runs the optimiser twice: once with `forceNaive=true` for baseline, once full. Diffs breach counts.
   d. Mints `scheduleId`, returns `Schedule`. No server-side persistence.
3. Calendar animates new dates; SavingsCounter increments. Every `InvoiceCard` shows a Specter score badge.
4. For each flagged invoice the EscalationPanel calls `POST /api/investigate { scheduleId, invoiceId, distressScore }` → fan-out via `lib/cursor.ts` to three sub-agents in parallel, returns 3 verdicts + parallelism stats + cached narration. Cache hit on second click.
5. Cards render: unanimous proceed turns green, dissent stays amber, distressScore > 0.5 turns red.
6. User clicks **Approve / Defer / Reject** → `POST /api/decide` → returns ok; client tracks the decision in `decisions[]`.
7. User clicks **Execute** → `POST /api/execute { scheduleId, autoPayCount, decisions }` → returns the execution summary. UI shows total saved + breaches avoided.

Latency targets: `/api/optimise` < 500 ms (Specter pre-fetch is the long pole; pure TS optimiser < 50 ms over 50 invoices). `/api/investigate` < 3 s on first call (three parallel sub-agent calls); < 50 ms on cache hit.
