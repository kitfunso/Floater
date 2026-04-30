# Floater - Working Capital Optimiser

> AP scheduling agent that auto-pays clean invoices, escalates the wobbly ones, and turns 2/10 net 30 into real £ saved with cash-floor and counterparty guardrails.

Built for Cursor x Briefcase London 2026 (Money Movement track, 4.5h build window).

## What it does

- Loads 40 mock invoices, 12 vendors, a 60-day cash forecast.
- Pre-fetches Specter distress scores for every vendor in parallel.
- Runs a greedy optimiser twice (naive baseline + full policy) and diffs the breach counts so you see the agent's value as `breachesAvoidedVsBaseline`.
- Auto-pays everything that satisfies all 5 policy rules (small + reliable + low distress + cash-safe + within 14d stretch window).
- Flags everything else for sub-agent investigation.
- For each flagged invoice, fans out **3 sub-agents in parallel via @cursor/sdk** (vendor-health, cash-impact, discount-NPV). The UI shows the parallelism timing strip on every card so judges see structural concurrency, not a sequential pretender.
- Single human "Approve / Defer / Reject" decision per escalation; everything else auto-executes.

## Demo flow

1. Click **Optimise** -> calendar populates, savings counter ticks to £3,529, 3 escalations surface (`INV-LARGE-NEW`, `INV-SPECTER-DISTRESSED`, `INV-FLOOR-BREACH`).
2. Click **Investigate** on any flagged card -> 3 sub-agents return verdicts in <200ms wallclock with non-zero parallel spread.
3. Click **Trigger Specter alert** -> `INV-FLOOR-BREACH` flips red, vendor-health verdict moves to `defer`, narration switches to the alert fixture.
4. Approve / Defer / Reject the cards.
5. Click **Execute schedule** -> commits the auto-pay queue and approved escalations to a run log.

## Architecture

```
[data/*.json]
      |
      v
[POST /api/optimise]
      |-- pre-fetch Specter for every vendor (Promise.all)
      |-- run optimiser twice (forceNaive baseline + full)
      |-- mint scheduleId, write runs/<id>.pending.json
      |-- return Schedule { entries, escalations, totalSaving, breachesAvoidedVsBaseline }

[POST /api/investigate { scheduleId, invoiceId, forceDistress? }]
      |-- read runs/<id>.pending.json
      |-- fanOut(ALL_AGENTS) via Promise.all
      |-- return { verdicts, parallelism, narration }

[POST /api/decide]    -> append runs/<id>.decisions.jsonl
[POST /api/execute]   -> write runs/<id>.executed.json (idempotent)
```

Stack: Next.js 15 App Router, React 19, Tailwind 4, shadcn primitives, `@cursor/sdk@1.0.11`, `openai`, `zod`, JSON files (no DB).

## Non-negotiables (also in CLAUDE.md)

1. `.env.local` is gitignored before any key is written.
2. Never breach the cash floor, including under deferred payments. `MAX_STRETCH_DAYS = 14`.
3. HITL escalation is **earned, not blanket**. Sub-agents only run on flagged invoices via `/api/investigate`.
4. Sub-agents must fan out in parallel via `Promise.all`. Sequential calls don't earn the rubric bonus.
5. Specter is a structural decision input, not decoration. `distressScore` gates the pay-early branch in `lib/optimiser.ts`.
6. Deterministic demo. `DEMO_REPLAY=1` swaps Specter + OpenAI calls for fixtures. Live LLM is never on the demo critical path.

## Setup

```bash
# 1. Clone + install
git clone https://github.com/kitfunso/Floater.git
cd Floater
npm install

# 2. Configure env
cp .env.local.example .env.local
# Fill in SPECTER_API_KEY, CURSOR_API_KEY, OPENAI_API_KEY (last is optional)
# Keep DEMO_REPLAY=1 for the demo path

# 3. Generate seed (already committed; only re-run if you change scripts/seed.ts)
npx tsx scripts/seed.ts

# 4. Boot dev server
npm run dev
# -> http://localhost:3000
```

## Verify

```bash
# Type check + production build
npm run typecheck
npm run build

# Run all tests (deterministic under DEMO_REPLAY=1)
DEMO_REPLAY=1 npx tsx lib/__tests__/policy.test.ts       # 14/14 npv + policy
DEMO_REPLAY=1 npx tsx lib/__tests__/optimiser.test.ts    # 15/15 optimiser + determinism harness
DEMO_REPLAY=1 npx tsx lib/__tests__/cursor.test.ts       # 15/15 cursor SDK fanOut
```

The optimiser test asserts the **exact** escalation set: `[INV-FLOOR-BREACH, INV-LARGE-NEW, INV-SPECTER-DISTRESSED]`. If seed math drifts, the test fails before the demo.

## Env vars

| Var | Purpose | Notes |
|-----|---------|-------|
| `SPECTER_API_KEY` | Specter REST auth | The brief key is **assumed burned post-event**; rotate before any real use |
| `SPECTER_BASE_URL` | Specter base | Default `https://api.tryspecter.com` |
| `CURSOR_API_KEY` | @cursor/sdk auth | Required for live sub-agent runs (not the demo path) |
| `OPENAI_API_KEY` | gpt-5-mini | Optional; only used when `DEMO_REPLAY=0` |
| `DEMO_REPLAY` | `1` = fixtures, `0` = live | **Set `1` in production deploys** so the demo never depends on a flaky network |
| `RUNS_DIR` | Override runs/ path | Auto-set to `/tmp/floater-runs` on Vercel |

## Deploy

**Live demo:** https://floater.skfsk27.workers.dev

Cloudflare Workers via OpenNext:

```bash
npm run deploy:cf      # build + wrangler deploy in one shot
npm run preview:cf     # build + wrangler dev (local Worker preview)
```

The build script (`scripts/build-cf.mjs`) hides `node_modules/@cursor/sdk`
during the OpenNext + wrangler bundle pass so esbuild doesn't trip on the
SDK's dynamic `require` patterns or `.d.ts` files. The SDK is only used in
the live (non-DEMO_REPLAY) path, which Cloudflare Workers can't run anyway,
so the lazy `loadCursorSdk()` returns null and the demo fixture path takes
over. The SDK is restored on local dev / Vercel deploys.

API routes are stateless on Cloudflare (Worker instances don't share
in-memory state). The client holds the `Schedule` from `/api/optimise` and
passes the per-entry `distressScore` to subsequent `/api/investigate` calls
plus `autoPayCount + decisions[]` to `/api/execute`.

Vercel deploy still works the same way:

```bash
vercel link && vercel --prod
```

## Build plan recap

13 steps in `docs/plans/2026-04-30-phase-1.md`. Foundation docs at `docs/PRD.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md`. Reviewed by codex + plan-eng-review before code.

Track: Money Movement.
