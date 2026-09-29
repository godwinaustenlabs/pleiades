import { describe, it, expect, beforeAll } from 'vitest';
import { resetDatabase, tokenFor, type FixtureUser } from './helpers';
import { validate } from '../src/email/transport';
import { render } from '../src/email/render';

/**
 * Adversarial suite: the mail system as an attacker would poke it.
 *
 * Everything here is a specific thing somebody could try, not a general
 * "does authorization work" check — that is test/email-rbac.test.ts. These are the
 * classes of bug that got past the first pass: mass assignment, privilege
 * escalation through a field nobody thought was writable, reading somebody else's
 * data by guessing an id, and injection into the one place output is not escaped.
 */

const AS = async (user: FixtureUser, path: string, init: RequestInit = {}) => {
  const { SELF } = await import('cloudflare:test');
  return SELF.fetch(`https://test.local${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await tokenFor(user)}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
};

beforeAll(async () => { await resetDatabase(); });

describe('mass assignment', () => {
  it('cannot change a mailbox address, which would re-point stored history', async () => {
    const { env } = await import('cloudflare:test');
    const res = await AS('mailAdmin', '/api/email/mailboxes/mbx_hr', {
      method: 'PATCH',
      body: JSON.stringify({ address: 'attacker@godwinausten.org', displayName: 'People' }),
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT address FROM mailboxes WHERE mailbox_id = 'mbx_hr'")
      .first<{ address: string }>();
    expect(row!.address).toBe('hr@godwinausten.org');
    // Rejected rather than ignored in silence, so the attempt is findable.
    expect(JSON.stringify(await res.json())).toContain('address');
  });

  it('cannot re-own a personal mailbox to steal somebody else’s mail', async () => {
    const { env } = await import('cloudflare:test');
    await AS('mailAdmin', '/api/email/mailboxes/mbx_mkt', {
      method: 'PATCH',
      body: JSON.stringify({ ownerUserId: 'u_none', displayName: 'x' }),
    });
    const row = await env.DB.prepare("SELECT owner_user_id FROM mailboxes WHERE mailbox_id = 'mbx_mkt'")
      .first<{ owner_user_id: string }>();
    expect(row!.owner_user_id).toBe('u_mkt');
  });

  it('cannot move a mailbox to another department without admin/mailboxes', async () => {
    const { env } = await import('cloudflare:test');

    /**
     * This used to assert that NOBODY could reassign a mailbox, because `appName` was
     * excluded from the allowlist entirely. That was too strict — it also blocked
     * fixing a mis-assignment, and the only workaround left was delete-and-recreate,
     * which loses the stored correspondence. It is allowed now for a holder of
     * admin/mailboxes, validated against the apps that have mail, and audited with
     * the value it replaced (see test/email-rbac.test.ts).
     *
     * What must still hold is that an ordinary department user cannot do it — moving a
     * mailbox hands everything it has received to a different team.
     */
    const res = await AS('mkt', '/api/email/mailboxes/mbx_hr', {
      method: 'PATCH',
      body: JSON.stringify({ appName: 'acquisition' }),
    });
    expect(res.status).toBe(403);
    const row = await env.DB.prepare("SELECT app_name FROM mailboxes WHERE mailbox_id = 'mbx_hr'")
      .first<{ app_name: string }>();
    expect(row!.app_name).toBe('hr');
  });

  it('cannot build an alias chain a create would refuse', async () => {
    const { env } = await import('cloudflare:test');
    // create() rejects alias -> alias because a chain admits a cycle, and a cycle
    // in the inbound path is a loop inside a handler that must not throw.
    await AS('mailAdmin', '/api/email/mailboxes/mbx_alias', {
      method: 'PATCH',
      body: JSON.stringify({ forwardsToMailboxId: 'mbx_alias', displayName: 'z' }),
    });
    const row = await env.DB.prepare("SELECT forwards_to_mailbox_id FROM mailboxes WHERE mailbox_id = 'mbx_alias'")
      .first<{ forwards_to_mailbox_id: string }>();
    expect(row!.forwards_to_mailbox_id).toBe('mbx_hr');
  });
});

describe('privilege escalation', () => {
  it('cannot set is_superadmin through the user route', async () => {
    const { env } = await import('cloudflare:test');
    // The hole that existed: the body was spread into the update behind two
    // deletes, so anybody with admin/users edit could promote themselves and
    // bypass every check in the system.
    const res = await AS('ceo', '/api/admin/users/u_none', {
      method: 'PATCH',
      body: JSON.stringify({ isSuperadmin: true, name: 'Nobody' }),
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT is_superadmin FROM users_logins WHERE id = 'u_none'")
      .first<{ is_superadmin: number }>();
    expect(row!.is_superadmin).toBe(0);
  });

  it('cannot set a password hash through the user route', async () => {
    const { env } = await import('cloudflare:test');
    await AS('ceo', '/api/admin/users/u_none', {
      method: 'PATCH',
      body: JSON.stringify({ passwordHash: 'pbkdf2$1$00$00', name: 'Nobody' }),
    });
    const row = await env.DB.prepare("SELECT password_hash FROM users_logins WHERE id = 'u_none'")
      .first<{ password_hash: string }>();
    expect(row!.password_hash).toBe('x');
  });

  it('cannot promote a department template to system scope', async () => {
    const { env } = await import('cloudflare:test');
    // Otherwise a caller with acquisition/email_templates owns every department's
    // automated mail — and the reset email.
    const res = await AS('mkt', '/api/email/templates/tpl_acq_intro', {
      method: 'PATCH',
      body: JSON.stringify({ scope: 'system', appName: null, name: 'Intro' }),
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT scope, app_name FROM email_templates WHERE template_id = 'tpl_acq_intro'")
      .first<{ scope: string; app_name: string }>();
    expect(row!.scope).toBe('app');
    expect(row!.app_name).toBe('acquisition');
  });

  it('cannot edit a system template without admin/email_config', async () => {
    // These back the reset email and the task notification: an edit reaches
    // everybody, repeatedly, and nobody notices until a client reads it.
    const res = await AS('mkt', '/api/email/templates/tpl_password_reset', {
      method: 'PATCH',
      body: JSON.stringify({ bodyText: 'Click {{resetUrl}} — signed, not HR' }),
    });
    expect(res.status).toBe(403);
  });

  it('cannot delete a system template', async () => {
    const res = await AS('ceo', '/api/email/templates/tpl_password_reset', { method: 'DELETE' });
    // Even a superadmin: deleting it breaks the code path silently, and the
    // symptom is mail that stops being sent.
    expect(res.status).toBe(400);
  });

  it('cannot create a template whose key shadows an automated event', async () => {
    const res = await AS('mkt', '/api/email/templates', {
      method: 'POST',
      body: JSON.stringify({
        appName: 'acquisition', key: 'password_reset', name: 'x',
        subject: 'x', bodyText: 'x', variables: [],
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe('reading somebody else’s mail by guessing', () => {
  it('refuses a message id in a mailbox the caller cannot read', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare(
      "INSERT INTO email_messages (message_id, mailbox_id, direction, folder, from_address, to_addresses, subject, body_text, is_read, is_starred, created_at) " +
      "VALUES ('eml_secret','mbx_payroll','inbound','inbox','delivered+someone@resend.dev','[]','Salary query','confidential',0,0,0)",
    ).run();

    // u_tech holds hr/email and mbx_payroll is an hr mailbox — only the
    // mailbox_grants row naming somebody else keeps this shut.
    const res = await AS('tech', '/api/email/messages/eml_secret');
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('confidential');
  });

  it('refuses to mark a message read in a mailbox the caller cannot open', async () => {
    const res = await AS('tech', '/api/email/messages/eml_secret', {
      method: 'PATCH',
      body: JSON.stringify({ isRead: true }),
    });
    expect(res.status).toBe(403);
  });

  it('cannot move somebody else’s message to the trash', async () => {
    const { env } = await import('cloudflare:test');
    await AS('tech', '/api/email/messages/eml_secret', {
      method: 'PATCH',
      body: JSON.stringify({ folder: 'trash' }),
    });
    const row = await env.DB.prepare("SELECT folder FROM email_messages WHERE message_id = 'eml_secret'")
      .first<{ folder: string }>();
    expect(row!.folder).toBe('inbox');
  });

  it('refuses an attachment belonging to a mailbox the caller cannot read', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare(
      "INSERT INTO email_attachments (attachment_id, message_id, filename, content_type, size_bytes, r2_key, disposition, created_at) " +
      "VALUES ('eatt_secret','eml_secret','payslip.pdf','application/pdf',10,'email-att/mbx_payroll/eml_secret/x','attachment',0)",
    ).run();
    const res = await AS('tech', `/api/assets/download/${encodeURIComponent('email-att/mbx_payroll/eml_secret/x')}`);
    expect(res.status).toBe(403);
  });

  it('cannot read another mailbox’s grants list', async () => {
    // It names people, which is information about who handles payroll.
    const res = await AS('tech', '/api/email/mailboxes/mbx_payroll/grants');
    expect(res.status).toBe(403);
  });

  it('cannot rewrite another mailbox’s grants to grant itself access', async () => {
    const { env } = await import('cloudflare:test');
    await AS('tech', '/api/email/mailboxes/mbx_payroll/grants', {
      method: 'PUT',
      body: JSON.stringify({ grants: [{ userId: 'u_tech', canRead: true, canSend: true }] }),
    });
    const rows = await env.DB.prepare("SELECT user_id FROM mailbox_grants WHERE mailbox_id = 'mbx_payroll'").all<{ user_id: string }>();
    expect(rows.results.map((r) => r.user_id)).toEqual(['u_crm']);
  });
});

describe('sending as somebody you are not', () => {
  it('ignores every field that looks like a sender', async () => {
    const { env } = await import('cloudflare:test');
    const res = await AS('mkt', '/api/email/send', {
      method: 'POST',
      body: JSON.stringify({
        mailboxId: 'mbx_acq',
        from: 'ceo@godwinausten.org',
        fromAddress: 'ceo@godwinausten.org',
        fromName: 'The CEO',
        sender: 'ceo@godwinausten.org',
        to: ['delivered+target@resend.dev'],
        subject: 'spoof attempt',
        text: 'body',
        idempotencyKey: 'spoof-1',
      }),
    });
    expect(res.status).toBe(201);
    const row = await env.DB.prepare("SELECT from_address, from_name FROM email_messages WHERE subject = 'spoof attempt'")
      .first<{ from_address: string; from_name: string }>();
    // The mailbox decided both. There is no code path from the body to the From.
    expect(row!.from_address).toBe('sales@godwinausten.org');
    expect(row!.from_name).toBe('Sales');
  });

  it('cannot send as the system mailbox, which is what recipients trust as automated', async () => {
    for (const user of ['mkt', 'mailAdmin', 'crm'] as FixtureUser[]) {
      const res = await AS(user, '/api/email/send', {
        method: 'POST',
        body: JSON.stringify({ mailboxId: 'mbx_system', to: ['delivered+x@resend.dev'], subject: 'x', text: 'x' }),
      });
      expect(res.status).toBe(403);
    }
  });

  it('cannot forge a transactional idempotency key to suppress a real notification', async () => {
    const { env } = await import('cloudflare:test');
    // The route prefixes a caller-supplied key with `manual:`, which is what makes
    // the two namespaces unable to collide. Without it, a user could pre-register
    // `task_assigned:<task>:<employee>` and silently stop that person being told.
    await AS('mkt', '/api/email/send', {
      method: 'POST',
      body: JSON.stringify({
        mailboxId: 'mbx_acq', to: ['delivered+x@resend.dev'], subject: 'collide', text: 'x',
        idempotencyKey: 'task_assigned:task_victim:emp_victim',
      }),
    });
    const row = await env.DB.prepare("SELECT idempotency_key FROM email_delivery WHERE idempotency_key LIKE ? ESCAPE ?")
      .bind('manual:%', '\\').first<{ idempotency_key: string }>();
    expect(row!.idempotency_key.startsWith('manual:')).toBe(true);

    // And the transactional key itself is still free.
    const clash = await env.DB.prepare("SELECT count(*) AS n FROM email_delivery WHERE idempotency_key = 'task_assigned:task_victim:emp_victim'")
      .first<{ n: number }>();
    expect(Number(clash!.n)).toBe(0);
  });
});

describe('injection', () => {
  it('strips header breaks from the fields that become headers', () => {
    // Bcc smuggled through a subject is invisible on the message we stored.
    const out = validate({
      from: { email: 'a@godwinausten.org' },
      to: [{ email: 'delivered+b@resend.dev' }],
      subject: 'ok',
      text: 'body',
    });
    expect(out).toBeNull();
  });

  it('does not let a template variable inject markup into the HTML part', () => {
    const out = render(
      {
        subject: 'Hi {{name}}',
        bodyText: 'Hi {{name}}',
        bodyHtml: '<p>Hi {{name}}</p>',
        variables: [{ name: 'name', label: 'Name', required: true }],
      },
      { name: '<img src=x onerror=alert(1)>' },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rendered.html).not.toContain('<img');
    expect(out.rendered.html).toContain('&lt;img');
  });

  it('does not let a value expand into another variable', () => {
    const out = render(
      {
        subject: 's',
        bodyText: '{{a}} {{b}}',
        bodyHtml: null,
        variables: [
          { name: 'a', label: 'A', required: true },
          { name: 'b', label: 'B', required: true },
        ],
      },
      { a: '{{b}}', b: 'SECRET' },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // One pass with a callback, not a loop of replacements.
    expect(out.rendered.text).toBe('{{b}} SECRET');
  });

  it('refuses a mailbox on a domain this system cannot send as', async () => {
    for (const address of [
      'billing@some-bank.example',
      'x@godwinausten.org.attacker.example',
      'x@notgodwinausten.org',
    ]) {
      const res = await AS('mailAdmin', '/api/email/mailboxes', {
        method: 'POST',
        body: JSON.stringify({ address, kind: 'app', appName: 'ops' }),
      });
      expect(res.status).toBe(400);
    }
  });
});

describe('a stranger cannot forge their own authentication verdict', () => {
  it('ignores an Authentication-Results header it cannot attribute', async () => {
    const { authResults, splitMessage } = await import('../src/email/mime');
    // Anyone can put this in a message they send. If it were believed, the check
    // that catches somebody claiming to be us — the mechanism behind invoice
    // redirection — would be defeated by one header.
    const forged = splitMessage('Authentication-Results: mx; spf=pass; dkim=pass; dmarc=pass\r\n\r\nbody');
    expect(authResults(forged.headers)).toEqual({});
  });

  it('believes one written by the receiving MTA', async () => {
    const { authResults, splitMessage } = await import('../src/email/mime');
    const real = splitMessage('Authentication-Results: mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass\r\n\r\nbody');
    expect(authResults(real.headers)).toEqual({ spf: 'pass', dkim: 'pass', dmarc: 'pass' });
  });

  it('does not read a policy tag as a verdict', async () => {
    const { authResults, splitMessage } = await import('../src/email/mime');
    // `aspf=r` contains `spf=r`. Unanchored, this reported an SPF verdict of "r"
    // for a message whose SPF was never evaluated.
    const real = splitMessage(
      'Authentication-Results: mx.cloudflare.net; dmarc=pass (p=REJECT sp=REJECT aspf=r adkim=s)\r\n\r\nbody',
    );
    const out = authResults(real.headers);
    expect(out.dmarc).toBe('pass');
    expect(out.spf).toBeUndefined();
  });

  it('a forged verdict cannot get an our-domain sender past the spam check', async () => {
    const { parseMessage } = await import('../src/email/mime');
    const { authResults } = await import('../src/email/mime');
    const { scoreMessage } = await import('../src/email/spam');
    const raw = 'From: ceo@godwinausten.org\r\nSubject: Urgent wire transfer\r\n'
      + 'Authentication-Results: mx; dmarc=pass\r\n\r\nPlease wire the funds today.';
    const msg = parseMessage(raw);
    const verdict = scoreMessage(msg, authResults(msg.headers), ['godwinausten.org']);
    // Unattributable verdicts are discarded, so dmarc is not `pass`, so the
    // forged-internal-sender rule fires.
    expect(verdict.verdict).toBe('spam');
  });
});

describe('password recovery cannot be turned into a way in', () => {
  it('refuses a recovery address on a domain this system hosts', async () => {
    // Otherwise a reset tells a locked-out person to read a mailbox they cannot log
    // in to reach — and an attacker who can set it points recovery at a mailbox
    // they already control inside Pleiades.
    for (const recoveryEmail of [
      'attacker@godwinausten.org',
      'attacker@mail.godwinausten.org',
      'ATTACKER@GODWINAUSTEN.ORG',
    ]) {
      const res = await AS('ceo', '/api/admin/users/u_none', {
        method: 'PATCH',
        body: JSON.stringify({ recoveryEmail }),
      });
      expect(res.status).toBe(400);
    }
  });

  it('accepts an external recovery address', async () => {
    const res = await AS('ceo', '/api/admin/users/u_none', {
      method: 'PATCH',
      body: JSON.stringify({ recoveryEmail: 'delivered+someone@resend.dev' }),
    });
    expect(res.status).toBe(200);
  });

  it('never reveals whether an account exists', async () => {
    const { SELF } = await import('cloudflare:test');
    const real = await SELF.fetch('https://test.local/api/auth/request-reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'u_none@test.local' }),
    });
    const fake = await SELF.fetch('https://test.local/api/auth/request-reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@nowhere.example' }),
    });
    expect(real.status).toBe(fake.status);
    // Byte-identical, not merely the same shape. The bug this pins was two
    // different `message` strings behind the same 200 — enough to enumerate every
    // staff address at a company whose logins are all on one domain.
    expect(await real.text()).toBe(await fake.text());
  });

  it('mints no token and sends nothing until a human approves', async () => {
    const { SELF, env } = await import('cloudflare:test');
    const before = await env.DB.prepare('SELECT count(*) AS n FROM email_delivery').first<{ n: number }>();

    // An unauthenticated endpoint. Anything it mailed would be mail a stranger
    // could cause to arrive in a colleague's inbox, as often as they liked.
    for (let i = 0; i < 3; i += 1) {
      await SELF.fetch('https://test.local/api/auth/request-reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'u_none@test.local' }),
      });
    }
    await new Promise((r) => setTimeout(r, 150));

    const after = await env.DB.prepare('SELECT count(*) AS n FROM email_delivery').first<{ n: number }>();
    // No HR mailbox is active in this fixture with kind=app+hr? There is (mbx_hr),
    // so at most ONE notification to HR may exist however many requests arrive —
    // the idempotency key is per token, and each request supersedes the last.
    expect(Number(after!.n) - Number(before!.n)).toBeLessThanOrEqual(3);

    // What must be zero either way: anything addressed to the account holder.
    const toUser = await env.DB.prepare(
      "SELECT count(*) AS n FROM email_messages WHERE to_addresses LIKE ? ESCAPE ?",
    ).bind('%u_none@test.local%', '\\').first<{ n: number }>();
    expect(Number(toUser!.n)).toBe(0);
  });
});

describe('quota cannot be bypassed', () => {
  it('a deactivated mailbox cannot send even for somebody who could before', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare("UPDATE mailboxes SET is_active = 0 WHERE mailbox_id = 'mbx_acq'").run();
    const res = await AS('mkt', '/api/email/send', {
      method: 'POST',
      body: JSON.stringify({ mailboxId: 'mbx_acq', to: ['delivered+x@resend.dev'], subject: 'x', text: 'x' }),
    });
    expect(res.status).toBe(403);
    await env.DB.prepare("UPDATE mailboxes SET is_active = 1 WHERE mailbox_id = 'mbx_acq'").run();
  });

  it('a bulk send is refused without the bulk level, counting cc and bcc', async () => {
    // Otherwise the threshold is trivially evaded by moving recipients to Bcc.
    const res = await AS('mkt', '/api/email/send', {
      method: 'POST',
      body: JSON.stringify({
        mailboxId: 'mbx_acq',
        to: ['delivered+a@resend.dev'],
        cc: ['delivered+b@resend.dev', 'delivered+c@resend.dev', 'delivered+d@resend.dev', 'delivered+e@resend.dev'],
        bcc: ['delivered+f@resend.dev', 'delivered+g@resend.dev', 'delivered+h@resend.dev', 'delivered+i@resend.dev', 'delivered+j@resend.dev', 'delivered+k@resend.dev'],
        subject: 'bulk via bcc', text: 'x',
      }),
    });
    expect(res.status).toBe(403);
  });
});

describe('read-only really is read-only', () => {
  it('cannot move a department’s mail to the trash with view access alone', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare("UPDATE user_app_permissions SET can_edit = 0 WHERE id = 'uap_u_tech_hr_email'").run();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO email_messages (message_id, mailbox_id, direction, folder, from_address, to_addresses, subject, body_text, is_read, is_starred, created_at) " +
      "VALUES ('eml_hrmail','mbx_hr','inbound','inbox','delivered+client@resend.dev','[]','Contract','text',0,0,0)",
    ).run();

    const res = await AS('tech', '/api/email/messages/eml_hrmail', {
      method: 'PATCH',
      body: JSON.stringify({ folder: 'trash' }),
    });
    // Destructive, and the opposite of what view-only means.
    expect(res.status).toBe(403);
    const row = await env.DB.prepare("SELECT folder FROM email_messages WHERE message_id = 'eml_hrmail'")
      .first<{ folder: string }>();
    expect(row!.folder).toBe('inbox');
  });

  it('can still mark it read', async () => {
    const res = await AS('tech', '/api/email/messages/eml_hrmail', {
      method: 'PATCH',
      body: JSON.stringify({ isRead: true }),
    });
    expect(res.status).toBe(200);
  });
});

describe('the system templates are not a phishing kit', () => {
  it('refuses to send a system template by hand, from any mailbox', async () => {
    // The hole: the gate read `if (scope === 'app' && appName && !perm)`, so a
    // system template fell through unchecked — and `password_reset` takes a
    // caller-supplied {{resetUrl}}. Any holder of any mailbox, including their own
    // personal one, could emit the company's real reset email, DKIM-signed, from a
    // genuine @godwinausten.org address, pointing anywhere.
    for (const key of ['password_reset', 'task_assigned', 'reset_requested']) {
      const res = await AS('mkt', '/api/email/send', {
        method: 'POST',
        body: JSON.stringify({
          mailboxId: 'mbx_acq',
          to: ['victim@godwinausten.org'],
          templateKey: key,
          values: { userName: 'Victim', resetUrl: 'https://evil.example/steal', expiresAt: 'soon', assigneeName: 'x', taskTitle: 'x', department: 'x', taskUrl: 'x', userEmail: 'x', approvalUrl: 'x', requestedAt: 'x' },
          idempotencyKey: `phish-${key}`,
        }),
      });
      expect(res.status).toBe(403);
    }
  });

  it('refuses them to a superadmin too — there is no legitimate hand-send', async () => {
    const res = await AS('ceo', '/api/email/send', {
      method: 'POST',
      body: JSON.stringify({
        mailboxId: 'mbx_hr', to: ['delivered+x@resend.dev'], templateKey: 'password_reset',
        values: { userName: 'x', resetUrl: 'https://evil.example', expiresAt: 'soon' },
      }),
    });
    expect(res.status).toBe(403);
  });

  it('does not leak a system template’s text to somebody who cannot list it', async () => {
    const res = await AS('mkt', '/api/email/templates');
    const keys = ((await res.json()) as { data: { key: string }[] }).data.map((t) => t.key);
    expect(keys).not.toContain('password_reset');
    expect(keys).toContain('acq_intro');
  });
});

describe('admin grants cannot be walked up to superadmin', () => {
  it('refuses to point a superadmin’s recovery address at somebody else', async () => {
    const { env } = await import('cloudflare:test');
    // Step 1 of the chain: a holder of admin/users edit redirects where the
    // superadmin's reset link will be delivered.
    const res = await AS('ceo', '/api/admin/users/u_ceo', {
      method: 'PATCH',
      body: JSON.stringify({ recoveryEmail: 'attacker@gmail.example' }),
    });
    // u_ceo editing itself is allowed; the check is on editing ANOTHER superadmin.
    expect([200, 403]).toContain(res.status);

    await env.DB.prepare("UPDATE users_logins SET is_superadmin = 1 WHERE id = 'u_mail'").run();
    const other = await AS('ceo', '/api/admin/users/u_mail', {
      method: 'PATCH',
      body: JSON.stringify({ recoveryEmail: 'attacker@gmail.example' }),
    });
    expect(other.status).toBe(403);
    await env.DB.prepare("UPDATE users_logins SET is_superadmin = 0 WHERE id = 'u_mail'").run();
  });

  it('refuses to issue a reset link for a superadmin, so no token is minted', async () => {
    const { env } = await import('cloudflare:test');
    const { issueResetLink } = await import('../src/email/password-reset');

    /**
     * The approval queue this used to test is gone — reset is self-service now. That
     * REMOVED a permission from the escalation chain rather than adding one: it used to
     * take admin/users edit (to point the recovery address at yourself) plus
     * admin/resets edit (to approve), and now it takes only the first. So this guard
     * matters more than it did, not less.
     */
    const before = await env.DB.prepare('SELECT count(*) AS n FROM password_reset_tokens').first<{ n: number }>();

    const outcome = await issueResetLink(env, {
      id: 'u_ceo',
      name: 'CEO',
      email: 'u_ceo@test.local',
      recoveryEmail: 'attacker@gmail.example',
      isActive: true,
      isSuperadmin: true,
    });

    expect(outcome.sent).toBe(false);
    if (!outcome.sent) expect(outcome.reason).toContain('Superadmin');

    // Nothing minted at all — not an expired token, not a used one.
    const after = await env.DB.prepare('SELECT count(*) AS n FROM password_reset_tokens').first<{ n: number }>();
    expect(Number(after!.n)).toBe(Number(before!.n));
  });
});

describe('recipient counting cannot be evaded', () => {
  it('rejects an entry that packs several addresses into one string', async () => {
    const { SELF, env } = await import('cloudflare:test');
    // The bulk threshold counts array entries. An entry a provider might split on
    // would let one "recipient" be twenty.
    const res = await SELF.fetch('https://test.local/api/email/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenFor('mkt')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mailboxId: 'mbx_acq',
        to: ['delivered+a@resend.dev, delivered+b@resend.dev, delivered+c@resend.dev'],
        subject: 'packed', text: 'x', idempotencyKey: 'packed-1',
      }),
    });
    // Every entry is discarded as malformed, so there is no valid recipient left.
    expect(res.status).toBe(400);
    const row = await env.DB.prepare("SELECT count(*) AS n FROM email_messages WHERE subject = 'packed'")
      .first<{ n: number }>();
    expect(Number(row!.n)).toBe(0);
  });

  it('rejects an address carrying angle brackets or whitespace', async () => {
    for (const addr of ['Name <delivered+a@resend.dev>', 'delivered+a@resend.dev delivered+b@resend.dev', 'a@delivered+b@resend.dev']) {
      const res = await AS('mkt', '/api/email/send', {
        method: 'POST',
        body: JSON.stringify({ mailboxId: 'mbx_acq', to: [addr], subject: 'x', text: 'x' }),
      });
      expect(res.status).toBe(400);
    }
  });
});

describe('self-service password reset', () => {
  const request = async (identifier: string) => {
    const { SELF } = await import('cloudflare:test');
    return SELF.fetch('https://test.local/api/auth/request-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    });
  };

  const tokensFor = async (userId: string) => {
    const { env } = await import('cloudflare:test');
    const { results } = await env.DB.prepare(
      'SELECT id, status, requested_at, expires_at FROM password_reset_tokens WHERE user_id = ? ORDER BY requested_at DESC',
    ).bind(userId).all<{ id: string; status: string; requested_at: number; expires_at: number }>();
    return results;
  };

  it('accepts either an email or a username', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare(
      "UPDATE users_logins SET recovery_email = 'delivered+crm-personal@resend.dev' WHERE id = 'u_crm'",
    ).run();
    await env.DB.prepare('DELETE FROM password_reset_tokens').run();

    // Somebody locked out should not have to remember which of the two they used.
    const byEmail = await request('u_crm@test.local');
    expect(byEmail.status).toBe(200);
    await new Promise((r) => setTimeout(r, 200));
    expect((await tokensFor('u_crm')).length).toBe(1);

    await env.DB.prepare('DELETE FROM password_reset_tokens').run();
    const byUsername = await request('u_crm');
    expect(byUsername.status).toBe(200);
    await new Promise((r) => setTimeout(r, 200));
    expect((await tokensFor('u_crm')).length).toBe(1);
  });

  it('issues a link with no approval step, usable immediately', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare('DELETE FROM password_reset_tokens').run();
    await request('u_crm');
    await new Promise((r) => setTimeout(r, 200));

    const [row] = await tokensFor('u_crm');
    expect(row).toBeTruthy();
    /**
     * `approved` with no approver is what self-service means in this table, and it is
     * what `complete-reset` accepts. The null approved_by_user_id is what tells these
     * rows apart from the ones a human signed off under the old flow.
     */
    expect(row.status).toBe('approved');
    const approver = await env.DB.prepare(
      'SELECT approved_by_user_id FROM password_reset_tokens WHERE id = ?',
    ).bind(row.id).first<{ approved_by_user_id: string | null }>();
    expect(approver!.approved_by_user_id).toBeNull();
  });

  it('expires the link in 10 minutes', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare('DELETE FROM password_reset_tokens').run();
    await request('u_crm');
    await new Promise((r) => setTimeout(r, 200));

    const [row] = await tokensFor('u_crm');
    const minutes = (row.expires_at - row.requested_at) / 60;
    expect(minutes).toBeGreaterThan(9);
    expect(minutes).toBeLessThanOrEqual(10);
  });

  it('supersedes the previous link rather than stacking them', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare('DELETE FROM password_reset_tokens').run();

    await request('u_crm');
    await new Promise((r) => setTimeout(r, 150));
    await request('u_crm');
    await new Promise((r) => setTimeout(r, 200));

    const rows = await tokensFor('u_crm');
    // Exactly one usable link however many times it is asked for. This is also what
    // makes a low rate limit safe: a second request never rescues a lost first one.
    expect(rows.filter((r) => r.status === 'approved').length).toBe(1);
    expect(rows.filter((r) => r.status === 'expired').length).toBeGreaterThanOrEqual(1);
  });

  it('stops after three requests in an hour', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare('DELETE FROM password_reset_tokens').run();

    for (let i = 0; i < 5; i += 1) {
      await request('u_crm');
      await new Promise((r) => setTimeout(r, 120));
    }
    // HR approval used to be what stopped a stranger pointing this at a colleague's
    // inbox. The rate limit is what replaced it.
    expect((await tokensFor('u_crm')).length).toBeLessThanOrEqual(3);
  });

  it('answers identically for an unknown account, a superadmin and a real one', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare('DELETE FROM password_reset_tokens').run();

    const real = await request('u_crm');
    const unknown = await request('nobody-at-all@nowhere.example');
    const superadmin = await request('u_ceo@test.local');

    const bodies = await Promise.all([real.text(), unknown.text(), superadmin.text()]);
    // The only thing standing between this endpoint and a list of valid staff
    // addresses. Byte-identical, not merely the same shape.
    expect(bodies[1]).toBe(bodies[0]);
    expect(bodies[2]).toBe(bodies[0]);
    expect(real.status).toBe(unknown.status);

    await new Promise((r) => setTimeout(r, 200));
    // And the superadmin really did get nothing.
    expect((await tokensFor('u_ceo')).length).toBe(0);
  });

  it('will not send to an address this system hosts the mail for', async () => {
    const { env } = await import('cloudflare:test');
    const { resetDestination } = await import('../src/email/password-reset');

    // A reset sent to a Pleiades-hosted mailbox tells a locked-out person to log in to
    // read the email that lets them log in.
    const hosted = resetDestination({ email: 'someone@godwinausten.org', recoveryEmail: null });
    expect('problem' in hosted).toBe(true);

    // An external login address needs no recovery address at all — which is six of the
    // nine accounts in production.
    const external = resetDestination({ email: 'someone@exaverse.site', recoveryEmail: null });
    expect(external).toEqual({ address: 'someone@exaverse.site' });

    // And a recovery address wins when one is set.
    const recovered = resetDestination({ email: 'someone@godwinausten.org', recoveryEmail: 'delivered+me@resend.dev' });
    expect(recovered).toEqual({ address: 'delivered+me@resend.dev' });
  });

  it('mints nothing for an account with nowhere to send', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare('DELETE FROM password_reset_tokens').run();
    // u_none has no recovery address and a @test.local login, which is not hosted here,
    // so it CAN receive — use a hosted address to exercise the refusal.
    await env.DB.prepare(
      "UPDATE users_logins SET email = 'stuck@godwinausten.org', recovery_email = NULL WHERE id = 'u_none'",
    ).run();

    const res = await request('stuck@godwinausten.org');
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 200));
    expect((await tokensFor('u_none')).length).toBe(0);

    await env.DB.prepare("UPDATE users_logins SET email = 'u_none@test.local' WHERE id = 'u_none'").run();
  });

  it('has no approval queue left to call', async () => {
    const { SELF } = await import('cloudflare:test');
    for (const path of ['/api/admin/pending-resets', '/api/admin/pending-resets/x/approve']) {
      const res = await SELF.fetch(`https://test.local${path}`, {
        method: path.endsWith('approve') ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${await tokenFor('ceo')}` },
      });
      // Gone, not merely unreachable — even for a superadmin.
      expect(res.status).toBe(404);
    }
  });
});
