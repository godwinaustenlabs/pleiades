import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { resetDatabase, reseed, tokenFor } from './helpers';

/**
 * Deleting a post, and deleting a person.
 *
 * The property under test is that the impact REPORT and the CASCADE agree. A warning
 * screen that under-reports is worse than no warning at all, because somebody
 * confirms a deletion believing it is smaller than it is — so each assertion below
 * reads the report first and then checks the database matches what it promised.
 *
 * The other half is the three fates. `delete` for records that describe nothing but
 * the relationship, `release` for somebody else's record that merely names this
 * person, `detach` for a mailbox. Getting `release` wrong is how a laptop stops
 * existing because its holder resigned.
 */

const as = (user: 'ceo' | 'dual' | 'hold' | 'none') => tokenFor(user);

async function api(method: string, path: string, user: 'ceo' | 'dual' | 'hold' | 'none' = 'ceo'): Promise<Response> {
  return SELF.fetch(`https://test.local${path}`, {
    method,
    headers: { Authorization: `Bearer ${await as(user)}`, 'Content-Type': 'application/json' },
  });
}

async function json(res: Response): Promise<any> {
  return res.json();
}

const count = async (sql: string, ...binds: unknown[]): Promise<number> => {
  const row = await env.DB.prepare(sql).bind(...binds).first<{ n: number }>();
  return row?.n ?? 0;
};

/** Gives emp_dual something in every fate, so one delete exercises all three. */
async function furnish(): Promise<void> {
  await env.DB.batch([
    // A task addressed to the post, with an assignment and an attachment.
    env.DB.prepare("INSERT INTO universal_tasks (task_id,title,status,department,appointment_id,created_at,updated_at) VALUES ('t_post','Post work','todo','Tech','ap_pm',0,0)"),
    env.DB.prepare("INSERT INTO task_assignments (assignment_id,task_id,employee_id,assigned_at) VALUES ('as_1','t_post','emp_dual',0)"),
    env.DB.prepare("INSERT INTO task_attachments (id,task_id,title,r2_key,created_at) VALUES ('att_1','t_post','spec.pdf','company-docs/spec.pdf',0)"),
    // A task that is NOT the post's, to prove the cascade is scoped.
    env.DB.prepare("INSERT INTO universal_tasks (task_id,title,status,department,created_at,updated_at) VALUES ('t_dept','Department work','todo','Tech',0,0)"),
    env.DB.prepare("INSERT INTO task_assignments (assignment_id,task_id,employee_id,assigned_at) VALUES ('as_2','t_dept','emp_dual',0)"),
    // An asset in their custody, to be RELEASED rather than destroyed.
    env.DB.prepare("INSERT INTO assets (id,asset_name,asset_type,assigned_to,status,purchase_cost,created_at) VALUES ('ast_1','MacBook Pro','Laptop','emp_dual','Assigned',400000,0)"),
    // Personal documents, to be downloaded and then destroyed.
    env.DB.prepare("INSERT INTO employee_documents (id,employee_id,document_type,url,upload_date,created_at) VALUES ('ed_1','emp_dual','CNIC','/api/assets/download/employee-docs/cnic.pdf','2026-01-01',0)"),
    env.DB.prepare("INSERT INTO employee_documents (id,employee_id,document_type,url,upload_date,created_at) VALUES ('ed_2','emp_dual','Contract','employee-docs/contract.pdf','2026-01-01',0)"),
    // HR history.
    env.DB.prepare("INSERT INTO attendance (id,employee_id,date,status,created_at) VALUES ('at_1','emp_dual','2026-09-01','Present',0)"),
    env.DB.prepare("INSERT INTO payroll_records (payroll_id,employee_id,payroll_month,net_pay,finance_reference,created_at) VALUES ('pr_1','emp_dual','2026-08',150000,'txn_9',0)"),
    env.DB.prepare("INSERT INTO loans (id,employee_id,original_amount,remaining_balance,monthly_installment,start_date,status,created_at) VALUES ('ln_1','emp_dual',100000,60000,10000,'2026-01-01','Active',0)"),
    // Somebody ELSE's record that merely names them. Both must survive.
    env.DB.prepare("INSERT INTO performance_reviews (id,employee_id,review_period,reviewer_id,score,created_at) VALUES ('rv_1','emp_hold','Q1 2026','emp_dual',4.5,0)"),
    env.DB.prepare("INSERT INTO labs (lab_id,lab_name,ops_lead_id,created_at,updated_at) VALUES ('lab_1','Aureline','emp_dual',0,0)"),
  ]);
}

