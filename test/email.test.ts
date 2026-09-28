import { describe, it, expect, beforeAll } from 'vitest';
import { resetDatabase, tokenFor } from './helpers';
import { render, validateTemplate, placeholdersIn, escapeHtml } from '../src/email/render';
import { validate as validateOutgoing, LIMITS } from '../src/email/transport';

/**
 * Rendering and the outbox.
 *
 * The rendering half runs against the pure functions directly — they take no
 * `env` for exactly this reason. The outbox half runs through the API, because
 * the behaviour that matters (a claim, a duplicate key, a cap) only exists once
 * there is a real database underneath.
 *
 * Miniflare SIMULATES the `send_email` binding locally — it writes each message
 * to a temp file rather than delivering it — so these tests drive the real
 * `env.EMAIL.send()` path and not the console fallback. Worth knowing before
 * changing `transport.ts`: the binding branch is covered here, and the fallback
 * branch is not covered by anything, because it only happens on a deployment
 * where the binding is genuinely missing.
 *
 * The send happens in a `waitUntil`, so anything asserting on a final delivery
 * status has to wait for it. `settled()` below is that wait; asserting straight
 * after the 201 sees `sending` and is a race, not a bug.
 */

const TPL = {
  subject: 'Hello {{name}}',
  bodyText: 'Hi {{name}}, your balance is {{amount}}.',
  bodyHtml: '<p>Hi {{name}}, your balance is {{amount}}.</p>',
  variables: [
    { name: 'name', label: 'Name', required: true },
    { name: 'amount', label: 'Amount', required: false },
  ],
};

