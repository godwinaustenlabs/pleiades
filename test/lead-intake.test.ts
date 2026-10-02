import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { resetDatabase, reseed, tokenFor, type FixtureUser } from './helpers';

/**
 * Leads captured by the marketing site, arriving as leads in Acquisition.
 *
 * The website used to validate an email, serve the PDF and throw the address
 * away — it logged the DOMAIN only, deliberately, because there was nowhere to
 * put the rest. This is the somewhere.
 *
 * Three properties, and they are the reason this is not just `POST /contacts`:
 *
 *  - **A narrow payload.** `POST /contacts` spreads the whole body into the
 *    insert, which would let an external caller set `leadScore`,
 *    `contactOwner` or `pipelineStage`. This takes an email and a source label.
 *  - **Idempotence.** Downloading the guide twice is one lead and two activity
 *    rows, not two leads.
 *  - **Provenance.** The lead says it came from the lead magnet, in
 *    `lead_source` and on the activity trail, because that is the fact that
 *    makes it worth calling.
 */

const INTAKE = 'https://test.local/api/acquisition/contacts/intake';

async function post(user: FixtureUser, body: unknown): Promise<Response> {
  return SELF.fetch(INTAKE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tokenFor(user)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const leads = async () =>
  (await env.DB.prepare('SELECT * FROM contacts_leads ORDER BY created_at').all()).results as any[];

const activity = async () =>
  (await env.DB.prepare('SELECT * FROM leads_activity ORDER BY created_at').all()).results as any[];

beforeAll(async () => {
  await resetDatabase();
});

describe('capturing a lead from the site', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('creates a lead that says where it came from', async () => {
    const res = await post('ceo', {
      email: 'Owner@Acme.co',
      source: 'Lead magnet — Get Your Week Back',
    });
    expect(res.status).toBe(201);
    expect((await res.json() as any).data.created).toBe(true);

    const [lead] = await leads();
    // Lower-cased on the way in, so the same person typing it two ways is one lead.
    expect(lead.email).toBe('owner@acme.co');
    expect(lead.lead_source).toBe('Lead magnet — Get Your Week Back');
    expect(lead.pipeline_stage).toBe('new');
  });

  it('records the capture on the activity trail, not only in a log line', async () => {
    await post('ceo', { email: 'owner@acme.co', source: 'Lead magnet — Get Your Week Back' });

    const [act] = await activity();
    expect(act.activity_type).toBe('lead_magnet_download');
    expect(act.notes).toContain('Get Your Week Back');
    expect(act.automation_trigger).toBe(1);
  });

  it('does not invent a human name it was never told', async () => {
    // `full_name` is NOT NULL, so something has to go there. Turning
    // `john.smith@acme.co` into "John Smith" is a guess that reads as a fact and
    // is wrong for every info@, hello@ and name-that-is-not-a-name.
    await post('ceo', { email: 'john.smith@acme.co' });
    const [lead] = await leads();
    expect(lead.full_name).toBe('john.smith@acme.co');
  });

  it('uses a supplied name when the form actually collected one', async () => {
    await post('ceo', { email: 'owner@acme.co', name: 'Jane Owner' });
    expect((await leads())[0].full_name).toBe('Jane Owner');
  });

  it('takes the domain as the company, but not from a free provider', async () => {
    await post('ceo', { email: 'owner@acme.co' });
    expect((await leads())[0].company_name).toBe('acme.co');

    await post('ceo', { email: 'someone@gmail.com' });
    const gmail = (await leads()).find((l) => l.email === 'someone@gmail.com');
    // Nobody works at Gmail.
    expect(gmail.company_name).toBeNull();
  });

  it('defaults the source rather than leaving a lead with no provenance', async () => {
    await post('ceo', { email: 'owner@acme.co' });
    expect((await leads())[0].lead_source).toContain('lead magnet');
  });
});

describe('the same person downloading twice', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('is one lead and two activity rows', async () => {
    const first = await post('ceo', { email: 'owner@acme.co', source: 'Lead magnet — Playbook' });
    expect(first.status).toBe(201);

    const second = await post('ceo', { email: 'owner@acme.co', source: 'Lead magnet — Playbook' });
    expect(second.status).toBe(200);
    expect((await second.json() as any).data).toMatchObject({ created: false, repeat: true });

    expect(await leads()).toHaveLength(1);
    // The repeat interest is the useful part, so it is recorded.
    expect(await activity()).toHaveLength(2);
    expect((await activity())[1].notes).toContain('again');
  });

  it('does not reset work somebody has since done on the lead', async () => {
    await post('ceo', { email: 'owner@acme.co' });
    const [lead] = await leads();

    // Somebody picks it up: real name, an owner, a warmer stage.
    await env.DB.prepare(
      "UPDATE contacts_leads SET full_name = 'Jane Owner', contact_owner = 'emp_dual', pipeline_stage = 'qualified', lead_score = 80 WHERE contact_id = ?",
    ).bind(lead.contact_id).run();

    await post('ceo', { email: 'owner@acme.co' });

    const [after] = await leads();
    expect(after.full_name).toBe('Jane Owner');
    expect(after.pipeline_stage).toBe('qualified');
    expect(after.contact_owner).toBe('emp_dual');
    expect(after.lead_score).toBe(80);
  });
});