beforeAll(async () => {
  await resetDatabase();
});

describe('the impact report for a post', () => {
  beforeEach(async () => {
    await reseed();
    await furnish();
  });

  it('names what goes, what is let go of, and what is kept', async () => {
    const { data } = await json(await api('GET', '/api/appointments/ap_pm/impact'));
    expect(data.label).toBe('PM Aureline');
    expect(data.blockers).toEqual([]);

    const byLabel = Object.fromEntries(data.items.map((i: any) => [i.label, i]));
    expect(byLabel['Permissions this post grants'].fate).toBe('delete');
    expect(byLabel['Tasks addressed to this post']).toMatchObject({ count: 1, fate: 'delete' });
    // The mailbox is the one thing that is kept rather than deleted: it holds
    // received mail, which is the only part of this that cannot be rebuilt.
    expect(byLabel['Mailbox attached to this post']).toMatchObject({ count: 1, fate: 'detach' });
  });

  it('offers every file it is about to destroy as a download', async () => {
    const { data } = await json(await api('GET', '/api/appointments/ap_pm/impact'));
    const urls = data.downloads.map((d: any) => d.url);
    expect(urls).toContain('/api/assets/download/company-docs/spec.pdf');
    // And an mbox export of the mailbox, since it is about to be switched off.
    expect(urls.some((u: string) => u.includes('/api/email/export?mailboxId=mbx_cto'))).toBe(true);
  });

  it('is refused to somebody who cannot delete the post', async () => {
    expect((await api('GET', '/api/appointments/ap_pm/impact', 'dual')).status).toBe(403);
  });
});

describe('deleting a post', () => {
  beforeEach(async () => {
    await reseed();
    await furnish();
  });

  it('refuses without ?cascade=1, and says what is in the way', async () => {
    const res = await api('DELETE', '/api/appointments/ap_pm');
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toContain('1 tasks addressed to this post');
    expect(body.error).toContain('cascade=1');
    // And nothing happened.
    expect(await count('SELECT COUNT(*) n FROM appointments WHERE appointment_id = ?', 'ap_pm')).toBe(1);
  });

  it('with ?cascade=1 removes the post and exactly what the report listed', async () => {
    const res = await api('DELETE', '/api/appointments/ap_pm?cascade=1');
    expect(res.status).toBe(200);
    expect((await json(res)).data.summary).toMatchObject({ tasks: 1, taskAttachments: 1, mailboxesDetached: 1 });

    expect(await count('SELECT COUNT(*) n FROM appointments WHERE appointment_id = ?', 'ap_pm')).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM appointment_app_permissions WHERE appointment_id = ?', 'ap_pm')).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM universal_tasks WHERE task_id = ?', 't_post')).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM task_assignments WHERE task_id = ?', 't_post')).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM task_attachments WHERE task_id = ?', 't_post')).toBe(0);
  });

  it('leaves the department’s own task alone', async () => {
    await api('DELETE', '/api/appointments/ap_pm?cascade=1');
    expect(await count('SELECT COUNT(*) n FROM universal_tasks WHERE task_id = ?', 't_dept')).toBe(1);
    expect(await count('SELECT COUNT(*) n FROM task_assignments WHERE task_id = ?', 't_dept')).toBe(1);
  });

  it('keeps the mailbox and its mail, switched off and readable by an administrator', async () => {
    await api('DELETE', '/api/appointments/ap_pm?cascade=1');
    const box = await env.DB.prepare('SELECT is_active, appointment_id FROM mailboxes WHERE mailbox_id = ?').bind('mbx_cto').first();
    expect(box).toBeTruthy();
    expect(box?.is_active).toBe(0);
    expect(box?.appointment_id).toBeNull();

    // Reachable by whoever administers mailboxes, exactly as a vacant post's is —
    // otherwise deleting a post would make its correspondence unreadable forever.
    const res = await SELF.fetch('https://test.local/api/email/mailboxes/mbx_cto/messages', {
      headers: { Authorization: `Bearer ${await tokenFor('mailAdmin')}` },
    });
    expect(res.status).toBe(200);
  });

  it('never touches the holder’s login', async () => {
    await api('DELETE', '/api/appointments/ap_pm?cascade=1');
    const login = await env.DB.prepare('SELECT is_active FROM users_logins WHERE id = ?').bind('u_dual').first();
    expect(login?.is_active).toBe(1);
    // And their OTHER post still grants what it granted.
    const res = await SELF.fetch('https://test.local/api/acquisition/campaigns', {
      headers: { Authorization: `Bearer ${await tokenFor('dual')}` },
    });
    expect(res.status).not.toBe(403);
  });
});

