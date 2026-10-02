import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { resetDatabase, tokenFor, type FixtureUser } from './helpers';

/**
 * Who may open which mailbox.
 *
 * This is the file to read before changing `src/email/mailboxes.ts`. Mail is the
 * most sensitive thing this system now stores — a mailbox holds payroll queries,
 * legal correspondence and, after the cutover, everything that used to be in
 * GoDaddy — and `canUseMailbox` has four branches whose ordering is the security
 * property. A test per branch, and one per way the ordering could be got wrong.
 *
 * Fixtures are in test/seed.sql:
 *   mbx_hr       app/hr        u_tech holds hr/email at view only
 *   mbx_acq      app/acq       u_mkt holds acquisition/email at view+edit
 *   mbx_payroll  app/hr        + a mailbox_grants row naming ONLY u_crm
 *   mbx_mkt      personal      owner u_mkt
 *   mbx_system   no-reply@     nobody
 *   mbx_alias    alias -> hr
 */

const BOX = {
  hr: 'mbx_hr',
  acq: 'mbx_acq',
  payroll: 'mbx_payroll',
  mkt: 'mbx_mkt',
  system: 'mbx_system',
  catchall: 'mbx_catchall',
  alias: 'mbx_alias',
} as const;

async function readMessages(user: FixtureUser, mailboxId: string): Promise<number> {
  const { SELF } = await import('cloudflare:test');
  const res = await SELF.fetch(`https://test.local/api/email/mailboxes/${mailboxId}/messages`, {
    headers: { Authorization: `Bearer ${await tokenFor(user)}` },
  });
  return res.status;
}

