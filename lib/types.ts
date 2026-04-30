// Shared types for Floater. JSON files in data/ conform to these shapes.

export type Invoice = {
  id: string;              // INV-0001
  vendorId: string;        // V-001
  amount: number;          // GBP
  issuedDate: string;      // ISO yyyy-mm-dd
  dueDate: string;         // ISO yyyy-mm-dd
  terms: string;           // "2/10 net 30" or "net 30"
  discountPct?: number;    // 0.02 for "2/10 net 30"
  discountDays?: number;   // 10 for "2/10 net 30"
  netDays: number;         // 30
  poRef?: string;
  category: string;        // "saas" | "supplies" | "logistics" | "professional" | "other"
};

export type Vendor = {
  id: string;
  name: string;
  specterId?: string;
  paymentHistory: 'reliable' | 'late' | 'inconsistent' | 'new';
  strategicTier: 1 | 2 | 3;   // 1 = critical, 3 = commodity
};

export type CashFlow = {
  date: string;            // ISO
  inflow: number;
  outflow: number;
  label: string;
};

export type Forecast = {
  openingCash: number;
  cashFloor: number;       // hard constraint, never breach
  flows: CashFlow[];       // payroll, rent, AR receipts, recurring
};

// Output of lib/specter.ts::getDistressScore — also embedded into Verdict.
export type DistressSignal = {
  score: number;     // 0-1
  rationale: string; // one-line explanation
};

export type Verdict = {
  agent: 'vendor-health' | 'cash-impact' | 'discount-npv';
  recommendation: 'pay-early' | 'pay-on-time' | 'stretch' | 'defer';
  rationale: string;
  score?: number;    // distress score for vendor-health, minBuffer for cash-impact, APR-COC delta for discount-npv
};

export type ScheduleEntry = {
  invoiceId: string;
  payDate: string;            // ISO
  reason: 'auto-discount' | 'auto-due' | 'auto-stretch' | 'flagged';
  projectedSaving: number;    // GBP captured by paying early
  distressScore: number;      // 0-1, copied from Specter pre-fetch for UI badge
};

export type Escalation = {
  invoiceId: string;
  verdicts: Verdict[];           // empty until /api/investigate runs
  reasonForEscalation: string;   // human-readable summary of which policy rule(s) failed
};

export type Schedule = {
  scheduleId: string;                  // ULID/UUID; persisted to runs/<id>.pending.json
  entries: ScheduleEntry[];
  escalations: Escalation[];
  totalSaving: number;                 // GBP captured by discounts vs naive baseline
  breachesAvoidedVsBaseline: number;   // count of cash-floor breaches the naive (pay-on-due) schedule would have caused that this schedule prevents
};

// Inputs the optimiser takes. distressScores is keyed by vendorId, populated by
// /api/optimise after Promise.all over Specter.
export type DistressMap = Record<string, number>;

export type OptimiserInput = {
  invoices: readonly Invoice[];
  vendors: readonly Vendor[];
  forecast: Forecast;
  distressScores: DistressMap;
  forceNaive?: boolean;          // if true, every entry is pay-on-due (used to compute baseline)
};