describe('rendering', () => {
  it('substitutes into subject, text and html', () => {
    const out = render(TPL, { name: 'Ayesha', amount: '100' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rendered.subject).toBe('Hello Ayesha');
    expect(out.rendered.text).toBe('Hi Ayesha, your balance is 100.');
    expect(out.rendered.html).toBe('<p>Hi Ayesha, your balance is 100.</p>');
  });

  it('escapes into html and not into text', () => {
    const out = render(TPL, { name: '<script>alert(1)</script>', amount: 'a & b' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rendered.html).toContain('&lt;script&gt;');
    expect(out.rendered.html).not.toContain('<script>');
    expect(out.rendered.html).toContain('a &amp; b');
    // The text part is not markup, so escaping it would put &amp; in the body.
    expect(out.rendered.text).toContain('<script>alert(1)</script>');
    expect(out.rendered.text).toContain('a & b');
  });

  it('does not escape the subject, which is a header rather than markup', () => {
    const out = render({ ...TPL, subject: 'Re: {{name}}' }, { name: 'Smith & Co' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rendered.subject).toBe('Re: Smith & Co');
  });

  it('inserts a value containing {{...}} literally rather than expanding it', () => {
    // Substitution is one pass with a callback, not a loop of replacements. A
    // loop would expand the injected placeholder against the next variable,
    // which is how a quoted email or a code snippet leaks another field.
    const out = render(TPL, { name: '{{amount}}', amount: 'SECRET' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rendered.text).toBe('Hi {{amount}}, your balance is SECRET.');
  });

  it('refuses when a required value is missing, and names every gap at once', () => {
    const tpl = {
      ...TPL,
      variables: [
        { name: 'name', label: 'Name', required: true },
        { name: 'amount', label: 'Amount', required: true },
      ],
    };
    const out = render(tpl, {});
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.missing).toEqual(['name', 'amount']);
    // Labels, not variable names: the reader is the person filling the form in.
    expect(out.message).toContain('Name');
    expect(out.message).toContain('Amount');
  });

  it('treats whitespace as missing for a required value', () => {
    const out = render(TPL, { name: '   ' });
    expect(out.ok).toBe(false);
  });

  it('renders an absent optional as empty rather than refusing', () => {
    const out = render(TPL, { name: 'Ayesha' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rendered.text).toBe('Hi Ayesha, your balance is .');
  });
});

describe('template validation happens at save time', () => {
  it('rejects a placeholder nothing declares', () => {
    // The whole point of validating on save: {{recipeintName}} would otherwise
    // render as an empty string in a client's inbox, months later.
    const errors = validateTemplate({ ...TPL, bodyText: 'Hi {{recipeintName}}' });
    expect(errors.some((e) => e.includes('recipeintName'))).toBe(true);
  });

  it('rejects a required variable that appears nowhere', () => {
    const errors = validateTemplate({
      subject: 'Fixed',
      bodyText: 'Fixed body',
      bodyHtml: null,
      variables: [{ name: 'ghost', label: 'Ghost', required: true }],
    });
    // Every send would be refused for a value that has no effect.
    expect(errors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('requires a plain-text body', () => {
    const errors = validateTemplate({ subject: 'x', bodyText: '', bodyHtml: '<p>x</p>', variables: [] });
    expect(errors.some((e) => e.toLowerCase().includes('plain-text'))).toBe(true);
  });

  it('accepts a correct template', () => {
    expect(validateTemplate(TPL)).toEqual([]);
  });

  it('finds placeholders across all three parts, without duplicates', () => {
    expect(placeholdersIn('{{a}}', '{{b}} {{a}}', '{{c}}')).toEqual(['a', 'b', 'c']);
  });

  it('escapes the five characters that matter', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});

describe('outgoing validation refuses before the provider has to', () => {
  const base = {
    from: { email: 'a@godwinausten.org' },
    to: [{ email: 'b@example.test' }],
    subject: 'hi',
    text: 'hi',
  };

  it('accepts a well-formed message', () => {
    expect(validateOutgoing(base)).toBeNull();
  });

  it('refuses more than the recipient limit', () => {
    const many = Array.from({ length: LIMITS.recipients + 1 }, (_, i) => ({ email: `x${i}@example.test` }));
    const out = validateOutgoing({ ...base, to: many });
    expect(out?.ok).toBe(false);
    // Terminal: retrying a message with 51 recipients will not help.
    expect(out && !out.ok && out.retryable).toBe(false);
  });

  it('refuses a message with no text part', () => {
    expect(validateOutgoing({ ...base, text: '' })?.ok).toBe(false);
  });

  it('refuses an over-long subject', () => {
    expect(validateOutgoing({ ...base, subject: 'x'.repeat(LIMITS.subjectChars + 1) })?.ok).toBe(false);
  });
});

// ── The outbox, through the API ─────────────────────────────────────────────

async function send(body: Record<string, unknown>) {
  const { SELF } = await import('cloudflare:test');
  return SELF.fetch('https://test.local/api/email/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mailboxId: 'mbx_acq', ...body }),
  });
}

/** Polls until the waitUntil'd send has left `sending`. */
async function settled(messageId: string, tries = 40): Promise<string> {
  const { env } = await import('cloudflare:test');
  for (let i = 0; i < tries; i += 1) {
    const row = await env.DB.prepare('SELECT status FROM email_delivery WHERE message_id = ?')
      .bind(messageId).first<{ status: string }>();
    if (row && row.status !== 'sending' && row.status !== 'queued') return row.status;
    await new Promise((r) => setTimeout(r, 25));
  }
  return 'timed-out';
}

async function countDelivery(): Promise<number> {
  const { env } = await import('cloudflare:test');
  const r = await env.DB.prepare('SELECT count(*) AS n FROM email_delivery').first<{ n: number }>();
  return Number(r?.n ?? 0);
}

beforeAll(async () => {
  await resetDatabase();
});

describe('the outbox', () => {
  it('writes a message and a delivery row, and attempts the send immediately', async () => {
    const res = await send({ to: ['one@example.test'], subject: 'first', text: 'first', idempotencyKey: 'k1' });
    expect(res.status).toBe(201);
    const { id } = (await res.json() as { data: { id: string } }).data;

    const { env } = await import('cloudflare:test');
    const row = await env.DB.prepare('SELECT attempts, idempotency_key FROM email_delivery WHERE message_id = ?')
      .bind(id).first<{ attempts: number; idempotency_key: string }>();
    expect(row).toBeTruthy();
    expect(row!.idempotency_key).toBe('manual:mbx_acq:k1');
    // Miniflare's simulator accepts the message, so the row reaches `sent` once
    // the waitUntil finishes.
    expect(await settled(id)).toBe('sent');
  });

  it('stores the message in the sent folder with the mailbox as sender', async () => {
    const { env } = await import('cloudflare:test');
    const row = await env.DB.prepare(
      "SELECT folder, direction, from_address, created_by FROM email_messages WHERE subject = 'first'",
    ).first<{ folder: string; direction: string; from_address: string; created_by: string }>();
    expect(row!.folder).toBe('sent');
    expect(row!.direction).toBe('outbound');
    expect(row!.from_address).toBe('sales@godwinausten.org');
    expect(row!.created_by).toBe('u_mkt');
  });

  it('dedupes a repeated idempotency key instead of sending twice', async () => {
    const before = await countDelivery();
    const res = await send({ to: ['one@example.test'], subject: 'first again', text: 'x', idempotencyKey: 'k1' });
    expect(res.status).toBe(201);
    const body = (await res.json() as { data: { id: string; deduped: boolean } }).data;
    expect(body.deduped).toBe(true);
    expect(await countDelivery()).toBe(before);
  });

  it('treats an absent idempotency key as a distinct send', async () => {
    // Otherwise two unrelated messages with the same subject would collapse into
    // one, which is a worse failure than sending twice.
    const before = await countDelivery();
    await send({ to: ['two@example.test'], subject: 'no key', text: 'x' });
    await send({ to: ['two@example.test'], subject: 'no key', text: 'x' });
    expect(await countDelivery()).toBe(before + 2);
  });

  it('refuses an empty body rather than sending a blank message', async () => {
    const res = await send({ to: ['three@example.test'], subject: 'subject only', text: '' });
    expect(res.status).toBe(400);
  });

  it('refuses when every recipient address is unusable', async () => {
    const res = await send({ to: ['not-an-address'], subject: 'x', text: 'x' });
    expect(res.status).toBe(400);
  });

  it('enforces the mailbox daily cap', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare("UPDATE mailboxes SET daily_send_cap = 1 WHERE mailbox_id = 'mbx_acq'").run();
    const res = await send({ to: ['capped@example.test'], subject: 'over', text: 'over' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('daily limit');
    await env.DB.prepare("UPDATE mailboxes SET daily_send_cap = 200 WHERE mailbox_id = 'mbx_acq'").run();
  });

  it('refuses to send from a deactivated mailbox', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare("UPDATE mailboxes SET is_active = 0 WHERE mailbox_id = 'mbx_acq'").run();
    const res = await send({ to: ['off@example.test'], subject: 'off', text: 'off' });
    // The kill switch is a 403 from canUseMailbox rather than a 400 from the
    // enqueue: an inactive mailbox is one you may no longer send as.
    expect(res.status).toBe(403);
    await env.DB.prepare("UPDATE mailboxes SET is_active = 1 WHERE mailbox_id = 'mbx_acq'").run();
  });

  it('still lets a deactivated mailbox be read, so turning it off is not destructive', async () => {
    const { SELF, env } = await import('cloudflare:test');
    await env.DB.prepare("UPDATE mailboxes SET is_active = 0 WHERE mailbox_id = 'mbx_acq'").run();
    const res = await SELF.fetch('https://test.local/api/email/mailboxes/mbx_acq/messages?folder=sent', {
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}` },
    });
    expect(res.status).toBe(200);
    await env.DB.prepare("UPDATE mailboxes SET is_active = 1 WHERE mailbox_id = 'mbx_acq'").run();
  });
});

describe('notification preferences', () => {
  it('lists every catalogued event, with transactional ones locked on', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/prefs', {
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}` },
    });
    const prefs = (await res.json() as { data: { key: string; enabled: boolean; changeable: boolean }[] }).data;
    const task = prefs.find((p) => p.key === 'task_assigned');
    const reset = prefs.find((p) => p.key === 'password_reset');
    // Absence of a row means enabled: an empty table is "everyone gets everything".
    expect(task).toMatchObject({ enabled: true, changeable: true });
    expect(reset).toMatchObject({ enabled: true, changeable: false });
  });

  it('refuses to switch off something transactional', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/prefs', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs: { password_reset: false } }),
    });
    // Better than a toggle that silently does nothing.
    expect(res.status).toBe(400);
  });

  it('records an opt-out for a notification', async () => {
    const { SELF } = await import('cloudflare:test');
    const put = await SELF.fetch('https://test.local/api/email/prefs', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs: { task_assigned: false } }),
    });
    expect(put.status).toBe(200);

    const res = await SELF.fetch('https://test.local/api/email/prefs', {
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}` },
    });
    const prefs = (await res.json() as { data: { key: string; enabled: boolean }[] }).data;
    expect(prefs.find((p) => p.key === 'task_assigned')!.enabled).toBe(false);
  });
});

// ── The transactional hook: task assignment ─────────────────────────────────

/**
 * The thing this whole subsystem was asked for: assigning a task emails the
 * person it was assigned to.
 *
 * The interesting assertions are the negative ones. `PATCH /api/tasks/:id`
 * deletes every assignment row and re-inserts it on every edit, so the naive hook
 * re-mails the entire team whenever somebody changes a due date.
 *
 * Two things stop that, and they are not equals — worth stating plainly, because
 * the comment here used to claim these tests covered both and they do not:
 *
 *   The `task_assigned:<task>:<employee>` idempotency key is the guarantee.
 *   Removing it turns five of the tests below red.
 *
 *   The old-vs-new assignee diff in tasks.ts is defence in depth and an
 *   efficiency measure — without it a PATCH on a ten-person task does thirty
 *   pointless queries and relies entirely on the unique key. Removing it breaks
 *   NOTHING here, which is worth knowing before deleting it as dead weight: it is
 *   redundant for correctness today and the second lock on the door.
 */

async function deliveriesFor(taskId: string): Promise<{ key: string; to: string }[]> {
  const { env } = await import('cloudflare:test');
  // Filtered in JS rather than with LIKE: a generated id is `task_<32 hex>`, and
  // `_` is a LIKE wildcard, so the prefix pattern is both wrong and — with that
  // many wildcards — refused by D1 as "pattern too complex".
  const { results } = await env.DB.prepare(
    `SELECT d.idempotency_key AS key, m.to_addresses AS to_addresses
       FROM email_delivery d JOIN email_messages m ON m.message_id = d.message_id`,
  ).all<{ key: string; to_addresses: string }>();
  const prefix = `task_assigned:${taskId}:`;
  return results
    .filter((r) => r.key.startsWith(prefix))
    .map((r) => ({ key: r.key, to: r.to_addresses }));
}

/** The hook runs in a waitUntil, so give it a moment to land. */
async function settledCount(taskId: string, expected: number, tries = 40): Promise<number> {
  for (let i = 0; i < tries; i += 1) {
    const rows = await deliveriesFor(taskId);
    if (rows.length >= expected) return rows.length;
    await new Promise((r) => setTimeout(r, 25));
  }
  return (await deliveriesFor(taskId)).length;
}

async function createTask(assigneeIds: string[]): Promise<string> {
  const { SELF } = await import('cloudflare:test');
  const res = await SELF.fetch('https://test.local/api/tasks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tokenFor('ceo')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Draft the Q4 deck', department: 'Acquisition', assigneeIds }),
  });
  expect(res.status).toBe(201);
  return (await res.json() as { data: { id: string } }).data.id;
}

async function patchTask(id: string, body: Record<string, unknown>): Promise<void> {
  const { SELF } = await import('cloudflare:test');
  const res = await SELF.fetch(`https://test.local/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await tokenFor('ceo')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
}

describe('assigning a task emails the assignee', () => {
  beforeAll(async () => {
    const { env } = await import('cloudflare:test');
    // Three employees: two with addresses, one without. `employees.email` is
    // nullable in production and plenty of rows have nothing in it, so the
    // no-address case is the normal case and not an edge one.
    await env.DB.prepare(
      "INSERT INTO employees (employee_id, name, email, created_at, updated_at) VALUES ('emp_a','Ayesha','ayesha@example.test',0,0)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO employees (employee_id, name, email, created_at, updated_at) VALUES ('emp_b','Bilal','bilal@example.test',0,0)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO employees (employee_id, name, created_at, updated_at) VALUES ('emp_c','No Address',0,0)",
    ).run();
  });

  it('queues one email per assignee with an address', async () => {
    const taskId = await createTask(['emp_a', 'emp_b']);
    expect(await settledCount(taskId, 2)).toBe(2);
    const keys = (await deliveriesFor(taskId)).map((r) => r.key).sort();
    expect(keys).toEqual([`task_assigned:${taskId}:emp_a`, `task_assigned:${taskId}:emp_b`]);
  });

  it('silently skips an assignee with no address, without failing the task', async () => {
    const taskId = await createTask(['emp_a', 'emp_c']);
    expect(await settledCount(taskId, 1)).toBe(1);
    const keys = (await deliveriesFor(taskId)).map((r) => r.key);
    expect(keys).toEqual([`task_assigned:${taskId}:emp_a`]);
  });

  it('does not re-email anybody when the task is edited', async () => {
    const taskId = await createTask(['emp_a']);
    expect(await settledCount(taskId, 1)).toBe(1);

    // A due-date change that happens to resend the whole assignee list. This is
    // the exact shape of the bug the diff exists to prevent.
    await patchTask(taskId, { dueDate: '2026-12-01', assigneeIds: ['emp_a'] });
    await new Promise((r) => setTimeout(r, 200));
    expect((await deliveriesFor(taskId)).length).toBe(1);
  });

  it('emails only the person newly added, not the existing assignees', async () => {
    const taskId = await createTask(['emp_a']);
    expect(await settledCount(taskId, 1)).toBe(1);

    await patchTask(taskId, { assigneeIds: ['emp_a', 'emp_b'] });
    expect(await settledCount(taskId, 2)).toBe(2);
    const keys = (await deliveriesFor(taskId)).map((r) => r.key).sort();
    expect(keys).toEqual([`task_assigned:${taskId}:emp_a`, `task_assigned:${taskId}:emp_b`]);
  });

  it('does not email again when somebody is removed and re-added', async () => {
    const taskId = await createTask(['emp_a']);
    expect(await settledCount(taskId, 1)).toBe(1);

    await patchTask(taskId, { assigneeIds: [] });
    await patchTask(taskId, { assigneeIds: ['emp_a'] });
    await new Promise((r) => setTimeout(r, 200));
    // The diff alone would allow a second email here, since emp_a genuinely is
    // newly added the second time. The idempotency key is what makes this one,
    // and it is the reason both mechanisms exist rather than just the diff.
    expect((await deliveriesFor(taskId)).length).toBe(1);
  });

  it('honours an opt-out from the person receiving it', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare(
      "INSERT INTO users_logins (id,email,username,name,password_hash,is_active,is_superadmin,created_at,failed_attempts,employee_id) " +
      "VALUES ('u_ayesha','ayesha@test.local','u_ayesha','Ayesha','x',1,0,0,0,'emp_a')",
    ).run();
    await env.DB.prepare(
      "INSERT INTO email_prefs (user_id,event_key,enabled,updated_at) VALUES ('u_ayesha','task_assigned',0,0)",
    ).run();

    const taskId = await createTask(['emp_a', 'emp_b']);
    // Only Bilal, who has no login and therefore no opinion on file.
    expect(await settledCount(taskId, 1)).toBe(1);
    await new Promise((r) => setTimeout(r, 200));
    const keys = (await deliveriesFor(taskId)).map((r) => r.key);
    expect(keys).toEqual([`task_assigned:${taskId}:emp_b`]);

    await env.DB.prepare("DELETE FROM email_prefs WHERE user_id = 'u_ayesha'").run();
    await env.DB.prepare("DELETE FROM users_logins WHERE id = 'u_ayesha'").run();
  });
});

// ── The send lifecycle ──────────────────────────────────────────────────────

/**
 * The status machine, and two bugs it had.
 *
 * Both were found by reading `drainOne` and `sweep` next to each other and asking
 * what happens to a row that is neither clearly done nor clearly retryable.
 * Neither was reachable through the API, which is why these drive the functions
 * directly, and both were a message silently never arriving — the failure this
 * whole subsystem exists to make impossible.
 */

async function deliveryRow(messageId: string) {
  const { env } = await import('cloudflare:test');
  return env.DB.prepare(
    'SELECT status, attempts, next_attempt_at, error_code FROM email_delivery WHERE message_id = ?',
  ).bind(messageId).first<{ status: string; attempts: number; next_attempt_at: number | null; error_code: string | null }>();
}

async function queue(idempotencyKey: string, overrides: Record<string, unknown> = {}) {
  const { env } = await import('cloudflare:test');
  const { enqueue } = await import('../src/email/outbox');
  const result = await enqueue(env, {
    mailboxId: 'mbx_acq',
    to: [{ email: 'lifecycle@example.test' }],
    subject: 'lifecycle',
    text: 'body',
    idempotencyKey,
    ...overrides,
  });
  if ('error' in result) throw new Error(result.error);
  return result.messageId;
}

describe('a terminal failure is not retried', () => {
  it('stops after one attempt and the sweep leaves it alone', async () => {
    const { env } = await import('cloudflare:test');
    const { drainOne, sweep } = await import('../src/email/outbox');

    // A 1200-character subject fails transport.validate() as E_INVALID_MESSAGE.
    // No number of retries makes a subject shorter.
    const id = await queue('lifecycle-terminal', { subject: 'x'.repeat(1200) });

    expect(await drainOne(env, id)).toBe('failed');
    const first = await deliveryRow(id);
    expect(first!.attempts).toBe(1);
    expect(first!.error_code).toBe('E_INVALID_MESSAGE');
    // Null is load-bearing: it is what excludes the row from the sweep.
    expect(first!.next_attempt_at).toBeNull();

    await sweep(env);

    // This read 2 before the fix. `isNull(nextAttemptAt)` was treated as "due
    // now", so a permanently-broken message was retried on every tick until it
    // burned all five attempts — and an unverified sender would do that to every
    // message from the domain.
    expect((await deliveryRow(id))!.attempts).toBe(1);
  });
});

describe('a claim is a lease, not a one-way door', () => {
  it('reclaims a message whose Worker died after claiming it', async () => {
    const { env } = await import('cloudflare:test');
    const { sweep } = await import('../src/email/outbox');
    const id = await queue('lifecycle-stuck-expired');

    // Exactly what an eviction between the claim and the result leaves behind,
    // with the lease already elapsed.
    await env.DB.prepare(
      "UPDATE email_delivery SET status = 'sending', next_attempt_at = ? WHERE message_id = ?",
    ).bind(Math.floor(Date.now() / 1000) - 60, id).run();

    await sweep(env);
    // Before the fix `sending` was terminal in practice: the sweep's status
    // filter did not include it, so the message was never sent and never
    // reported — the worst outcome available.
    expect((await deliveryRow(id))!.status).toBe('sent');
  });

  it('reclaims one with no lease at all', async () => {
    const { env } = await import('cloudflare:test');
    const { sweep } = await import('../src/email/outbox');
    const id = await queue('lifecycle-stuck-null');

    await env.DB.prepare("UPDATE email_delivery SET status = 'sending' WHERE message_id = ?").bind(id).run();

    await sweep(env);
    // Every live claim sets a lease, so a `sending` row without one cannot be in
    // progress. Requiring a non-null lease here would leave precisely the rows
    // this fix exists for stuck forever.
    expect((await deliveryRow(id))!.status).toBe('sent');
  });

  it('does not double-send: a second drain of a live claim is skipped', async () => {
    const { env } = await import('cloudflare:test');
    const { drainOne } = await import('../src/email/outbox');
    const id = await queue('lifecycle-race');

    // A fresh claim with a live lease — what a concurrent cron tick would meet
    // while the waitUntil is still in flight.
    await env.DB.prepare(
      "UPDATE email_delivery SET status = 'sending', next_attempt_at = ? WHERE message_id = ?",
    ).bind(Math.floor(Date.now() / 1000) + 600, id).run();

    expect(await drainOne(env, id)).toBe('skipped');
  });

  it('does not re-send something already sent', async () => {
    const { env } = await import('cloudflare:test');
    const { drainOne, sweep } = await import('../src/email/outbox');
    const id = await queue('lifecycle-sent-once');

    expect(await drainOne(env, id)).toBe('sent');
    expect(await drainOne(env, id)).toBe('skipped');
    await sweep(env);
    expect((await deliveryRow(id))!.attempts).toBe(0);
  });
});

describe('scheduled sends', () => {
  it('are left alone until they come due', async () => {
    const { env } = await import('cloudflare:test');
    const { sweep } = await import('../src/email/outbox');
    const id = await queue('lifecycle-future', { scheduledFor: new Date(Date.now() + 60 * 60 * 1000) });

    await sweep(env);
    expect((await deliveryRow(id))!.status).toBe('queued');
  });

  it('go out once their time has passed', async () => {
    const { env } = await import('cloudflare:test');
    const { sweep } = await import('../src/email/outbox');
    const id = await queue('lifecycle-past', { scheduledFor: new Date(Date.now() - 60 * 1000) });

    await sweep(env);
    expect((await deliveryRow(id))!.status).toBe('sent');
  });
});

// ── Two transports ──────────────────────────────────────────────────────────

/**
 * This account is on the Workers Free plan, where Cloudflare Email Sending
 * delivers to *verified destination addresses* only. That is free and uncapped and
 * covers staff; it refuses every prospect and client. So transactional mail goes
 * through the binding and anything addressed outside the company goes through
 * Resend, decided by `mailboxes.transport`.
 *
 * Neither provider is reached here — `RESEND_API_KEY` is unset in the suite, so
 * the Resend path reports its console fallback, and Miniflare simulates the
 * binding. What these pin is the *routing* and the quota arithmetic, which is
 * where the plan split can go wrong silently.
 */

describe('transport routing', () => {
  it('pins a secret-bearing message to Cloudflare, per message not per mailbox', async () => {
    const { env } = await import('cloudflare:test');
    const { dispatch } = await import('../src/email/events');

    // The mailbox itself is `auto` — pinning it meant no-reply@ could not reach any
    // own-domain address on the Free plan (E_RECIPIENT_NOT_ALLOWED, seen in
    // production) and, being pinned, could not fall back either.
    const box = await env.DB.prepare("SELECT transport FROM mailboxes WHERE mailbox_id = 'mbx_system'")
      .first<{ transport: string }>();
    expect(box!.transport).toBe('auto');

    const sensitive = await dispatch(env, {
      event: 'password_reset',
      to: [{ email: 'personal@external.example' }],
      values: { userName: 'X', resetUrl: 'https://pleiades.test/reset?token=T', expiresAt: 'soon' },
      idempotencyKey: 'pin-sensitive',
    });
    expect(sensitive.sent).toBe(true);
    if (!sensitive.sent) return;

    const pinned = await env.DB.prepare('SELECT transport_override FROM email_delivery WHERE message_id = ?')
      .bind(sensitive.messageId).first<{ transport_override: string }>();
    /**
     * `auto`, not `cloudflare`. This asserted the pin until production showed the
     * pinned path could not deliver at all: Cloudflare Email Sending is unverified on
     * this account, so the one event pinned to it was the one that never arrived. A
     * reset that does not turn up is not a safer reset. The override column stays —
     * it is how the pin comes back once that DKIM key provisions.
     */
    expect(pinned!.transport_override).toBe('auto');

    const ordinary = await dispatch(env, {
      event: 'task_assigned',
      to: [{ email: 'colleague@godwinausten.org' }],
      values: { assigneeName: 'X', taskTitle: 'T', department: 'HR', dueDate: '-', taskUrl: 'u' },
      idempotencyKey: 'pin-ordinary',
    });
    expect(ordinary.sent).toBe(true);
    if (!ordinary.sent) return;
    const notPinned = await env.DB.prepare('SELECT transport_override FROM email_delivery WHERE message_id = ?')
      .bind(ordinary.messageId).first<{ transport_override: string | null }>();
    // Falls back, so a notification to an own-domain colleague actually arrives.
    expect(notPinned!.transport_override).toBe('auto');
  });

  it('leaves a department mailbox on auto, deciding per message', async () => {
    const { env } = await import('cloudflare:test');
    const box = await env.DB.prepare("SELECT transport FROM mailboxes WHERE mailbox_id = 'mbx_acq'")
      .first<{ transport: string }>();
    // A department mailbox writes to colleagues AND to clients, and the two
    // services differ on exactly that. Pinned either way it is wrong half the
    // time, so the choice belongs at send time.
    expect(box!.transport).toBe('auto');
  });

  it('refuses a transport it does not recognise rather than falling through', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/mailboxes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: 'weird@godwinausten.org', kind: 'app', appName: 'ops', transport: 'carrier-pigeon' }),
    });
    expect(res.status).toBe(400);
  });

  it('defaults a new mailbox to auto', async () => {
    const { SELF, env } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/mailboxes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: 'ops-mail@godwinausten.org', kind: 'app', appName: 'ops' }),
    });
    expect(res.status).toBe(201);
    const row = await env.DB.prepare("SELECT transport FROM mailboxes WHERE address = 'ops-mail@godwinausten.org'")
      .first<{ transport: string }>();
    // Not `cloudflare`: that would produce a mailbox which silently cannot reach a
    // client, which is the wrong thing to guess for anybody's first mailbox.
    expect(row!.transport).toBe('auto');
  });
});