async function send(user: FixtureUser, body: Record<string, unknown>): Promise<Response> {
  const { SELF } = await import('cloudflare:test');
  return SELF.fetch('https://test.local/api/email/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tokenFor(user)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function mine(user: FixtureUser, query = ''): Promise<{ id: string; canSend: boolean }[]> {
  const { SELF } = await import('cloudflare:test');
  const res = await SELF.fetch(`https://test.local/api/email/mine${query}`, {
    headers: { Authorization: `Bearer ${await tokenFor(user)}` },
  });
  const json = await res.json() as { data: { id: string; canSend: boolean }[] };
  return json.data;
}

beforeAll(async () => {
  await resetDatabase();
});

describe('personal mailboxes are reached by ownership, not by a grant', () => {
  it('the owner can read their own', async () => {
    expect(await readMessages('mkt', BOX.mkt)).toBe(200);
  });

  it('nobody else can, however many app grants they hold', async () => {
    expect(await readMessages('tech', BOX.mkt)).toBe(403);
    expect(await readMessages('crm', BOX.mkt)).toBe(403);
    // Holds admin/mailboxes — which administers mailboxes and deliberately does
    // NOT read them. Being able to create somebody's inbox is not being able to
    // open it.
    expect(await readMessages('mailAdmin', BOX.mkt)).toBe(403);
  });

  it('is absent from every app-scoped listing, so no app grant can surface it', async () => {
    const hrBoxes = await mine('mkt', '?app=hr');
    expect(hrBoxes.map((b) => b.id)).not.toContain(BOX.mkt);
  });
});

describe('app mailboxes follow <app>/email', () => {
  it('a holder of the app grant can read', async () => {
    expect(await readMessages('tech', BOX.hr)).toBe(200);
  });

  it('somebody with no grant cannot', async () => {
    expect(await readMessages('none', BOX.hr)).toBe(403);
  });

  it("one app's grant does not open another app's mailbox", async () => {
    // The failure this pins is a plausible one: a single `email` read rule that
    // accepted any app's email grant would pass this mailbox to everybody.
    expect(await readMessages('tech', BOX.acq)).toBe(403);
    expect(await readMessages('mkt', BOX.hr)).toBe(403);
  });

  it('view on the app grant reads but does not send', async () => {
    expect(await readMessages('tech', BOX.hr)).toBe(200);
    const res = await send('tech', {
      mailboxId: BOX.hr,
      to: ['delivered+someone@resend.dev'],
      subject: 'no',
      text: 'no',
    });
    expect(res.status).toBe(403);
  });

  it('edit on the app grant sends', async () => {
    const res = await send('mkt', {
      mailboxId: BOX.acq,
      to: ['delivered+prospect@resend.dev'],
      subject: 'hello',
      text: 'hello',
    });
    expect(res.status).toBe(201);
  });
});

describe('mailbox_grants replaces the app grant rather than adding to it', () => {
  it('denies an app-grant holder who is not listed', async () => {
    // u_tech holds hr/email and mbx_payroll is an hr mailbox, so the ONLY reason
    // this is 403 is that a grant row exists naming somebody else. This is the
    // assertion that breaks if the two sources are ever ORed together.
    expect(await readMessages('tech', BOX.payroll)).toBe(403);
  });

  it('allows a listed user who holds no app grant at all', async () => {
    // u_crm has no hr/email. The row is the whole reason this works, which is the
    // other half of "replaces": it widens as well as narrows.
    expect(await readMessages('crm', BOX.payroll)).toBe(200);
  });

  it('never confers bulk, whatever the row says', async () => {
    const boxes = await mine('crm');
    const payroll = boxes.find((b) => b.id === BOX.payroll);
    expect(payroll).toBeDefined();
    const res = await send('crm', {
      mailboxId: BOX.payroll,
      to: Array.from({ length: 12 }, (_, i) => `p${i}@example.test`),
      subject: 'bulk',
      text: 'bulk',
    });
    expect(res.status).toBe(403);
  });
});

describe('the system mailbox is not a mailbox anybody can use', () => {
  it('cannot be read, even by the mailbox administrator', async () => {
    expect(await readMessages('mailAdmin', BOX.system)).toBe(403);
    expect(await readMessages('crm', BOX.system)).toBe(403);
  });

  it('cannot be sent as', async () => {
    // A message from no-reply@ is what recipients have been taught to read as
    // automated. A person being able to send one is the impersonation risk.
    const res = await send('mailAdmin', {
      mailboxId: BOX.system,
      to: ['delivered+someone@resend.dev'],
      subject: 'from the system',
      text: 'trust me',
    });
    expect(res.status).toBe(403);
  });

  it('is not listed to anybody', async () => {
    for (const user of ['ceo', 'mailAdmin', 'mkt', 'crm'] as FixtureUser[]) {
      const ids = (await mine(user)).map((b) => b.id);
      expect(ids).not.toContain(BOX.system);
    }
  });
});

describe('the catch-all is admin-only', () => {
  it('is refused to an ordinary mail user', async () => {
    // It collects everything addressed to nobody in particular, which is as
    // likely to be a misdirected payroll query as it is to be spam.
    expect(await readMessages('mkt', BOX.catchall)).toBe(403);
    expect(await readMessages('tech', BOX.catchall)).toBe(403);
  });

  it('is readable by the mailbox administrator', async () => {
    expect(await readMessages('mailAdmin', BOX.catchall)).toBe(200);
  });
});

describe('an alias has no storage of its own', () => {
  it('cannot be read even by someone who can read its target', async () => {
    expect(await readMessages('tech', BOX.hr)).toBe(200);
    expect(await readMessages('tech', BOX.alias)).toBe(403);
  });
});

describe('the From address cannot come from the request', () => {
  it('ignores a forged from field', async () => {
    const res = await send('mkt', {
      mailboxId: BOX.acq,
      from: 'ceo@godwinausten.org',
      fromAddress: 'ceo@godwinausten.org',
      to: ['delivered+prospect2@resend.dev'],
      subject: 'forged',
      text: 'forged',
      idempotencyKey: 'forge-test',
    });
    expect(res.status).toBe(201);

    const { SELF } = await import('cloudflare:test');
    const { id } = (await res.json() as { data: { id: string } }).data;
    const read = await SELF.fetch(`https://test.local/api/email/messages/${id}`, {
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}` },
    });
    const msg = (await read.json() as { data: { fromAddress: string } }).data;
    // The mailbox decided this, not the body.
    expect(msg.fromAddress).toBe('sales@godwinausten.org');
  });

  it('refuses a mailbox the caller does not hold, even a real one', async () => {
    const res = await send('mkt', {
      mailboxId: BOX.hr,
      to: ['delivered+someone@resend.dev'],
      subject: 'as HR',
      text: 'as HR',
    });
    expect(res.status).toBe(403);
  });
});

describe('administration is separate from use', () => {
  it('creating a mailbox needs admin/mailboxes, not <app>/email', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/mailboxes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: 'new@godwinausten.org', kind: 'app', appName: 'acquisition' }),
    });
    expect(res.status).toBe(403);
  });

  it('refuses a mailbox on a domain this system cannot send as', async () => {
    // Without this check, admin/mailboxes would let somebody create a mailbox at
    // another organisation's domain and send as it.
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/mailboxes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: 'billing@some-bank.example', kind: 'app', appName: 'finance' }),
    });
    expect(res.status).toBe(400);
  });

  it('refuses a personal mailbox with nobody to own it', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/mailboxes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: 'orphan@godwinausten.org', kind: 'personal' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('a department with several mailboxes', () => {
  it('lists every one its grant covers, so the composer can offer a choice', async () => {
    const { env, SELF } = await import('cloudflare:test');
    // HR really does need two: hr@ for internal matters and jobs@ for applicants,
    // and which one a reply comes from is part of writing it.
    await env.DB.prepare(
      "INSERT OR IGNORE INTO mailboxes (mailbox_id,address,display_name,kind,app_name,daily_send_cap,is_active,created_at,updated_at) " +
      "VALUES ('mbx_jobs','jobs@godwinausten.org','Careers','app','hr',40,1,0,0)",
    ).run();
    // u_tech holds hr/email at view only.
    await env.DB.prepare(
      "UPDATE user_app_permissions SET can_edit = 1 WHERE id = 'uap_u_tech_hr_email'",
    ).run();

    const res = await SELF.fetch('https://test.local/api/email/mine?app=hr', {
      headers: { Authorization: `Bearer ${await tokenFor('tech')}` },
    });
    const boxes = (await res.json() as { data: { id: string; canSend: boolean }[] }).data;
    const ids = boxes.map((b) => b.id);

    expect(ids).toContain('mbx_hr');
    expect(ids).toContain('mbx_jobs');
    // Both sendable from one grant, which is what makes a From selector meaningful.
    expect(boxes.filter((b) => b.canSend).length).toBeGreaterThanOrEqual(2);
    // And payroll@ stays out of it: a mailbox_grants row names somebody else.
    expect(ids).not.toContain('mbx_payroll');
  });

  it('can send from either of them', async () => {
    const { SELF } = await import('cloudflare:test');
    for (const mailboxId of ['mbx_hr', 'mbx_jobs']) {
      const res = await SELF.fetch('https://test.local/api/email/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await tokenFor('tech')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailboxId,
          to: ['delivered+candidate@resend.dev'],
          subject: 'from two senders',
          text: 'body',
          idempotencyKey: `two-senders-${mailboxId}`,
        }),
      });
      expect(res.status).toBe(201);
    }
  });

  it('still refuses a mailbox in another department', async () => {
    // Widening hr/email to edit must not have widened anything else.
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('tech')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailboxId: 'mbx_acq', to: ['delivered+x@resend.dev'], subject: 'x', text: 'x' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('moving a mailbox between departments', () => {
  it('reassigns an app mailbox, and records what it replaced', async () => {
    const { SELF, env } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/mailboxes/mbx_acq', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName: 'ops' }),
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT app_name FROM mailboxes WHERE mailbox_id = 'mbx_acq'")
      .first<{ app_name: string }>();
    expect(row!.app_name).toBe('ops');

    // Everyone with ops/email can now read what acquisition received, and
    // acquisition can no longer. That has to be reconstructable afterwards.
    const audit = await env.DB.prepare(
      "SELECT details FROM audit_logs WHERE table_name = 'mailboxes' AND record_id = 'mbx_acq' ORDER BY timestamp DESC LIMIT 1",
    ).first<{ details: string }>();
    expect(audit!.details).toContain('previousAppName');
    expect(audit!.details).toContain('acquisition');

    // And access really did follow the move: u_mkt holds acquisition/email only.
    expect(await readMessages('mkt', BOX.acq)).toBe(403);

    await env.DB.prepare("UPDATE mailboxes SET app_name = 'acquisition' WHERE mailbox_id = 'mbx_acq'").run();
  });

  it('refuses an app that has no mail', async () => {
    const { SELF } = await import('cloudflare:test');
    // `core` is shared reference data, not a department anybody writes to, so it has
    // no `email` feature — and a mailbox assigned to it would be reachable by nobody.
    for (const appName of ['core', 'dashboard', 'not-an-app']) {
      const res = await SELF.fetch('https://test.local/api/email/mailboxes/mbx_acq', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName }),
      });
      expect(res.status).toBe(400);
    }
  });

  it('refuses to give a personal mailbox to a department', async () => {
    const { SELF, env } = await import('cloudflare:test');
    // That would hand one person's private mail to a whole team.
    const res = await SELF.fetch('https://test.local/api/email/mailboxes/mbx_mkt', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName: 'hr' }),
    });
    expect(res.status).toBe(400);
    const row = await env.DB.prepare("SELECT kind, app_name, owner_user_id FROM mailboxes WHERE mailbox_id = 'mbx_mkt'")
      .first<{ kind: string; app_name: string | null; owner_user_id: string }>();
    expect(row!.kind).toBe('personal');
    expect(row!.app_name).toBeNull();
    expect(row!.owner_user_id).toBe('u_mkt');
  });

  it('still refuses reassignment to somebody without admin/mailboxes', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/mailboxes/mbx_hr', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName: 'acquisition' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('the catch-all is reachable, and only by an administrator', () => {
  it('appears under its own scope', async () => {
    const { SELF } = await import('cloudflare:test');
    /**
     * It belongs to no app and no person, so `?app=<name>` and `?app=personal` both
     * filtered it out — it collected everything addressed to nobody and no screen
     * could open it. `?app=catchall` is a reserved value, not an app name.
     */
    const res = await SELF.fetch('https://test.local/api/email/mine?app=catchall', {
      headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}` },
    });
    const ids = ((await res.json()) as { data: { id: string }[] }).data.map((b) => b.id);
    expect(ids).toEqual([BOX.catchall]);
  });

  it('is excluded from every department and personal scope', async () => {
    const { SELF } = await import('cloudflare:test');
    for (const q of ['?app=hr', '?app=acquisition', '?app=personal', '']) {
      const res = await SELF.fetch(`https://test.local/api/email/mine${q}`, {
        headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}` },
      });
      const ids = ((await res.json()) as { data: { id: string }[] }).data.map((b) => b.id);
      // The unscoped listing is the one exception: it is what the admin screens use.
      if (q === '') expect(ids).toContain(BOX.catchall);
      else expect(ids).not.toContain(BOX.catchall);
    }
  });

  it('is not offered to somebody without admin/mailboxes', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/mine?app=catchall', {
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}` },
    });
    expect(((await res.json()) as { data: unknown[] }).data).toEqual([]);
    // And asking for its contents directly is refused, not merely hidden.
    expect(await readMessages('mkt', BOX.catchall)).toBe(403);
  });
});


