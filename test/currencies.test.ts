import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { resetDatabase, reseed, tokenFor, type FixtureUser } from './helpers';

/**
 * The currency catalogue, and which currency is the company's own.
 *
 * `accounts.currency` was always stored and never read: every amount in the app
 * rendered a hardcoded `$`, so a database denominated entirely in PKR showed `$` in
 * the balance column and `PKR` in the column beside it. Reading the column fixes
 * accounts; `is_base` fixes everything that has no currency column at all — a
 * transaction, an invoice, a payslip, a line in the asset register.
 *
 * The read is open to ANY authenticated caller, and that is the point rather than an
 * oversight: a payslip is an HR screen and a deal is an Acquisition screen, and while
 * the catalogue sat behind `finance/accounts` neither could find out what a symbol
 * was. Writing stays gated.
 */

async function get(user: FixtureUser, path = ''): Promise<Response> {
  return SELF.fetch(`https://test.local/api/currencies${path}`, {
    headers: { Authorization: `Bearer ${await tokenFor(user)}` },
  });
}

async function send(user: FixtureUser, method: string, path: string, body?: unknown): Promise<Response> {
  return SELF.fetch(`https://test.local/api/currencies${path}`, {
    method,
    headers: { Authorization: `Bearer ${await tokenFor(user)}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const baseOf = async (): Promise<string | null> => {
  const row = await env.DB.prepare('SELECT code FROM currencies WHERE is_base = 1').first<{ code: string }>();
  return row?.code ?? null;
};

beforeAll(async () => {
  await resetDatabase();
});

describe('reading the catalogue', () => {
  it('is open to anyone signed in, whatever app they work in', async () => {
    // `none` holds no grants at all. Gating this is what left every HR and
    // Acquisition screen printing `$`, because they could not reach /api/finance/*.
    for (const user of ['none', 'tech', 'crm', 'mailAdmin'] as FixtureUser[]) {
      expect((await get(user)).status, user).toBe(200);
    }
  });

  it('still requires a token', async () => {
    expect((await SELF.fetch('https://test.local/api/currencies')).status).toBe(401);
  });

  it('says which currency is the company’s own', async () => {
    const { data } = await (await get('none')).json() as any;
    const base = data.filter((c: any) => c.isBase);
    // Exactly one, so no screen has to decide between two.
    expect(base).toHaveLength(1);
    expect(base[0].code).toBe('PKR');
    expect(base[0].symbol).toBe('Rs');
  });

  it('carries the symbol for each, and null where none was given', async () => {
    const { data } = await (await get('none')).json() as any;
    const bySymbol = Object.fromEntries(data.map((c: any) => [c.code, c.symbol]));
    expect(bySymbol.PKR).toBe('Rs');
    expect(bySymbol.USD).toBe('$');
    // The client falls back to the CODE for this one rather than borrowing a symbol,
    // so `AED 5,000` instead of `$ 5,000`.
    expect(bySymbol.AED).toBeNull();
  });
});

describe('exactly one base currency', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('is enforced by the database, not only by the route', async () => {
    // Two bases is a state where which symbol you get depends on row order.
    await expect(
      env.DB.prepare("UPDATE currencies SET is_base = 1 WHERE code = 'USD'").run(),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('moves on PUT /base, clearing the old one in the same breath', async () => {
    const res = await send('ceo', 'PUT', '/base', { code: 'USD' });
    expect(res.status).toBe(200);
    expect((await res.json() as any).data).toMatchObject({ code: 'USD', previousBase: 'PKR' });
    expect(await baseOf()).toBe('USD');
  });

  it('needs finance/accounts edit', async () => {
    // u_tech holds tech and crm only.
    expect((await send('tech', 'PUT', '/base', { code: 'USD' })).status).toBe(403);
    expect(await baseOf()).toBe('PKR');
  });

  it('refuses a code that is not in the catalogue', async () => {
    const res = await send('ceo', 'PUT', '/base', { code: 'ZAR' });
    expect(res.status).toBe(404);
    expect(await baseOf()).toBe('PKR');
  });

  it('refuses something that is not a currency code at all', async () => {
    expect((await send('ceo', 'PUT', '/base', { code: 'rupees' })).status).toBe(400);
  });

  it('is a no-op when it already is the base', async () => {
    const res = await send('ceo', 'PUT', '/base', { code: 'PKR' });
    expect(res.status).toBe(200);
    expect((await res.json() as any).data.unchanged).toBe(true);
  });

  it('records the previous base, because the change re-labels history', async () => {
    // It does not CONVERT anything: every stored figure keeps its number and gets a
    // new symbol, which is almost never what somebody wants after the first week.
    await send('ceo', 'PUT', '/base', { code: 'USD' });
    const log = await env.DB
      .prepare("SELECT details FROM audit_logs WHERE table_name = 'currencies' ORDER BY timestamp DESC LIMIT 1")
      .first<{ details: string }>();
    expect(log?.details).toContain('"previousBase":"PKR"');
    expect(log?.details).toContain('does not convert');
  });
});

describe('the base currency cannot be removed out from under the figures', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('cannot be retired', async () => {
    const res = await send('ceo', 'PATCH', '/cur_pkr', { isActive: false });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toContain('base currency');
  });

  it('cannot be deleted', async () => {
    const res = await send('ceo', 'DELETE', '/cur_pkr');
    expect(res.status).toBe(400);
    expect(await baseOf()).toBe('PKR');
  });

  it('can be, once something else is the base', async () => {
    await send('ceo', 'PUT', '/base', { code: 'USD' });
    // No account is denominated in PKR in the fixture, so this is a real delete
    // rather than a retirement.
    expect((await send('ceo', 'DELETE', '/cur_pkr')).status).toBe(200);
    expect(await baseOf()).toBe('USD');
  });
});

describe('adding a currency', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('needs finance/accounts edit, and does not become the base', async () => {
    expect((await send('tech', 'POST', '', { code: 'ZAR' })).status).toBe(403);

    const res = await send('ceo', 'POST', '', { code: 'ZAR', name: 'Rand', symbol: 'R' });
    expect(res.status).toBe(201);
    // Adding a currency must not silently re-denominate the whole company.
    expect(await baseOf()).toBe('PKR');
  });
});