describe('the impact report for a person', () => {
  beforeEach(async () => {
    await reseed();
    await furnish();
  });

  it('nests a report per post they hold, so the total is inspectable', async () => {
    const { data } = await json(await api('GET', '/api/core/employees/emp_dual/impact'));
    expect(data.label).toBe('Dual Holder');
    expect(data.appointments.map((a: any) => a.label).sort()).toEqual(['CMO', 'Committee Chair', 'Former Treasurer', 'PM Aureline']);
  });

  it('separates delete from release, which is the distinction that matters', async () => {
    const { data } = await json(await api('GET', '/api/core/employees/emp_dual/impact'));
    const byLabel = Object.fromEntries(data.items.map((i: any) => [i.label, i]));

    // Released: not destroyed because its holder left.
    expect(byLabel['Assets in their custody']).toMatchObject({ count: 1, fate: 'release' });
    expect(byLabel['Assets in their custody'].examples[0]).toContain('MacBook Pro');
    // Kept, name cleared: the review is the colleague's history, and the lab is the company's.
    expect(byLabel['Places they are named on somebody else’s record'].fate).toBe('release');
    // Deleted: describes nothing but this person.
    expect(byLabel['Their HR history'].fate).toBe('delete');
    expect(byLabel['Their login']).toMatchObject({ count: 1, fate: 'delete' });
    expect(byLabel['The audit log'].fate).toBe('keep');
  });

  it('warns that a deleted payslip leaves its finance transaction behind', async () => {
    const { data } = await json(await api('GET', '/api/core/employees/emp_dual/impact'));
    const payroll = data.items.find((i: any) => i.label === 'Payroll records');
    expect(payroll.count).toBe(1);
    expect(payroll.note).toContain('1 of them name a finance transaction');
  });

  it('warns that deleting a record does not settle an outstanding loan', async () => {
    const { data } = await json(await api('GET', '/api/core/employees/emp_dual/impact'));
    expect(data.items.find((i: any) => i.label === 'Loans').note).toContain('does not settle the debt');
  });

  it('carries a download link for every personal document, however the url was stored', async () => {
    const { data } = await json(await api('GET', '/api/core/employees/emp_dual/impact'));
    const urls = data.downloads.map((d: any) => d.url);
    // One was stored as a full download path, the other as a bare R2 key. Both have
    // to come out as something a browser can fetch, or the wizard's one-click
    // download quietly misses files that are about to be destroyed.
    expect(urls).toContain('/api/assets/download/employee-docs/cnic.pdf');
    expect(urls).toContain('/api/assets/download/employee-docs/contract.pdf');
  });
});

