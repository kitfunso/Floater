export const COST_OF_CAPITAL = 0.08;

export function discountAPR(
  discountPct: number,
  discountDays: number,
  netDays: number,
): number {
  if (discountPct <= 0 || discountPct >= 1) return 0;
  const window = netDays - discountDays;
  if (window <= 0) return 0;
  return (discountPct / (1 - discountPct)) * (365 / window);
}

export function shouldTakeDiscount(apr: number, costOfCapital: number = COST_OF_CAPITAL): boolean {
  return apr > costOfCapital;
}
