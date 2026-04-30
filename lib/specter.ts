// Specter wrapper. Returns a normalised distress score 0-1 + rationale.
// Under DEMO_REPLAY=1 (default in production deploys), serves fixtures so the
// demo critical path never depends on a live API.

import type { DistressSignal } from './types';

const FIXTURES: Record<string, DistressSignal> = {
  'specter-distressed-1': {
    score: 0.72,
    rationale: 'Layoffs reported last 30d; payment delays flagged across vendor network',
  },
  'specter-clean-1': { score: 0.08, rationale: 'No adverse signals in 90d window' },
  'specter-clean-2': { score: 0.12, rationale: 'Minor late filings, otherwise stable' },
  'specter-clean-3': { score: 0.05, rationale: 'No adverse signals in 90d window' },
  'specter-clean-4': { score: 0.15, rationale: 'Funding round closed last quarter' },
  'specter-clean-5': { score: 0.09, rationale: 'No adverse signals in 90d window' },
  'specter-clean-6': { score: 0.18, rationale: 'Minor cashflow chatter, no late payments' },
  'specter-clean-7': { score: 0.10, rationale: 'No adverse signals in 90d window' },
  'specter-clean-8': { score: 0.07, rationale: 'No adverse signals in 90d window' },
  'specter-clean-9': { score: 0.14, rationale: 'No adverse signals in 90d window' },
  'specter-clean-10': { score: 0.11, rationale: 'No adverse signals in 90d window' },
  'specter-clean-11': { score: 0.06, rationale: 'No adverse signals in 90d window' },
};

function fixture(specterId: string): DistressSignal {
  const hit = FIXTURES[specterId];
  if (hit) return hit;
  return { score: 0.10, rationale: 'No adverse signals (default, no Specter id mapped)' };
}

function isDemoReplay(): boolean {
  return process.env.DEMO_REPLAY === '1';
}

export async function getDistressScore(specterId: string | undefined): Promise<DistressSignal> {
  if (!specterId) return { score: 0.0, rationale: 'No Specter id; treated as clean' };

  if (isDemoReplay()) return fixture(specterId);

  const apiKey = process.env.SPECTER_API_KEY;
  const baseUrl = process.env.SPECTER_BASE_URL ?? 'https://api.tryspecter.com';
  if (!apiKey) {
    return fixture(specterId);
  }

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${baseUrl}/v1/companies/${encodeURIComponent(specterId)}/signals`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return fixture(specterId);
    const body = (await res.json()) as { distress_score?: number; rationale?: string };
    const score = clamp01(body.distress_score ?? 0.1);
    return { score, rationale: body.rationale ?? 'Specter signal received' };
  } catch {
    return fixture(specterId);
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
