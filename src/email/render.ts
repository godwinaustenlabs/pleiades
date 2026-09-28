/**
 * Template rendering. Pure functions over plain values — no `env`, no database,
 * the same shape as `src/utils/depreciation.ts` and for the same reason: the
 * route and the test should be able to reach the logic without standing anything
 * up around it.
 *
 * The syntax is `{{name}}` and nothing else. No conditionals, no loops, no
 * filters. A template language is a program, and these are edited by staff in a
 * textarea, where the failure mode of a program is a broken message going to a
 * client. Anything a template cannot express belongs in the code that chooses
 * which template to use.
 */

export type TemplateVar = {
  name: string;
  label: string;
  required?: boolean;
};

export type Template = {
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  variables: TemplateVar[];
};

export type Rendered = { subject: string; text: string; html?: string };

export type RenderResult =
  | { ok: true; rendered: Rendered; used: Record<string, string> }
  /**
   * A refusal names every gap at once, not the first one. Fixing them one
   * round-trip at a time is the thing `compliance_config`'s `missingKeys` array
   * exists to avoid.
   */
  | { ok: false; missing: string[]; message: string };

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** `variables` is stored as JSON text. A malformed column yields no variables rather than throwing. */
export function parseVariables(json: string | null | undefined): TemplateVar[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is TemplateVar => !!v && typeof v.name === 'string');
  } catch {
    return [];
  }
}

/** Every distinct `{{name}}` appearing in the given strings, in first-seen order. */
export function placeholdersIn(...parts: (string | null | undefined)[]): string[] {
  const seen: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const m of part.matchAll(PLACEHOLDER)) {
      if (!seen.includes(m[1])) seen.push(m[1]);
    }
  }
  return seen;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Checks a template is coherent, for the moment it is SAVED.
 *
 * Doing this at save time rather than send time is the whole point: a
 * `{{recipientName}}` misspelled as `{{recipeintName}}` is caught by the person
 * who typed it, instead of arriving in a client's inbox as "Hi ," months later
 * when nobody remembers editing it.
 */
export function validateTemplate(t: Template): string[] {
  const errors: string[] = [];
  const declared = new Set(t.variables.map((v) => v.name));

  if (!t.subject?.trim()) errors.push('Subject is required.');
  if (!t.bodyText?.trim()) {
    errors.push('A plain-text body is required — a message without one scores badly with spam filters and is what the reader shows.');
  }

  for (const v of t.variables) {
    if (!/^[A-Za-z0-9_]+$/.test(v.name)) {
      errors.push(`Variable "${v.name}" may only contain letters, digits and underscores.`);
    }
    if (!v.label?.trim()) errors.push(`Variable "${v.name}" needs a label, since that is what the sender sees.`);
  }

  for (const used of placeholdersIn(t.subject, t.bodyText, t.bodyHtml)) {
    if (!declared.has(used)) {
      errors.push(`{{${used}}} is used but not declared, so nothing would ever fill it in. Declare it or remove it.`);
    }
  }

  // Not an error — a variable can legitimately be declared for one of the two
  // bodies — but an unused *required* one can never be satisfied by a sender who
  // cannot see where it goes, and would refuse every send.
  const usedAnywhere = new Set(placeholdersIn(t.subject, t.bodyText, t.bodyHtml));
  for (const v of t.variables) {
    if (v.required && !usedAnywhere.has(v.name)) {
      errors.push(`{{${v.name}}} is marked required but appears nowhere, so every send would be refused for a value that has no effect.`);
    }
  }

  return errors;
}

/**
 * Renders a template.
 *
 * Substitution is a single pass with a callback, never a loop of replacements,
 * so a value that itself contains `{{x}}` — a quoted email, a code snippet, a
 * prospect's own template — is inserted literally instead of being expanded
 * against the next variable.
 *
 * A missing **required** value refuses, following the rule that a named gap
 * beats a guess. A missing optional renders empty.
 */
export function render(t: Template, values: Record<string, string | number | null | undefined>): RenderResult {
  const declared = new Map(t.variables.map((v) => [v.name, v]));
  const resolved: Record<string, string> = {};
  const missing: string[] = [];

  for (const v of t.variables) {
    const raw = values[v.name];
    const value = raw === null || raw === undefined ? '' : String(raw);
    if (v.required && value.trim() === '') {
      missing.push(v.name);
      continue;
    }
    resolved[v.name] = value;
  }

  if (missing.length) {
    const labels = missing.map((n) => declared.get(n)?.label ?? n);
    return {
      ok: false,
      missing,
      message:
        `Cannot render this email: ${labels.join(', ')} ` +
        `${missing.length === 1 ? 'has' : 'have'} no value. Supply ${missing.length === 1 ? 'it' : 'them'} or make the field optional.`,
    };
  }

  const substitute = (source: string, escape: boolean) =>
    source.replace(PLACEHOLDER, (_whole, name: string) => {
      const value = resolved[name] ?? '';
      return escape ? escapeHtml(value) : value;
    });

  return {
    ok: true,
    used: resolved,
    rendered: {
      // The subject is a header, not markup: escaping it would put &amp; in
      // people's inbox lists.
      subject: substitute(t.subject, false),
      text: substitute(t.bodyText, false),
      ...(t.bodyHtml ? { html: substitute(t.bodyHtml, true) } : {}),
    },
  };
}
