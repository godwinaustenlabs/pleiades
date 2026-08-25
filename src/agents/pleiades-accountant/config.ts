import { and, isNull, or, gt, lte, eq } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../../index';

/** One compliance variable as the operator configured it. */
export interface ConfigVar {
  key: string;
  group: string;
  label: string;
  description: string | null;
  valueType: 'percent' | 'currency' | 'number' | 'date' | 'text' | 'boolean' | 'json';
  unit: string | null;
  value: string | null;
  required: boolean;
  sortOrder: number;
}

/** Human-readable group headings, in the order the prompt and UI present them. */
export const GROUP_LABELS: Record<string, string> = {
  company: 'Company',
  tax_year: 'Tax year',
  income_tax: 'Income tax',
  minimum_tax: 'Minimum tax',
  advance_tax: 'Advance tax',
  salary_withholding: 'Salary withholding',
  vendor_withholding: 'Vendor / contractor withholding',
  eobi: 'EOBI',
  pessi_sessi: 'PESSI / SESSI',
  wwf_wppf: 'WWF / WPPF',
  sales_tax: 'Sales tax',
  secp: 'SECP',
  filing_deadlines: 'Filing deadlines',
};

export const GROUP_ORDER = Object.keys(GROUP_LABELS);

/**
 * The compliance configuration in force on a given date.
 *
 * Rows are effective-dated, so a rate change is a new row rather than an edit.
 * Asking for the configuration "as of" a date is what lets a document generated
 * last year still be explained by the rate that applied when it was made.
 */
export async function loadConfig(env: Env, asOf: Date = new Date()): Promise<ConfigVar[]> {
  const db = getDb(env);
  const date = asOf.toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(schema.complianceConfig)
    .where(
      and(
        lte(schema.complianceConfig.effectiveFrom, date),
        or(isNull(schema.complianceConfig.effectiveTo), gt(schema.complianceConfig.effectiveTo, date)),
      ),
    );

  // Several rows can share a key across effective windows; the latest one that
  // has already taken effect wins.
  const latest = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    const seen = latest.get(row.configKey);
    if (!seen || row.effectiveFrom > seen.effectiveFrom) latest.set(row.configKey, row);
  }

  return [...latest.values()]
    .map((r) => ({
      key: r.configKey,
      group: r.groupName,
      label: r.label,
      description: r.description,
      valueType: r.valueType as ConfigVar['valueType'],
      unit: r.unit,
      value: r.value,
      required: !!r.required,
      sortOrder: r.sortOrder,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Required variables the operator has not filled in yet. */
export const missingRequired = (vars: ConfigVar[]): ConfigVar[] =>
  vars.filter((v) => v.required && (v.value === null || v.value === ''));

/** Renders a value the way an accountant would expect to read it. */
function formatValue(v: ConfigVar): string {
  if (v.value === null || v.value === '') return 'NOT CONFIGURED';

  switch (v.valueType) {
    case 'percent':
      return `${v.value}%`;
    case 'currency':
      // Grouped digits: an unformatted 250000000 is genuinely hard to read
      // correctly, and misreading a threshold by an order of magnitude is
      // exactly the kind of error this agent must not make.
      return `${v.unit || 'PKR'} ${Number(v.value).toLocaleString('en-US')}`;
    case 'boolean':
      return v.value === 'true' ? 'yes' : 'no';
    case 'json':
      try {
        return JSON.stringify(JSON.parse(v.value));
      } catch {
        return v.value;
      }
    default:
      return v.value;
  }
}

/**
 * Renders the configuration as the compliance context block of the system
 * prompt.
 *
 * Two things this does deliberately:
 *
 *  - It states unset variables as NOT CONFIGURED rather than omitting them. A
 *    silently absent rate invites the model to supply one from training data;
 *    a named gap it has been told to refuse on does not.
 *  - It carries no rates of its own. Everything here came from the operator, so
 *    when a Finance Act changes, the prompt changes with the configuration and
 *    there is no second place to update.
 */
export function renderComplianceContext(vars: ConfigVar[]): string {
  const byGroup = new Map<string, ConfigVar[]>();
  for (const v of vars) {
    if (!byGroup.has(v.group)) byGroup.set(v.group, []);
    byGroup.get(v.group)!.push(v);
  }

  const groups = [...byGroup.keys()].sort(
    (a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99),
  );

  const lines: string[] = [
    '# COMPLIANCE CONFIGURATION (operator-supplied — this is the only source of rates)',
    '',
    'Every figure below was entered by the operator in the agent settings, not by',
    'you and not by whoever wrote your prompt. Use these values and no others.',
    'If a figure you need says NOT CONFIGURED, say so plainly and stop — do not',
    'substitute a rate you remember, infer one from a similar jurisdiction, or',
    'interpolate between values that are present.',
    '',
  ];

  for (const g of groups) {
    lines.push(`## ${GROUP_LABELS[g] || g}`);
    for (const v of byGroup.get(g)!) {
      const unset = v.value === null || v.value === '';
      lines.push(`- ${v.label}: ${formatValue(v)}${unset && v.required ? '  [REQUIRED — unset]' : ''}`);
    }
    lines.push('');
  }

  const missing = missingRequired(vars);
  if (missing.length > 0) {
    lines.push(
      `## ${missing.length} required setting${missing.length === 1 ? '' : 's'} still unset`,
      '',
      'Anything depending on these cannot be computed. Name the missing setting to',
      'the operator and point them at the agent settings page rather than',
      'producing a figure:',
      '',
      ...missing.map((v) => `- ${v.label} (${GROUP_LABELS[v.group] || v.group})`),
      '',
    );
  }

  return lines.join('\n');
}

/** Convenience: load and render in one step. */
export async function buildComplianceContext(env: Env, asOf?: Date): Promise<string> {
  return renderComplianceContext(await loadConfig(env, asOf));
}
