// Inline test for npv + policy. Run: npx tsx lib/__tests__/policy.test.ts
import { discountAPR, shouldTakeDiscount, COST_OF_CAPITAL } from '../npv';
import { AUTO_PAY_RULES, ESCALATE_RULES, classify, MAX_STRETCH_DAYS } from '../policy';
import type { Invoice, Vendor } from '../types';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass += 1;
    console.log(`  ok  ${name}`);
  } else {
    fail += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- npv ---
console.log('npv');
const apr210 = discountAPR(0.02, 10, 30);
check('discountAPR(2/10 net 30) ≈ 0.372', Math.abs(apr210 - 0.3724) < 0.001, `got ${apr210}`);
const apr510 = discountAPR(0.05, 10, 30);
check('discountAPR(5/10 net 30) ≈ 0.96',  Math.abs(apr510 - 0.9605) < 0.001, `got ${apr510}`);
check('shouldTakeDiscount(0.37) true',  shouldTakeDiscount(apr210));
check('shouldTakeDiscount(0.05) false', !shouldTakeDiscount(0.05));
check('COST_OF_CAPITAL is 0.08', COST_OF_CAPITAL === 0.08);

// --- policy rule data ---
console.log('policy rules');
check('AUTO_PAY_RULES has 5 rows',  AUTO_PAY_RULES.length === 5);
check('ESCALATE_RULES has 5 rows',  ESCALATE_RULES.length === 5);
check('MAX_STRETCH_DAYS === 14',    MAX_STRETCH_DAYS === 14);

// --- classify ---
console.log('classify');
const reliableVendor: Vendor = {
  id: 'V-001', name: 'Test', paymentHistory: 'reliable', strategicTier: 2, specterId: 'specter-clean-1',
};
const newVendor: Vendor = {
  id: 'V-010', name: 'New', paymentHistory: 'new', strategicTier: 3,
};
function inv(amount: number): Invoice {
  return {
    id: 'INV-T', vendorId: 'V-001', amount,
    issuedDate: '2026-05-01', dueDate: '2026-05-31', terms: 'net 30', netDays: 30,
    category: 'saas',
  };
}

const small = classify({ invoice: inv(2000), vendor: reliableVendor, distressScore: 0.1, payOnDueWouldBreach: false });
check('£2k reliable clean ⇒ auto',           small.decision === 'auto');

const big = classify({ invoice: inv(8000), vendor: reliableVendor, distressScore: 0.1, payOnDueWouldBreach: false });
check('£8k reliable clean ⇒ flagged (amount)', big.decision === 'flagged' && big.failedRuleIds.includes('esc-amount'));

const newV = classify({ invoice: inv(2000), vendor: newVendor, distressScore: 0.1, payOnDueWouldBreach: false });
check('£2k NEW vendor ⇒ flagged (history)',    newV.decision === 'flagged' && newV.failedRuleIds.includes('esc-history'));

const distressed = classify({ invoice: inv(2000), vendor: reliableVendor, distressScore: 0.7, payOnDueWouldBreach: false });
check('distress 0.7 ⇒ flagged (specter)',      distressed.decision === 'flagged' && distressed.failedRuleIds.includes('esc-specter'));

const breach = classify({ invoice: inv(2000), vendor: reliableVendor, distressScore: 0.1, payOnDueWouldBreach: true });
check('pay-on-due breach ⇒ flagged (breach)',  breach.decision === 'flagged' && breach.failedRuleIds.includes('esc-breach'));

const multi = classify({ invoice: inv(8000), vendor: newVendor, distressScore: 0.1, payOnDueWouldBreach: false });
check('£8k + new ⇒ 2 failed rules',            multi.failedRuleIds.length === 2);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
