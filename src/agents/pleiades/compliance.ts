import { ConfigVar, loadConfig } from './config';
import { Env } from '../../index';

/**
 * Turning operator configuration into payroll components.
 *
 * This is the only place a compliance figure becomes a number in someone's
 * salary. `/api/hr/payroll/generate` computes gross and net from a salary
 * structure's components (Earning/Deduction, Fixed/Percentage) plus active
 * loans — so whatever we put in those components *is* the tax treatment. Get it
 * from configuration or refuse; there is no third option, and certainly no
 * remembering a rate.
 *
 * Every function here returns either a result or a stated reason it cannot
 * compute. None of them fall back to a default.
 */

export type Money = number;

export interface Refusal {
  ok: false;
  /** What the operator has to do, named precisely enough to act on. */
  reason: string;
  missingKeys: string[];
}

export interface ComponentResult {
  ok: true;
  components: SalaryComponent[];
  /** How each number was reached, for the document provenance footer. */
  basis: string[];
}

export interface SalaryComponent {
  componentName: string;
  componentType: 'Earning' | 'Deduction';
  amountType: 'Fixed' | 'Percentage';
  value: number;
}

/** A progressive slab as the operator enters it in settings. */
interface Slab {
  /** Annual income at which this bracket starts. */
  from: number;
  /** Annual income at which it ends; omit or null for the top bracket. */
  to?: number | null;
  /** Marginal rate applied to income within the bracket. */
  rate_pct: number;
  /** Fixed amount carried from all lower brackets, if the table states one. */
  base_tax?: number;
}

const val = (vars: ConfigVar[], key: string): string | null =>
  vars.find((v) => v.key === key)?.value ?? null;

const num = (vars: ConfigVar[], key: string): number | null => {
  const raw = val(vars, key);
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const labelOf = (vars: ConfigVar[], key: string): string =>
  vars.find((v) => v.key === key)?.label ?? key;

function refuse(vars: ConfigVar[], keys: string[], what: string): Refusal {
  return {
    ok: false,
    reason:
      `Cannot compute ${what}: ${keys.map((k) => labelOf(vars, k)).join(', ')} ` +
      `${keys.length === 1 ? 'is' : 'are'} not configured. Set ${keys.length === 1 ? 'it' : 'them'} ` +
      `in the agent settings before this can be produced.`,
    missingKeys: keys,
  };
}

/**
 * Annual salary withholding under the configured slab table (s149).
 *
 * The slab table is entered whole by the operator. It is never interpolated:
 * if the brackets do not cover the income, that is a gap in the configuration
 * and the honest answer is to say so, not to extend the top rate downwards.
 */
export function calcSalaryWithholding(
  vars: ConfigVar[],
  annualGross: Money,
): { ok: true; annualTax: Money; monthlyTax: Money; basis: string[] } | Refusal {
  const raw = val(vars, 'salary_withholding_slabs');
  if (!raw) return refuse(vars, ['salary_withholding_slabs'], 'salary withholding');

  let slabs: Slab[];
  try {
    slabs = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: 'The salary tax slab setting is not valid JSON. Re-enter it in the agent settings.',
      missingKeys: ['salary_withholding_slabs'],
    };
  }
  if (!Array.isArray(slabs) || slabs.length === 0) {
    return refuse(vars, ['salary_withholding_slabs'], 'salary withholding');
  }

  const ordered = [...slabs].sort((a, b) => a.from - b.from);
  const top = ordered[ordered.length - 1];
  const covered = top.to === null || top.to === undefined || annualGross <= top.to;
  if (!covered) {
    return {
      ok: false,
      reason:
        `The configured slab table stops at ${top.to}, below this salary (${annualGross}). ` +
        `Add the bracket that covers it — the rate will not be extrapolated.`,
      missingKeys: ['salary_withholding_slabs'],
    };
  }

  const bracket = ordered.find(
    (s) => annualGross >= s.from && (s.to === null || s.to === undefined || annualGross <= s.to),
  );
  if (!bracket) {
    return {
      ok: false,
      reason:
        `No configured slab covers an annual salary of ${annualGross}. The bracket table has a gap; ` +
        `correct it in the agent settings.`,
      missingKeys: ['salary_withholding_slabs'],
    };
  }

  const overBracket = annualGross - bracket.from;
  const marginal = (overBracket * bracket.rate_pct) / 100;
  const annualTax = Math.round(((bracket.base_tax ?? 0) + marginal) * 100) / 100;

  return {
    ok: true,
    annualTax,
    monthlyTax: Math.round((annualTax / 12) * 100) / 100,
    basis: [
      `Salary withholding: annual gross ${annualGross} falls in the configured bracket ` +
        `${bracket.from}–${bracket.to ?? 'above'} at ${bracket.rate_pct}%` +
        (bracket.base_tax ? ` plus fixed ${bracket.base_tax}` : '') +
        `, giving ${annualTax}/year (${Math.round((annualTax / 12) * 100) / 100}/month).`,
    ],
  };
}