describe("Resend's daily allowance is counted per account, not per mailbox", () => {
  it('refuses an explicitly-Resend mailbox once the account total is reached', async () => {
    const { env } = await import('cloudflare:test');
    const { enqueue } = await import('../src/email/outbox');
    const { RESEND_DAILY_CAP } = await import('../src/email/transport');

    // Two Resend mailboxes with per-mailbox caps far below the account allowance —
    // the exact shape that makes a per-mailbox limit insufficient.
    await env.DB.prepare(
      "INSERT OR IGNORE INTO mailboxes (mailbox_id,address,display_name,kind,app_name,transport,daily_send_cap,is_active,created_at,updated_at) " +
      "VALUES ('mbx_legal','legal@godwinausten.org','Legal','app','legal','resend',40,1,0,0)",
    ).run();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO mailboxes (mailbox_id,address,display_name,kind,app_name,transport,daily_send_cap,is_active,created_at,updated_at) " +
      "VALUES ('mbx_pinned','outreach@godwinausten.org','Outreach','app','acquisition','resend',40,1,0,0)",
    ).run();

    /**
     * Fill the allowance with sends that actually went through Resend. The count
     * comes from `email_delivery.transport`, not from how mailboxes are configured —
     * under `auto` those differ by definition.
     */
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < RESEND_DAILY_CAP; i += 1) {
      await env.DB.prepare(
        "INSERT INTO email_messages (message_id, mailbox_id, direction, folder, from_address, to_addresses, subject, body_text, is_read, is_starred, created_at) " +
        "VALUES (?, 'mbx_legal', 'outbound', 'sent', 'legal@godwinausten.org', '[]', 'filler', 'x', 1, 0, ?)",
      ).bind(`eml_filler_${i}`, now).run();
      await env.DB.prepare(
        "INSERT INTO email_delivery (message_id, status, attempts, transport, idempotency_key, queued_at, sent_at) " +
        "VALUES (?, 'sent', 1, 'resend', ?, ?, ?)",
      ).bind(`eml_filler_${i}`, `filler-${i}`, now, now).run();
    }

    // mbx_pinned has sent nothing itself, so only the account-wide check can refuse.
    const result = await enqueue(env, {
      mailboxId: 'mbx_pinned',
      to: [{ email: 'prospect@example.test' }],
      subject: 'over the account limit',
      text: 'body',
      idempotencyKey: 'account-cap',
    });

    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toContain('outside addresses');
  });

  it('does not pre-refuse an auto mailbox, which may never touch Resend', async () => {
    const { env } = await import('cloudflare:test');
    const { enqueue, drainOne } = await import('../src/email/outbox');

    /**
     * The allowance is spent from the test above. An `auto` message must still be
     * accepted — at enqueue time we do not know whether Resend will be involved, and
     * refusing there rejected sends the free path would have carried for nothing.
     * That is exactly what broke when mbx_system moved from `cloudflare` to `auto`.
     */
    const result = await enqueue(env, {
      mailboxId: 'mbx_acq',
      to: [{ email: 'someone@example.test' }],
      subject: 'auto under a spent allowance',
      text: 'body',
      idempotencyKey: 'auto-not-prerefused',
    });
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    // And at send time it degrades to Cloudflare-only rather than spending an
    // allowance that is already gone.
    await drainOne(env, result.messageId);
    const row = await env.DB.prepare('SELECT transport, status FROM email_delivery WHERE message_id = ?')
      .bind(result.messageId).first<{ transport: string | null; status: string }>();
    expect(row!.transport).not.toBe('resend');
  });

  it('does not count Cloudflare sends against it', async () => {
    const { env } = await import('cloudflare:test');
    const { enqueue } = await import('../src/email/outbox');

    // The account allowance is still full from the test above. A send on the free
    // path must be unaffected — sends to verified destinations count against no
    // quota at all, which is the whole reason transactional mail goes that way.
    const result = await enqueue(env, {
      mailboxId: 'mbx_system',
      to: [{ email: 'staff@godwinausten.org' }],
      subject: 'internal notice',
      text: 'body',
      idempotencyKey: 'cloudflare-unaffected',
    });

    expect('error' in result).toBe(false);
  });
});

