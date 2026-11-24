export type Invoice = {
  id: string;
  vendorId: string;
  amount: number;
  issuedDate: string;
  dueDate: string;
  terms: string;
  discountPct?: number;
  discountDays?: number;
  netDays: number;
  poRef?: string;
  category: string;
};

export type Vendor = {
  id: string;
  name: string;
  specterId?: string;
  paymentHistory: 'reliable' | 'late' | 'inconsistent' | 'new';
  strategicTier: 1 | 2 | 3;
};

export type CashFlow = {
  date: string;
  inflow: number;
  outflow: number;
  label: string;
};

export type Forecast = {
  openingCash: number;
  cashFloor: number;
  flows: CashFlow[];
};

export type DistressSignal = {
  score: number;
  rationale: string;
};

export type Verdict = {
  agent: 'vendor-health' | 'cash-impact' | 'discount-npv';
  recommendation: 'pay-early' | 'pay-on-time' | 'stretch' | 'defer';
  rationale: string;
  score?: number;
};

export type ScheduleEntry = {
  invoiceId: string;
  payDate: string;
  reason: 'auto-discount' | 'auto-due' | 'auto-stretch' | 'flagged';
  projectedSaving: number;
  distressScore: number;
};

export type Escalation = {
  invoiceId: string;
  verdicts: Verdict[];
  reasonForEscalation: string;
};

export type Schedule = {
  scheduleId: string;
  entries: ScheduleEntry[];
  escalations: Escalation[];
  totalSaving: number;
  breachesAvoidedVsBaseline: number;
};

export type DistressMap = Record<string, number>;

export type OptimiserInput = {
  invoices: readonly Invoice[];
  vendors: readonly Vendor[];
  forecast: Forecast;
  distressScores: DistressMap;
  forceNaive?: boolean;
};