/**
 * EOBI contribution.
 *
 * Assessed on the government-notified minimum wage, not on actual salary —
 * a distinction worth keeping in code, because computing it on real salary
 * would silently overstate the deduction for every employee.
 */
export function calcEobi(
  vars: ConfigVar[],
  employeeCount: number,
): { ok: true; employer: Money; employee: Money; applies: boolean; basis: string[] } | Refusal {
  const minEmployees = num(vars, 'eobi_min_employees');
  const employerPct = num(vars, 'eobi_employer_pct');
  const employeePct = num(vars, 'eobi_employee_pct');
  const wageBase = num(vars, 'eobi_notified_min_wage');

  const missing = [
    minEmployees === null ? 'eobi_min_employees' : null,
    employerPct === null ? 'eobi_employer_pct' : null,
    employeePct === null ? 'eobi_employee_pct' : null,
    wageBase === null ? 'eobi_notified_min_wage' : null,
  ].filter(Boolean) as string[];
  if (missing.length) return refuse(vars, missing, 'EOBI contributions');

  const applies = employeeCount >= minEmployees!;
  const employer = Math.round(((wageBase! * employerPct!) / 100) * 100) / 100;
  const employee = Math.round(((wageBase! * employeePct!) / 100) * 100) / 100;

  return {
    ok: true,
    applies,
    employer: applies ? employer : 0,
    employee: applies ? employee : 0,
    basis: [
      applies
        ? `EOBI: ${employerPct}% employer / ${employeePct}% employee of the notified minimum wage ` +
          `${wageBase} (not actual salary), at ${employeeCount} employees.`
        : `EOBI does not apply: ${employeeCount} employees is below the configured threshold of ${minEmployees}.`,
    ],
  };
}

/**
 * PESSI/SESSI. Always refuses unless the operator has configured a rate.
 *
 * The provincial schemes were the one figure the source material explicitly
 * declined to confirm, so this deliberately has no fallback at all.
 */
export function calcPessiSessi(
  vars: ConfigVar[],
  monthlyWages: Money,
): { ok: true; amount: Money; authority: string; basis: string[] } | Refusal {
  const rate = num(vars, 'pessi_sessi_rate_pct');
  const authority = val(vars, 'pessi_sessi_authority');
  const ceiling = num(vars, 'pessi_sessi_wage_ceiling');

  const missing = [
    authority === null ? 'pessi_sessi_authority' : null,
    rate === null ? 'pessi_sessi_rate_pct' : null,
  ].filter(Boolean) as string[];
  if (missing.length) return refuse(vars, missing, 'PESSI/SESSI contributions');

  const assessable = ceiling !== null ? Math.min(monthlyWages, ceiling) : monthlyWages;
  const amount = Math.round(((assessable * rate!) / 100) * 100) / 100;

  return {
    ok: true,
    amount,
    authority: authority!,
    basis: [
      `${authority}: ${rate}% of ${ceiling !== null ? `wages capped at ${ceiling}` : 'wages'} ` +
        `(${assessable}) = ${amount}. Verify against the current provincial notification before filing.`,
    ],
  };
}

/**
 * Builds the statutory deduction components for one employee's salary
 * structure, from configuration alone.
 *
 * The returned components are in exactly the shape
 * `POST /api/hr/salary-structures/:employeeId/setup` expects, and the
 * withholding component is named so that `/payroll/generate` recognises it as
 * tax (it looks for 'tax' in the component name when populating the payroll
 * record's withholding field).
 */
export async function buildStatutoryComponents(
  env: Env,
  args: { annualGross: Money; employeeCount: number; includeEobi?: boolean; includePessi?: boolean },
): Promise<ComponentResult | Refusal> {
  const vars = await loadConfig(env);
  const components: SalaryComponent[] = [];
  const basis: string[] = [];

  const wht = calcSalaryWithholding(vars, args.annualGross);
  if (!wht.ok) return wht;
  if (wht.monthlyTax > 0) {
    components.push({
      // Named for /payroll/generate's tax detection — see the route.
      componentName: 'Income Tax Withholding',
      componentType: 'Deduction',
      amountType: 'Fixed',
      value: wht.monthlyTax,
    });
  }
  basis.push(...wht.basis);

  if (args.includeEobi !== false) {
    const eobi = calcEobi(vars, args.employeeCount);
    if (!eobi.ok) return eobi;
    if (eobi.applies && eobi.employee > 0) {
      components.push({
        componentName: 'EOBI Employee Contribution',
        componentType: 'Deduction',
        amountType: 'Fixed',
        value: eobi.employee,
      });
    }
    basis.push(...eobi.basis);
  }

  if (args.includePessi) {
    const pessi = calcPessiSessi(vars, args.annualGross / 12);
    if (!pessi.ok) return pessi;
    components.push({
      componentName: `${pessi.authority} Employee Contribution`,
      componentType: 'Deduction',
      amountType: 'Fixed',
      value: pessi.amount,
    });
    basis.push(...pessi.basis);
  }

  return { ok: true, components, basis };
}