// ── Replying, drafts and threads ────────────────────────────────────────────

describe('replying threads at both ends', () => {
  const send = async (body: Record<string, unknown>) => {
    const { SELF } = await import('cloudflare:test');
    return SELF.fetch('https://test.local/api/email/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailboxId: 'mbx_acq', ...body }),
    });
  };

  it('derives In-Reply-To and References from the parent, server-side', async () => {
    const { env } = await import('cloudflare:test');
    // A received message with a Message-ID and an existing chain.
    await env.DB.prepare(
      "INSERT INTO email_threads (thread_id, mailbox_id, subject, last_message_at, message_count, created_at) " +
      "VALUES ('thr_reply','mbx_acq','Quote',0,1,0)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO email_messages (message_id, mailbox_id, thread_id, direction, folder, from_address, to_addresses, subject, body_text, message_id_header, references_header, is_read, is_starred, created_at) " +
      "VALUES ('eml_parent','mbx_acq','thr_reply','inbound','inbox','client@resend.dev','[]','Quote','how much?','<client-1@example.com>','<older-0@example.com>',1,0,0)",
    ).run();

    const res = await send({
      replyTo: 'eml_parent',
      to: ['delivered+client@resend.dev'],
      subject: 'Re: Quote',
      text: 'Here it is.',
      idempotencyKey: 'reply-1',
    });
    expect(res.status).toBe(201);
    const { id } = ((await res.json()) as { data: { id: string } }).data;

    const row = await env.DB.prepare(
      'SELECT in_reply_to_header, references_header, thread_id FROM email_messages WHERE message_id = ?',
    ).bind(id).first<{ in_reply_to_header: string; references_header: string; thread_id: string }>();

    expect(row!.in_reply_to_header).toBe('<client-1@example.com>');
    // The whole chain, oldest first, parent appended — what lets a client joining
    // late still assemble the thread.
    expect(row!.references_header).toBe('<older-0@example.com> <client-1@example.com>');
    // And it stays in the same conversation.
    expect(row!.thread_id).toBe('thr_reply');
  });

  it('refuses to reply to a message in a mailbox the caller cannot read', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare(
      "INSERT INTO email_messages (message_id, mailbox_id, direction, folder, from_address, to_addresses, subject, body_text, message_id_header, is_read, is_starred, created_at) " +
      "VALUES ('eml_hidden','mbx_payroll','inbound','inbox','x@resend.dev','[]','Salary','secret','<h@x>',1,0,0)",
    ).run();
    // Otherwise replying is a way to learn what is in a mailbox you cannot open.
    const res = await send({ replyTo: 'eml_hidden', to: ['delivered+x@resend.dev'], subject: 'Re', text: 'x' });
    expect(res.status).toBe(403);
  });

  it('returns the whole conversation, and only to somebody who can read it', async () => {
    const { SELF } = await import('cloudflare:test');
    const mine = await SELF.fetch('https://test.local/api/email/threads/thr_reply', {
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}` },
    });
    expect(mine.status).toBe(200);
    const body = (await mine.json()) as { data: { messages: unknown[] } };
    expect(body.data.messages.length).toBeGreaterThanOrEqual(2);

    const theirs = await SELF.fetch('https://test.local/api/email/threads/thr_reply', {
      headers: { Authorization: `Bearer ${await tokenFor('tech')}` },
    });
    expect(theirs.status).toBe(403);
  });
});

describe('drafts', () => {
  const put = async (body: Record<string, unknown>, id?: string) => {
    const { SELF } = await import('cloudflare:test');
    return SELF.fetch(`https://test.local/api/email/drafts${id ? `/${id}` : ''}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailboxId: 'mbx_acq', ...body }),
    });
  };

  it('saves without a delivery row, so nothing can send it', async () => {
    const { env } = await import('cloudflare:test');
    const res = await put({ subject: 'half written', text: 'wip', to: ['delivered+d@resend.dev'] });
    expect(res.status).toBe(201);
    const { id } = ((await res.json()) as { data: { id: string } }).data;

    const msg = await env.DB.prepare('SELECT folder, direction FROM email_messages WHERE message_id = ?')
      .bind(id).first<{ folder: string; direction: string }>();
    expect(msg!.folder).toBe('drafts');
    expect(msg!.direction).toBe('outbound');

    // No delivery row is the whole mechanism: the sweep selects from email_delivery,
    // so a draft is structurally unsendable rather than merely flagged.
    const del = await env.DB.prepare('SELECT count(*) AS n FROM email_delivery WHERE message_id = ?')
      .bind(id).first<{ n: number }>();
    expect(Number(del!.n)).toBe(0);

    const { sweep } = await import('../src/email/outbox');
    await sweep(env);
    const after = await env.DB.prepare('SELECT folder FROM email_messages WHERE message_id = ?')
      .bind(id).first<{ folder: string }>();
    expect(after!.folder).toBe('drafts');
  });

  it('updates in place rather than accumulating rows', async () => {
    const { env } = await import('cloudflare:test');
    const first = await put({ subject: 'v1', text: 'a', to: ['delivered+d@resend.dev'] });
    const { id } = ((await first.json()) as { data: { id: string } }).data;

    for (const n of ['v2', 'v3', 'v4']) {
      const r = await put({ subject: n, text: 'a', to: ['delivered+d@resend.dev'] }, id);
      expect(r.status).toBe(200);
    }
    const row = await env.DB.prepare('SELECT subject FROM email_messages WHERE message_id = ?')
      .bind(id).first<{ subject: string }>();
    expect(row!.subject).toBe('v4');
  });

  it('does not count against the daily cap while unsent', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare("UPDATE mailboxes SET daily_send_cap = 2 WHERE mailbox_id = 'mbx_acq'").run();
    // Three drafts would exceed a cap of two if drafts were counted — and leaving a
    // half-written message open all afternoon would slowly close the mailbox.
    for (let i = 0; i < 3; i += 1) {
      const r = await put({ subject: `draft ${i}`, text: 'x', to: ['delivered+d@resend.dev'] });
      expect(r.status).toBe(201);
    }
    await env.DB.prepare("UPDATE mailboxes SET daily_send_cap = 200 WHERE mailbox_id = 'mbx_acq'").run();
  });

  it('refuses to send one with no recipient, subject or body', async () => {
    const { SELF } = await import('cloudflare:test');
    const empty = await put({ subject: '', text: '', to: [] });
    const { id } = ((await empty.json()) as { data: { id: string } }).data;
    const res = await SELF.fetch(`https://test.local/api/email/drafts/${id}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    // Checked at SEND time, not save time: a draft may sit for a week and the answers
    // change.
    expect(res.status).toBe(400);
  });

  it('sends, becomes a sent message, and cannot be sent twice', async () => {
    const { SELF, env } = await import('cloudflare:test');
    const saved = await put({ subject: 'ready', text: 'body', to: ['delivered+ready@resend.dev'] });
    const { id } = ((await saved.json()) as { data: { id: string } }).data;

    const first = await SELF.fetch(`https://test.local/api/email/drafts/${id}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(first.status).toBe(200);

    const row = await env.DB.prepare('SELECT folder FROM email_messages WHERE message_id = ?')
      .bind(id).first<{ folder: string }>();
    // It stops being a draft the moment it acquires a delivery row — the two must not
    // disagree, or it would be editable and in flight at once.
    expect(row!.folder).toBe('sent');

    const second = await SELF.fetch(`https://test.local/api/email/drafts/${id}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(second.status).toBe(400);
  });

  it('is invisible to somebody who cannot send from its mailbox', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/drafts', {
      headers: { Authorization: `Bearer ${await tokenFor('tech')}` },
    });
    const drafts = ((await res.json()) as { data: { mailboxId: string }[] }).data;
    expect(drafts.every((d) => d.mailboxId !== 'mbx_acq')).toBe(true);
  });

  it('cannot be edited or deleted by somebody else', async () => {
    const { SELF } = await import('cloudflare:test');
    const saved = await put({ subject: 'mine', text: 'x', to: ['delivered+m@resend.dev'] });
    const { id } = ((await saved.json()) as { data: { id: string } }).data;

    const edit = await SELF.fetch(`https://test.local/api/email/drafts/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await tokenFor('tech')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailboxId: 'mbx_hr', subject: 'stolen', text: 'x' }),
    });
    // Authorised against the DRAFT's mailbox, not the one in the body — otherwise a
    // caller could move somebody else's draft into a mailbox they hold.
    expect(edit.status).toBe(403);

    const del = await SELF.fetch(`https://test.local/api/email/drafts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await tokenFor('tech')}` },
    });
    expect(del.status).toBe(403);
  });
});