describe('what the site is not allowed to decide', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('ignores a pipeline stage, score or owner on the body', async () => {
    // `POST /contacts` spreads the body into the insert. An external caller
    // reaching that would be deciding how warm its own leads are, and who owns
    // them. This route derives all three.
    await post('ceo', {
      email: 'owner@acme.co',
      pipelineStage: 'closed_won',
      leadScore: 100,
      contactOwner: 'emp_dual',
      id: 'lead_chosen_by_caller',
    });

    const [lead] = await leads();
    expect(lead.pipeline_stage).toBe('new');
    expect(lead.lead_score).toBeNull();
    expect(lead.contact_owner).toBeNull();
    expect(lead.contact_id).not.toBe('lead_chosen_by_caller');
  });

  it('refuses something that is not an email', async () => {
    for (const email of ['', 'not-an-email', 'no@domain', 'two@@at.co', 'spa ce@acme.co', undefined]) {
      expect((await post('ceo', { email })).status, String(email)).toBe(400);
    }
    expect(await leads()).toHaveLength(0);
  });

  it('refuses an absurdly long address', async () => {
    expect((await post('ceo', { email: `${'a'.repeat(250)}@acme.co` })).status).toBe(400);
  });

  it('flattens a newline in the source, which would break a CSV export', async () => {
    await post('ceo', { email: 'owner@acme.co', source: 'Lead magnet\nInjected,row' });
    expect((await leads())[0].lead_source).toBe('Lead magnet Injected,row');
  });
});

describe('authorization', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('needs acquisition/contacts edit', async () => {
    // u_tech holds tech and crm. A website key leaking must not open the CRM.
    expect((await post('tech', { email: 'owner@acme.co' })).status).toBe(403);
    expect((await post('none', { email: 'owner@acme.co' })).status).toBe(403);
    expect(await leads()).toHaveLength(0);
  });

  it('is not reachable unauthenticated', async () => {
    // Deliberately not a second unauthenticated write: the Resend webhook is the
    // only one of those, and its signature is the whole authorization.
    const res = await SELF.fetch(INTAKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@acme.co' }),
    });
    expect(res.status).toBe(401);
  });

  it('works through an api key, which is how the site will call it', async () => {
    /**
     * The mechanism the site uses: `x-api-key` resolves to the `api_keys` row and
     * the login it acts as, and the route is then gated like any other. No new
     * trust domain, and the key inherits exactly that login's grants.
     */
    const raw = 'sk_website_test_key';
    const digest = [...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)),
    )].map((b) => b.toString(16).padStart(2, '0')).join('');

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users_logins (id,email,username,name,password_hash,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_site','site@test.local','site','Website','x',1,0,0,0)",
      ),
      env.DB.prepare(
        "INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_site','u_site','acquisition','contacts',1,1,0,0,0)",
      ),
      env.DB.prepare(
        'INSERT INTO api_keys (id,key_hash,owner_name,user_id,is_active,created_at) VALUES (?,?,?,?,1,0)',
      ).bind('ak_site', digest, 'Website lead intake', 'u_site'),
    ]);

    const res = await SELF.fetch(INTAKE, {
      method: 'POST',
      headers: { 'x-api-key': raw, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@acme.co', source: 'Lead magnet — Get Your Week Back' }),
    });
    expect(res.status).toBe(201);
    expect((await leads())[0].email).toBe('owner@acme.co');

    // And that key reaches nothing else: one grant, edit on contacts.
    const payroll = await SELF.fetch('https://test.local/api/hr/payroll', {
      headers: { 'x-api-key': raw },
    });
    expect(payroll.status).toBe(403);
  });
});