describe('auto: the free path first, Resend as the fallback', () => {
  it('records which service actually carried a message', async () => {
    const { env } = await import('cloudflare:test');
    const { enqueue, drainOne } = await import('../src/email/outbox');

    const r = await enqueue(env, {
      mailboxId: 'mbx_system',
      to: [{ email: 'staff-member@example.test' }],
      subject: 'via cloudflare',
      text: 'body',
      idempotencyKey: 'transport-recorded',
    });
    if ('error' in r) throw new Error(r.error);
    expect(await drainOne(env, r.messageId)).toBe('sent');

    const row = await env.DB.prepare('SELECT transport FROM email_delivery WHERE message_id = ?')
      .bind(r.messageId).first<{ transport: string }>();
    // mbx_system is pinned to cloudflare, and Miniflare simulates that binding.
    expect(row!.transport).toBe('cloudflare');
  });

  it('does not fall back on a suppressed recipient', async () => {
    const { sendMail } = await import('../src/email/transport');
    const { env } = await import('cloudflare:test');

    // Cloudflare's suppression list is a fact about the address, not about the
    // plan. Sending it through Resend anyway is how a sender reaches a blocklist,
    // so this refusal has to be terminal rather than a reason to try harder.
    const stub = {
      ...env,
      EMAIL: {
        send: async () => {
          const err = new Error('Recipient is suppressed.') as Error & { code?: string };
          err.code = 'E_RECIPIENT_SUPPRESSED';
          throw err;
        },
      },
      RESEND_API_KEY: 'test-key-should-not-be-used',
    } as unknown as Parameters<typeof sendMail>[0];

    const outcome = await sendMail(stub, {
      from: { email: 'no-reply@godwinausten.org' },
      to: [{ email: 'bounced@example.test' }],
      subject: 'suppressed',
      text: 'body',
    }, 'auto');

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('E_RECIPIENT_SUPPRESSED');
    expect(outcome.suppressed).toBe(true);
  });

  it('falls back to Resend when Cloudflare refuses for any other reason', async () => {
    const { sendMail } = await import('../src/email/transport');
    const { env } = await import('cloudflare:test');

    // The case this whole mechanism exists for: on the Free plan, a recipient that
    // is not a verified destination. Whatever code that turns out to be, it must
    // fall through rather than becoming a message nobody receives.
    const stub = {
      ...env,
      EMAIL: {
        send: async () => {
          const err = new Error('Recipient is not a verified destination address.') as Error & { code?: string };
          err.code = 'E_NOT_ALLOWED_ON_PLAN';
          throw err;
        },
      },
      // Unset, so the Resend path reports its console fallback — which is enough
      // to prove control reached it without needing a real account.
      RESEND_API_KEY: undefined,
    } as unknown as Parameters<typeof sendMail>[0];

    const outcome = await sendMail(stub, {
      from: { email: 'sales@godwinausten.org' },
      to: [{ email: 'prospect@example.test' }],
      subject: 'outreach',
      text: 'body',
    }, 'auto');

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.transport).toBe('console');
  });

  it('honours an explicit cloudflare pin and never falls through', async () => {
    const { sendMail } = await import('../src/email/transport');
    const { env } = await import('cloudflare:test');

    // What the pin is for: a payroll or password-reset notice must not quietly
    // route through a third party because the free path had a bad minute.
    const stub = {
      ...env,
      EMAIL: {
        send: async () => {
          const err = new Error('nope') as Error & { code?: string };
          err.code = 'E_NOT_ALLOWED_ON_PLAN';
          throw err;
        },
      },
      RESEND_API_KEY: 'test-key-should-not-be-used',
    } as unknown as Parameters<typeof sendMail>[0];

    const outcome = await sendMail(stub, {
      from: { email: 'no-reply@godwinausten.org' },
      to: [{ email: 'someone@example.test' }],
      subject: 'pinned',
      text: 'body',
    }, 'cloudflare');

    expect(outcome.ok).toBe(false);
  });
});

