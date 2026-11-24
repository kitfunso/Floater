import type { Invoice, Vendor, Forecast, Verdict } from './types';

// Typed loosely (unknown) so Next.js can compile when the SDK is hidden
// during CF builds (see scripts/build-cf.mjs).
export type CursorSdkLite = {
  Agent: {
    create(opts: {
      apiKey: string;
      model: { id: string };
      name?: string;
      local?: { cwd?: string };
    }): Promise<{
      send(prompt: string): Promise<{ wait(): Promise<{ status: string; text?: string } | null | undefined> }>;
      close(): void;
    }>;
  };
};

// Dynamic loader for @cursor/sdk. Hidden behind string concat so bundlers
// (esbuild on Cloudflare Workers) skip it — the SDK has Node-only dynamic
// requires that don't survive Workers bundling. Live path only.
export async function loadCursorSdk(): Promise<CursorSdkLite | null> {
  try {
    const mod = '@cursor' + '/sdk';
    return (await import(/* webpackIgnore: true */ mod)) as unknown as CursorSdkLite;
  } catch {
    return null;
  }
}

export type AgentInput = {
  invoice: Invoice;
  vendor: Vendor;
  forecast: Forecast;
  distressScore: number;
  scheduleId: string;
};

export type AgentRunResult = {
  verdict: Verdict;
  startedAt: number;
  finishedAt: number;
};

export type SubAgent = {
  name: Verdict['agent'];
  run(input: AgentInput): Promise<AgentRunResult>;
};

export type FanOutResult = {
  verdicts: Verdict[];
  parallelism: {
    spreadMs: number;
    durationMs: number;
    sequentialMs: number;
    speedup: number;
    agentCount: number;
  };
};

const cache = new Map<string, FanOutResult>();

export function cacheKey(scheduleId: string, invoiceId: string): string {
  return `${scheduleId}|${invoiceId}`;
}

export async function fanOut(
  input: AgentInput,
  agents: readonly SubAgent[],
): Promise<FanOutResult> {
  const key = cacheKey(input.scheduleId, input.invoice.id);
  const hit = cache.get(key);
  if (hit) return hit;

  const wallStart = Date.now();
  const results = await Promise.all(agents.map((a) => a.run(input)));
  const wallEnd = Date.now();

  const startTs = results.map((r) => r.startedAt);
  const sequentialMs = results.reduce((sum, r) => sum + (r.finishedAt - r.startedAt), 0);
  const durationMs = wallEnd - wallStart;

  const out: FanOutResult = {
    verdicts: results.map((r) => r.verdict),
    parallelism: {
      spreadMs: Math.max(...startTs) - Math.min(...startTs),
      durationMs,
      sequentialMs,
      speedup: durationMs > 0 ? +(sequentialMs / durationMs).toFixed(2) : agents.length,
      agentCount: agents.length,
    },
  };
  cache.set(key, out);
  return out;
}

export function _clearCacheForTest(): void {
  cache.clear();
}
