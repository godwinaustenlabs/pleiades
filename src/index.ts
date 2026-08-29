import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getDb } from '@pleiades/database';

// Routers
import authRouter from './routes/auth';
import coreRouter from './routes/core';
import hrRouter from './routes/hr';
import financeRouter from './routes/finance';
import tasksRouter from './routes/tasks';
import legalRouter from './routes/legal';
import techRouter from './routes/tech';
import acquisitionRouter from './routes/acquisition';
import opsRouter from './routes/ops';
import adminRouter from './routes/admin';
import crmRouter from './routes/crm';
import portalRouter from './routes/portal';
import dashboardRouter from './routes/dashboard';
import permissionsRouter from './routes/permissions';
import assetsRouter from './routes/assets';
import notificationsRouter from './routes/notifications';
import calendarRouter from './routes/calendar';
import messagesRouter from './routes/messages';
import slackAgentRouter from './agents/slack';

// Durable Object classes must be exported from the Worker entry point for
// wrangler to bind them. One export per agent.
export { SlackAgent } from './agents/slack';
export { AccountantAgent } from './agents/accountant/agent';

/**
 * The Worker's environment.
 *
 * Every entry below is read somewhere in this codebase — the file is named on
 * each. Anything not read has been removed rather than left declared, since a
 * declared-but-unused binding reads as a configured integration that does not
 * exist (this type previously carried WhatsApp, Groq and Slack OAuth entries
 * for features that were never built).
 *
 * That claim used to be false and unenforceable: an `[x: string]: any` index
 * signature sat at the top of this type, so `env.ANYTHING` type-checked and six
 * dead entries (two KV namespaces, AGENT_ID, VERBOSE, CF_ACCOUNT_ID,
 * LLM_PROVIDER) went unnoticed. The index signature is gone. Do not reintroduce
 * it — it is the only thing making the sentence above checkable.
 *
 * Plaintext config lives in `wrangler.jsonc` under `vars`. Anything sensitive is
 * a Worker secret (`wrangler secret put NAME`) and is mirrored by name — never
 * by value — in `.dev.vars` for local development.
 */
export type Env = {
  // ── Bindings (wrangler.jsonc) ──────────────────────────────────────────────
  /** D1 `pleiades-db`. The only database. */
  DB: D1Database;
  /** Static assets: the built SPA in apps/web/dist, with SPA fallback. */
  ASSETS: Fetcher;
  /**
   * This Worker, bound to itself, so agent tools re-enter the API in-process.
   * Optional because `executors.ts` falls back to a plain fetch when it is
   * absent — which is what makes a first deploy of a renamed script possible,
   * since a self-referential service binding cannot name a script that does
   * not exist yet.
   */
  SELF?: Fetcher;
  /**
   * This Worker's public origin, for runs with no inbound request to read it
   * from (the cron path). Required: an unset origin used to fall back to a
   * hardcoded literal, which meant a renamed or preview deployment silently
   * called back into production.
   * Read by: src/index.ts (scheduled)
   */
  WORKER_ORIGIN: string;
  /** R2 `pleiades-docs`. Every uploaded document and photo — src/routes/assets.ts. */
  CRM_BUCKET?: R2Bucket;
  /** Source documents for the accountant's knowledge base. */
  COMPLIANCE_BUCKET?: R2Bucket;
  /**
   * Vectorize index over those documents. Optional on purpose: an absent
   * binding degrades to "no knowledge base configured", the same way an unset
   * rate produces a refusal rather than a guess.
   *
   * The index carries three metadata indexes — `namespace`, `doc_id` and
   * `section` — without which the `filter:` clauses in knowledge.ts and
   * journal.ts silently stop narrowing. They exist only on the live index;
   * recreating it means recreating all three.
   */
  VECTORIZE?: VectorizeIndex;
  /**
   * Workers AI. Optional only so tests can stub it absent; every read site
   * calls it unguarded, so at runtime it is effectively required.
   * Read by: src/utils/model.ts, agents/accountant/{knowledge,journal}.ts
   */
  AI?: Ai;
  /** The Slack agent Durable Object — one instance per Slack conversation. */
  SLACK_AGENT: DurableObjectNamespace;
  /** The accountant agent Durable Object — one instance per conversation. */
  ACCOUNTANT_AGENT: DurableObjectNamespace;

  // ── Secrets (wrangler secret put / .dev.vars) ──────────────────────────────
  /**
   * Signs and verifies staff and client-portal JWTs.
   * Read by: src/middleware/auth.ts, src/routes/auth.ts, src/routes/portal.ts
   */
  JWT_SECRET: string;
  /**
   * Gates the internal `x-agent-actor` identity header. It never leaves the
   * Worker, which is what makes that header unforgeable from outside.
   *
   * Required. It was optional, and both senders defaulted it to `''`, so a
   * missing secret surfaced as "every agent tool call 401s" rather than as a
   * misconfigured Worker. (It never opened a bypass — auth.ts refuses an empty
   * expected value — but it was a confusing way to fail.)
   * Read by: src/middleware/auth.ts, agents/accountant/executors.ts,
   *          agents/slack/agent.ts
   */
  AGENT_INTERNAL_SECRET: string;
  /**
   * Slack's app signing secret. Verifies the HMAC over the raw request body
   * before any Slack payload is trusted.
   * Read by: src/agents/slack/lib/slack.ts
   */
  SLACK_SIGNING_SECRET?: string;
  /**
   * Slack bot OAuth token, for posting messages back into Slack.
   * Read by: src/agents/slack/index.ts, src/utils/slack.ts
   */
  SLACK_BOT_OAUTH_TOKEN?: string;
  /**
   * AI Gateway auth token. Both gateways have Authenticated Gateway enabled,
   * so it is sent as `cf-aig-authorization` on every model call. Unset, the
   * agents log a warning and call the AI binding directly.
   * Read by: src/utils/model.ts
   */
  CF_AIG_TOKEN?: string;

  // ── Plaintext config (wrangler.jsonc `vars`) ───────────────────────────────
  /** AI Gateway for the accountant. Read by: agents/accountant/agent.ts */
  AI_GATEWAY_ACCOUNTANT?: string;
  /** AI Gateway for the Slack assistant. Read by: agents/slack/agent.ts */
  AI_GATEWAY_SLACK?: string;
  /** Model for the agent pipeline. Read by: src/utils/model.ts */
  LLM_MODEL?: string;
};

