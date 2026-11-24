import { NextResponse } from 'next/server';
import { loadAll } from '@/lib/data';
import { getDistressScore } from '@/lib/specter';
import { optimise, simulate } from '@/lib/optimiser';
import { newScheduleId } from '@/lib/runs';
import type { DistressMap, Invoice } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { invoices, vendors, forecast } = loadAll();

    const distressScores: DistressMap = {};
    await Promise.all(
      vendors.map(async (v) => {
        const sig = await getDistressScore(v.specterId);
        distressScores[v.id] = sig.score;
      }),
    );

    const baseline = optimise({ invoices, vendors, forecast, distressScores, forceNaive: true });
    const invoiceById = new Map<string, Invoice>(invoices.map((i) => [i.id, i]));
    const baselineSim = simulate(baseline.entries, forecast, invoiceById);

    const full = optimise({ invoices, vendors, forecast, distressScores });
    const fullSim = simulate(full.entries, forecast, invoiceById);

    const breachesAvoidedVsBaseline =
      baselineSim.breachDay !== null && fullSim.breachDay === null ? 1 : 0;

    full.scheduleId = newScheduleId();
    full.breachesAvoidedVsBaseline = breachesAvoidedVsBaseline;

    return NextResponse.json(full);
  } catch (err) {
    console.error('optimise error', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