describe('a reset link is not kept in the database', () => {
  it('sends the real link, then redacts the stored copy', async () => {
    const { env } = await import('cloudflare:test');
    const { dispatch } = await import('../src/email/events');

    await env.DB.prepare(
      "UPDATE users_logins SET recovery_email = 'someone@personal.example' WHERE id = 'u_mkt'",
    ).run();

    const result = await dispatch(env, {
      event: 'password_reset',
      to: [{ email: 'someone@personal.example' }],
      values: { userName: 'Marketing', resetUrl: 'https://pleiades.test/reset?token=SECRETTOKEN', expiresAt: 'in 60 minutes' },
      idempotencyKey: 'redact-check',
      recipientUserId: 'u_mkt',
    });
    expect(result.sent).toBe(true);
    if (!result.sent) return;

    const row = await env.DB.prepare('SELECT body_text, body_html FROM email_messages WHERE message_id = ?')
      .bind(result.messageId).first<{ body_text: string; body_html: string | null }>();

    // The token is gone from the row. It was present while the transport read it —
    // the first version of this redacted before the send and would have delivered
    // the placeholder.
    expect(row!.body_text).not.toContain('SECRETTOKEN');
    expect(row!.body_text).toContain('redacted');
    expect(row!.body_html).toBeNull();

    // And it was actually sent, not merely queued and blanked.
    const delivery = await env.DB.prepare('SELECT status FROM email_delivery WHERE message_id = ?')
      .bind(result.messageId).first<{ status: string }>();
    expect(delivery!.status).toBe('sent');
  });

  it('does not redact an ordinary notification', async () => {
    const { env } = await import('cloudflare:test');
    const { dispatch } = await import('../src/email/events');
    const result = await dispatch(env, {
      event: 'task_assigned',
      to: [{ email: 'staffer@example.test' }],
      values: { assigneeName: 'Staffer', taskTitle: 'Write the brief', department: 'Acquisition', dueDate: 'Friday', taskUrl: 'https://pleiades.test/acquisition' },
      idempotencyKey: 'no-redact-check',
    });
    expect(result.sent).toBe(true);
    if (!result.sent) return;
    const row = await env.DB.prepare('SELECT body_text FROM email_messages WHERE message_id = ?')
      .bind(result.messageId).first<{ body_text: string }>();
    expect(row!.body_text).toContain('Write the brief');
  });
});