// Exported so test/manifest.test.ts can enumerate the registered routes. The
// route table is the thing a big refactor silently breaks — a router that stops
// being mounted still compiles, still deploys, and just 404s.
export const app = new Hono<{ Bindings: Env }>();

// ── Global Middleware ───────────────────────────────────────────
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}));

// ── Health Check (monitoring / uptime pings) ────────────────────
app.get('/api/health', (c) => c.json({
  status: 'ok',
  service: 'Pleiades API',
  version: '2.0.0',
  timestamp: new Date().toISOString(),
  endpoints: ['/auth', '/core', '/hr', '/finance', '/legal', '/tech', '/acquisition', '/admin', '/crm', '/portal', '/dashboard'],
}));

// ── Route Registry ──────────────────────────────────────────────
// Auth — login + whoami (no module gate, only auth middleware inside)
app.route('/api/auth', authRouter);

// Core — employees, labs, clients, committees, monthly-reports, docs (auth only)
app.route('/api/core', coreRouter);

// Departmental APIs — each gated by requireAppAccess(module)
app.route('/api/hr', hrRouter);
app.route('/api/tasks', tasksRouter);
app.route('/api/finance', financeRouter);
app.route('/api/legal', legalRouter);
app.route('/api/tech', techRouter);
app.route('/api/acquisition', acquisitionRouter);
app.route('/api/ops', opsRouter);



// Admin — roles, permissions, users, API keys, audit logs (ops gate)
app.route('/api/admin', adminRouter);

// Agents
app.route('/api/agents/slack', slackAgentRouter(app));

// CRM — Committee CRM system (crm gate)
app.route('/api/crm', crmRouter);

// Portal — Client-facing portal (own JWT auth)
app.route('/api/portal', portalRouter);

// Dashboard — User personal dashboard (auth only)
app.route('/api/dashboard', dashboardRouter);

// Permissions — Granular access control management
app.route('/api/permissions', permissionsRouter);
app.route('/api/assets', assetsRouter);
app.route('/api/notifications', notificationsRouter);
app.route('/api/public/calendar', calendarRouter);
app.route('/api/messages', messagesRouter);

// ── 404 Catch-all ────────────────────────────────
app.notFound(async (c) => {
  const path = new URL(c.req.url).pathname;

  // An unmatched /api path is a genuine 404 and should say so in JSON.
  if (path.startsWith('/api/')) {
    return c.json({ success: false, error: 'Route not found' }, 404);
  }

  // Everything else is a client route. Serving index.html here is what makes
  // deep links and refreshes work: /hr, /admin and /accountant match no file,
  // so without this they fell through to the JSON 404 above and every reload
  // away from `/` broke.
  const spa = await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url), c.req.raw));
  return new Response(spa.body, {
    status: 200,
    headers: spa.headers,
  });
});

// ── Error Handler ───────────────────────────────────────────────
app.onError((err, c) => {
  console.error('[unhandled]', err);
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

/**
 * The Worker's entrypoint.
 *
 * An object rather than the bare Hono app, because a bare app has no
 * `scheduled` handler and cron triggers would fire into nothing.
 */
export default {
  fetch: app.fetch,

  /**
   * The accountant's scheduled check.
   *
   * `ctx.waitUntil` is not used: the run *is* the work, and returning before it
   * finishes would let the platform cancel it halfway. A failure is logged and
   * swallowed — a scheduled handler that throws is retried, and a retried agent
   * turn would post the same suggestion twice.
   */
  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // Retention first, and outside the runner: the index must stay bounded
    // whether or not `daily_runner_actor` is set. Once a day, not twice — a
    // second sweep six hours later has nothing left to find.
    if (event.cron === '0 6 * * *') {
      try {
        const { pruneJournalVectors } = await import('./agents/accountant/journal');
        const { pruned, cutoff } = await pruneJournalVectors(env);
        if (pruned > 0) console.log(`[journal] pruned ${pruned} vector(s) older than ${cutoff}`);
      } catch (err) {
        console.error('[journal] retention sweep failed:', err);
      }
    }

    try {
      const { runDailyCheck } = await import('./agents/accountant/daily-runner');
      // A scheduled run has no request to take an origin from. The var keeps a
      // preview deployment from calling back into production.
      const result = await runDailyCheck(env, env.WORKER_ORIGIN);
      console.log(
        `[daily-runner] ${event.cron}:`,
        result.ran ? `posted ${result.messageId}` : `skipped — ${result.reason}`,
      );
    } catch (err) {
      console.error('[daily-runner] failed:', err);
    }
  },
};