describe('deleting a person', () => {
  beforeEach(async () => {
    await reseed();
    await furnish();
  });

  it('refuses without ?cascade=1', async () => {
    const res = await api('DELETE', '/api/core/employees/emp_dual');
    expect(res.status).toBe(409);
    expect((await json(res)).error).toContain('impact');
    expect(await count('SELECT COUNT(*) n FROM employees WHERE employee_id = ?', 'emp_dual')).toBe(1);
  });

  it('with ?cascade=1 removes them, their posts and their login in one go', async () => {
    const res = await api('DELETE', '/api/core/employees/emp_dual?cascade=1');
    expect(res.status).toBe(200);
    expect((await json(res)).data.summary).toMatchObject({ appointments: 4, login: 1 });

    expect(await count('SELECT COUNT(*) n FROM employees WHERE employee_id = ?', 'emp_dual')).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM users_logins WHERE id = ?', 'u_dual')).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM appointments WHERE employee_id = ?', 'emp_dual')).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM user_app_permissions WHERE user_id = ?', 'u_dual')).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM attendance WHERE employee_id = ?', 'emp_dual')).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM payroll_records WHERE employee_id = ?', 'emp_dual')).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM employee_documents WHERE employee_id = ?', 'emp_dual')).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM task_assignments WHERE employee_id = ?', 'emp_dual')).toBe(0);
  });

  it('releases the asset instead of destroying it', async () => {
    await api('DELETE', '/api/core/employees/emp_dual?cascade=1');
    const asset = await env.DB.prepare('SELECT assigned_to, status, purchase_cost FROM assets WHERE id = ?').bind('ast_1').first();
    expect(asset).toBeTruthy();
    expect(asset?.assigned_to).toBeNull();
    expect(asset?.status).toBe('Available');
    // The register keeps what it is worth; only custody changed.
    expect(asset?.purchase_cost).toBe(400000);
  });

  it('keeps other people’s records and only clears the name on them', async () => {
    await api('DELETE', '/api/core/employees/emp_dual?cascade=1');
    const review = await env.DB.prepare('SELECT employee_id, reviewer_id, score FROM performance_reviews WHERE id = ?').bind('rv_1').first();
    expect(review?.employee_id).toBe('emp_hold');
    expect(review?.reviewer_id).toBeNull();
    expect(review?.score).toBe(4.5);

    const lab = await env.DB.prepare('SELECT lab_name, ops_lead_id FROM labs WHERE lab_id = ?').bind('lab_1').first();
    expect(lab?.lab_name).toBe('Aureline');
    expect(lab?.ops_lead_id).toBeNull();
  });

  it('keeps their personal mailbox, switched off, rather than destroying received mail', async () => {
    await api('DELETE', '/api/core/employees/emp_dual?cascade=1');
    const box = await env.DB.prepare('SELECT is_active, owner_user_id FROM mailboxes WHERE mailbox_id = ?').bind('mbx_dual').first();
    expect(box).toBeTruthy();
    expect(box?.is_active).toBe(0);
    expect(box?.owner_user_id).toBeNull();
  });

  it('leaves the audit log alone, including the entry for this deletion', async () => {
    await api('DELETE', '/api/core/employees/emp_dual?cascade=1');
    const n = await count("SELECT COUNT(*) n FROM audit_logs WHERE table_name = 'employees' AND record_id = ?", 'emp_dual');
    expect(n).toBeGreaterThan(0);
  });

  it('cannot sign in afterwards', async () => {
    await api('DELETE', '/api/core/employees/emp_dual?cascade=1');
    const res = await SELF.fetch('https://test.local/api/permissions/me', {
      headers: { Authorization: `Bearer ${await tokenFor('dual')}` },
    });
    // authMiddleware reads users_logins per request, so the token they already hold
    // stops working at once rather than at expiry.
    expect(res.status).toBe(401);
  });
});

describe('refusals that are not warnings', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('refuses a superadmin’s record outright', async () => {
    await env.DB.prepare("UPDATE users_logins SET employee_id = 'emp_hold' WHERE id = 'u_hold'").run();
    await env.DB.prepare("UPDATE users_logins SET is_superadmin = 1 WHERE id = 'u_hold'").run();

    const report = await json(await api('GET', '/api/core/employees/emp_hold/impact'));
    expect(report.data.blockers.join(' ')).toContain('superadmin');

    const res = await api('DELETE', '/api/core/employees/emp_hold?cascade=1');
    expect(res.status).toBe(403);
    expect(await count('SELECT COUNT(*) n FROM employees WHERE employee_id = ?', 'emp_hold')).toBe(1);
  });

  it('refuses your own record, which would sign you out mid-cascade', async () => {
    // Order matters: employee_id is unique, so u_dual has to let go of emp_dual
    // before u_ceo can take it.
    await env.DB.prepare("UPDATE users_logins SET employee_id = NULL WHERE id = 'u_dual'").run();
    await env.DB.prepare("UPDATE users_logins SET employee_id = 'emp_dual' WHERE id = 'u_ceo'").run();

    const res = await api('DELETE', '/api/core/employees/emp_dual?cascade=1');
    expect(res.status).toBe(403);
    expect((await json(res)).error).toContain('your own record');
  });

  it('needs admin/users delete on top of core/employees delete to remove a login', async () => {
    // Otherwise the weaker grant quietly becomes the ability to delete accounts.
    await env.DB.prepare("DELETE FROM user_app_permissions WHERE user_id = 'u_dual'").run();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('x1','u_dual','core','employees',1,1,1,0,0)"),
    ]);
    const report = await json(await api('GET', '/api/core/employees/emp_hold/impact', 'dual'));
    expect(report.data.blockers.join(' ')).toContain('admin/users delete');

    const res = await api('DELETE', '/api/core/employees/emp_hold?cascade=1', 'dual');
    expect(res.status).toBe(403);
    expect(await count('SELECT COUNT(*) n FROM users_logins WHERE id = ?', 'u_hold')).toBe(1);
  });
});
