'use client';

// Renders AUTO_PAY_RULES + ESCALATE_RULES from lib/policy. NEVER duplicate
// rule literals; this panel is the on-screen image of what runs in code.

import type { PolicyRule } from '@/lib/policy';

type Props = {
  autoPayRules: readonly PolicyRule[];
  escalateRules: readonly PolicyRule[];
};

export function PolicyPanel({ autoPayRules, escalateRules }: Props) {
  return (
    <aside className="rounded-lg border bg-card p-4 space-y-5 sticky top-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Policy</h2>
        <p className="text-xs text-muted-foreground mt-1">
          What the agent will and won't do. Sourced from <code className="bg-muted px-1 rounded">lib/policy.ts</code>.
        </p>
      </div>
      <RuleList title="Auto-pay if all true" tone="emerald" rules={autoPayRules} />
      <RuleList title="Escalate if any true" tone="amber" rules={escalateRules} />
    </aside>
  );
}

function RuleList({ title, tone, rules }: { title: string; tone: 'emerald' | 'amber'; rules: readonly PolicyRule[] }) {
  const dot = tone === 'emerald' ? 'bg-emerald-500' : 'bg-amber-500';
  return (
    <section>
      <h3 className="text-xs font-semibold mb-2 flex items-center gap-2">
        <span className={`inline-block size-2 rounded-full ${dot}`} />
        {title}
      </h3>
      <ul className="space-y-2">
        {rules.map((r) => (
          <li key={r.id} className="text-xs leading-snug">
            <div className="font-medium">{r.label}</div>
            <div className="text-muted-foreground">{r.detail}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
