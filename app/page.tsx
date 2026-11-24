import { Dashboard } from '@/app/components/Dashboard';
import { loadAll } from '@/lib/data';
import { AUTO_PAY_RULES, ESCALATE_RULES } from '@/lib/policy';

export default function Home() {
  const { invoices, vendors, forecast } = loadAll();
  return (
    <Dashboard
      invoices={invoices}
      vendors={vendors}
      forecast={forecast}
      autoPayRules={AUTO_PAY_RULES}
      escalateRules={ESCALATE_RULES}
    />
  );
}
