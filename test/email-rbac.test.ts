import { describe, it, expect, beforeAll } from 'vitest';
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
