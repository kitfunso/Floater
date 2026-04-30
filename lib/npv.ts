// Discount APR vs cost-of-capital math.
// "2/10 net 30" = 2% discount if paid in 10 days, otherwise full amount due in 30.
// Implicit APR = (discount / (1 - discount)) * (365 / (netDays - discountDays))

export const COST_OF_CAPITAL = 0.08; // single source of truth for the demo

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