describe('scheduling', () => {
  const put = async (body: Record<string, unknown>) => {
    const { SELF } = await import('cloudflare:test');
    return SELF.fetch('https://test.local/api/email/drafts', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailboxId: 'mbx_acq', ...body }),
    });
  };
  const sendDraft = async (id: string, body: Record<string, unknown> = {}) => {
    const { SELF } = await import('cloudflare:test');
    return SELF.fetch(`https://test.local/api/email/drafts/${id}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  it('holds a scheduled message instead of sending it', async () => {
    const { env } = await import('cloudflare:test');
    const saved = await put({ subject: 'later', text: 'body', to: ['delivered+later@resend.dev'] });
    const { id } = ((await saved.json()) as { data: { id: string } }).data;

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await sendDraft(id, { scheduledFor: future });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { scheduled: boolean } }).data.scheduled).toBe(true);

    await new Promise((r) => setTimeout(r, 200));
    const row = await env.DB.prepare('SELECT status, scheduled_for FROM email_delivery WHERE message_id = ?')
      .bind(id).first<{ status: string; scheduled_for: number }>();
    // Queued, not sent — and the sweep will leave it alone until its time.
    expect(row!.status).toBe('queued');
    expect(row!.scheduled_for).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('refuses to send one early even when drainOne is called directly', async () => {
    const { env } = await import('cloudflare:test');
    const { drainOne } = await import('../src/email/outbox');
    const saved = await put({ subject: 'much later', text: 'body', to: ['delivered+much@resend.dev'] });
    const { id } = ((await saved.json()) as { data: { id: string } }).data;
    await sendDraft(id, { scheduledFor: new Date(Date.now() + 3600_000).toISOString() });

    /**
     * `sweep` filters on scheduled_for, but drainOne is also called directly by the send
     * route's waitUntil — without the guard, scheduling for next Tuesday would send now.
     */
    expect(await drainOne(env, id)).toBe('skipped');
    const row = await env.DB.prepare('SELECT status FROM email_delivery WHERE message_id = ?')
      .bind(id).first<{ status: string }>();
    // Released back to queued, not stranded in `sending` waiting out a lease.
    expect(row!.status).toBe('queued');
  });

  it('sends one whose time has come', async () => {
    const { env } = await import('cloudflare:test');
    const { sweep } = await import('../src/email/outbox');
    const saved = await put({ subject: 'due now', text: 'body', to: ['delivered+due@resend.dev'] });
    const { id } = ((await saved.json()) as { data: { id: string } }).data;
    await sendDraft(id, { scheduledFor: new Date(Date.now() + 3600_000).toISOString() });

    // Move its time into the past, as the clock would.
    await env.DB.prepare('UPDATE email_delivery SET scheduled_for = ? WHERE message_id = ?')
      .bind(Math.floor(Date.now() / 1000) - 60, id).run();
    await sweep(env);

    const row = await env.DB.prepare('SELECT status FROM email_delivery WHERE message_id = ?')
      .bind(id).first<{ status: string }>();
    expect(row!.status).toBe('sent');
  });

  it('refuses a time in the past or beyond the limit', async () => {
    const saved = await put({ subject: 'x', text: 'body', to: ['delivered+x@resend.dev'] });
    const { id } = ((await saved.json()) as { data: { id: string } }).data;
    // Quietly sending something dated yesterday is the wrong guess — they meant something.
    const past = await sendDraft(id, { scheduledFor: new Date(Date.now() - 60_000).toISOString() });
    expect(past.status).toBe(400);
    const tooFar = await sendDraft(id, { scheduledFor: new Date(Date.now() + 200 * 864e5).toISOString() });
    expect(tooFar.status).toBe(400);
    const nonsense = await sendDraft(id, { scheduledFor: 'next thursday-ish' });
    expect(nonsense.status).toBe(400);
  });

  it('cancels back to drafts so it can be edited and rescheduled', async () => {
    const { SELF, env } = await import('cloudflare:test');
    const saved = await put({ subject: 'reconsider', text: 'body', to: ['delivered+re@resend.dev'] });
    const { id } = ((await saved.json()) as { data: { id: string } }).data;
    await sendDraft(id, { scheduledFor: new Date(Date.now() + 3600_000).toISOString() });

    const res = await SELF.fetch(`https://test.local/api/email/scheduled/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);

    const msg = await env.DB.prepare('SELECT folder FROM email_messages WHERE message_id = ?')
      .bind(id).first<{ folder: string }>();
    const del = await env.DB.prepare('SELECT count(*) AS n FROM email_delivery WHERE message_id = ?')
      .bind(id).first<{ n: number }>();
    /**
     * Deleting the delivery row rather than marking it cancelled is what makes it
     * editable again — a draft is defined by not having one.
     */
    expect(msg!.folder).toBe('drafts');
    expect(Number(del!.n)).toBe(0);
  });

  it('lists what is waiting, and only from mailboxes the caller can read', async () => {
    const { SELF } = await import('cloudflare:test');
    const mine = await SELF.fetch('https://test.local/api/email/scheduled', {
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}` },
    });
    const rows = ((await mine.json()) as { data: { mailboxId: string }[] }).data;
    expect(rows.every((r) => r.mailboxId === 'mbx_acq')).toBe(true);

    const theirs = await SELF.fetch('https://test.local/api/email/scheduled', {
      headers: { Authorization: `Bearer ${await tokenFor('tech')}` },
    });
    const others = ((await theirs.json()) as { data: { mailboxId: string }[] }).data;
    expect(others.every((r) => r.mailboxId !== 'mbx_acq')).toBe(true);
  });
});

describe('export', () => {
  it('produces an mbox an importer can read', async () => {
    const { SELF, env } = await import('cloudflare:test');
    await env.DB.prepare(
      "INSERT OR IGNORE INTO email_messages (message_id, mailbox_id, direction, folder, from_address, to_addresses, subject, body_text, is_read, is_starred, created_at) " +
      "VALUES ('eml_export','mbx_acq','inbound','inbox','client@resend.dev','[]','Contract','From the client.' || char(10) || 'From Monday we start.',1,0,100)",
    ).run();

    const res = await SELF.fetch('https://test.local/api/email/export?mailbox=mbx_acq', {
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/mbox');
    expect(res.headers.get('content-disposition')).toContain('.mbox');

    const body = await res.text();
    // Each message starts with a From_ line, which is the separator, not a header.
    expect(body).toMatch(/^From client@resend\.dev /m);
    expect(body).toContain('X-Pleiades-Mailbox: sales@godwinausten.org');
    expect(body).toContain('Subject: Contract');
    /**
     * The classic mbox corruption: a body line beginning "From " is read by the next
     * importer as the start of a new message unless it is escaped.
     */
    expect(body).toContain('>From Monday we start.');
  });

  it('marks reconstructed messages as such', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/export?mailbox=mbx_acq', {
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}` },
    });
    const body = await res.text();
    // Sent mail has no original bytes — the provider built it — so nobody auditing this
    // should mistake the synthesised version for what crossed the wire.
    expect(body).toContain('X-Pleiades-Fidelity: reconstructed');
  });

  it('excludes drafts, which were never messages', async () => {
    const { SELF, env } = await import('cloudflare:test');
    await env.DB.prepare(
      "INSERT OR IGNORE INTO email_messages (message_id, mailbox_id, direction, folder, from_address, to_addresses, subject, body_text, is_read, is_starred, created_at) " +
      "VALUES ('eml_draftonly','mbx_acq','outbound','drafts','sales@godwinausten.org','[]','NEVER-SENT-DRAFT','wip',1,0,100)",
    ).run();
    const res = await SELF.fetch('https://test.local/api/email/export?mailbox=mbx_acq', {
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}` },
    });
    expect(await res.text()).not.toContain('NEVER-SENT-DRAFT');
  });

  it('does not hand an administrator somebody else’s personal mail', async () => {
    const { SELF, env } = await import('cloudflare:test');
    await env.DB.prepare(
      "INSERT OR IGNORE INTO email_messages (message_id, mailbox_id, direction, folder, from_address, to_addresses, subject, body_text, is_read, is_starred, created_at) " +
      "VALUES ('eml_private','mbx_mkt','inbound','inbox','friend@resend.dev','[]','PRIVATE-SUBJECT','personal',1,0,100)",
    ).run();

    /**
     * An export route is exactly where the one invariant no grant can override would
     * quietly die. u_mail holds admin/mailboxes; mbx_mkt belongs to u_mkt.
     */
    const res = await SELF.fetch('https://test.local/api/email/export', {
      headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}` },
    });
    expect(await res.text()).not.toContain('PRIVATE-SUBJECT');

    // Its owner can export it.
    const owner = await SELF.fetch('https://test.local/api/email/export?mailbox=mbx_mkt', {
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}` },
    });
    expect(await owner.text()).toContain('PRIVATE-SUBJECT');
  });

  it('refuses a mailbox the caller cannot read', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/export?mailbox=mbx_payroll', {
      headers: { Authorization: `Bearer ${await tokenFor('tech')}` },
    });
    expect(res.status).toBe(400);
  });
});

/**
 * Editing and permanently removing a mailbox.
 *
 * Deactivating stays the default DELETE, and that is the important part: a mailbox
 * owns received mail, Cloudflare Email Routing keeps no copy of it, so `is_active = 0`
 * — stops sending, stays readable, reversible — is what turning one off should mean.
 * The purge is the separate, irreversible thing, and it has to be asked for.
 */
describe('editing a mailbox after it exists', () => {
  beforeEach(async () => {
    const { reseed } = await import('./helpers');
    await reseed();
  });

  const patch = async (user: FixtureUser, id: string, body: unknown) => {
    const { SELF } = await import('cloudflare:test');
    return SELF.fetch(`https://test.local/api/email/mailboxes/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await tokenFor(user)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  it('changes the display name and the send cap', async () => {
    const res = await patch('mailAdmin', 'mbx_hr', { displayName: 'People Team', dailySendCap: 40 });
    expect(res.status).toBe(200);

    const { env } = await import('cloudflare:test');
    const row = await env.DB.prepare('SELECT display_name, daily_send_cap FROM mailboxes WHERE mailbox_id = ?')
      .bind('mbx_hr').first();
    expect(row?.display_name).toBe('People Team');
    expect(row?.daily_send_cap).toBe(40);
  });

  it('refuses the address and the kind, which would re-point stored history', async () => {
    const res = await patch('mailAdmin', 'mbx_hr', { address: 'something-else@godwinausten.org', kind: 'personal' });
    // An allowlist, so both are reported as ignored rather than silently dropped.
    expect(res.status).toBe(400);

    const { env } = await import('cloudflare:test');
    const row = await env.DB.prepare('SELECT address, kind FROM mailboxes WHERE mailbox_id = ?').bind('mbx_hr').first();
    expect(row?.address).toBe('hr@godwinausten.org');
    expect(row?.kind).toBe('app');
  });

  it('needs admin/mailboxes edit', async () => {
    expect((await patch('tech', 'mbx_hr', { displayName: 'Mine now' })).status).toBe(403);
  });
});

describe('permanently deleting a mailbox', () => {
  beforeEach(async () => {
    const { reseed } = await import('./helpers');
    await reseed();
  });

  const del = async (user: FixtureUser, id: string, query = '') => {
    const { SELF } = await import('cloudflare:test');
    return SELF.fetch(`https://test.local/api/email/mailboxes/${id}${query}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await tokenFor(user)}` },
    });
  };

  const exists = async (id: string): Promise<boolean> => {
    const { env } = await import('cloudflare:test');
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM mailboxes WHERE mailbox_id = ?').bind(id).first<{ n: number }>();
    return (row?.n ?? 0) > 0;
  };

  it('deactivates by default, keeping the mailbox and its mail', async () => {
    const res = await del('mailAdmin', 'mbx_hr');
    expect(res.status).toBe(200);
    expect((await res.json() as any).data.deactivated).toBe(true);
    expect(await exists('mbx_hr')).toBe(true);
  });

  it('removes it only when ?purge=1 is asked for', async () => {
    const res = await del('mailAdmin', 'mbx_hr', '?purge=1');
    expect(res.status).toBe(200);
    expect(await exists('mbx_hr')).toBe(false);
  });

  it('takes the alias that delivered into it, which would otherwise drop mail', async () => {
    // An alias has no storage of its own, so one pointing at a mailbox that is gone
    // would accept mail and discard it.
    expect(await exists('mbx_alias')).toBe(true);
    await del('mailAdmin', 'mbx_hr', '?purge=1');
    expect(await exists('mbx_alias')).toBe(false);
  });

  it('refuses the system mailbox, in both modes', async () => {
    expect((await del('mailAdmin', 'mbx_system')).status).toBe(400);
    expect((await del('mailAdmin', 'mbx_system', '?purge=1')).status).toBe(400);
    expect(await exists('mbx_system')).toBe(true);
  });

  it('reports what a purge would destroy, and offers the mbox export first', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/mailboxes/mbx_hr/impact', {
      headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}` },
    });
    expect(res.status).toBe(200);
    const { data } = await res.json() as any;
    expect(data.label).toBe('hr@godwinausten.org');
    // The alias is named rather than quietly taken.
    const aliasItem = data.items.find((i: any) => i.label === 'Aliases delivering into it');
    expect(aliasItem.examples).toContain('info@godwinausten.org');
    // And it says where later mail goes, which is the question an operator has next.
    expect(JSON.stringify(data.items)).toContain('catch-all');
  });

  it('names the system mailbox as a blocker rather than a warning', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://test.local/api/email/mailboxes/mbx_system/impact', {
      headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}` },
    });
    expect((await res.json() as any).data.blockers.join(' ')).toContain('system mailbox');
  });

  it('needs admin/mailboxes delete', async () => {
    expect((await del('tech', 'mbx_hr', '?purge=1')).status).toBe(403);
    expect(await exists('mbx_hr')).toBe(true);
  });
});
