import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getDb } from '@ganova/database';

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
import agentRouter from './routes/agent';
import slackAgentRouter from './agents/slack';

// Durable Object classes must be exported from the Worker entry point for
// wrangler to bind them. One export per agent.
export { SlackAgent } from './agents/slack';

/**
 * The Worker's environment.
 *
 * Every entry below is read somewhere in this codebase — the file/line is named
 * on each. Anything not read has been removed rather than left declared, since
 * a declared-but-unused binding reads as a configured integration that does not
 * exist (this type previously carried WhatsApp, Groq and Slack OAuth entries
 * for features that were never built).
 *
 * Plaintext config lives in `wrangler.jsonc` under `vars`. Anything sensitive is
 * a Worker secret (`wrangler secret put NAME`) and is mirrored by name — never
 * by value — in `.dev.vars` for local development.
 */
export type Env = {
  [x: string]: any;

  // ── Bindings (wrangler.jsonc) ──────────────────────────────────────────────
  /** D1 `office-db`. The only database. */
  DB: D1Database;
  /** Static assets: the built SPA in apps/web/dist, with SPA fallback. */
  ASSETS: Fetcher;
  /** R2 `office-crm-docs`. Every uploaded document and photo — src/routes/assets.ts. */
  CRM_BUCKET?: R2Bucket;
  /** Workers AI. Bound for the agent pipeline. */
  AI?: Ai;
  /** The Slack agent Durable Object — one instance per Slack conversation. */
  SLACK_AGENT: DurableObjectNamespace;
  CLIENTS_KV_NAMESPACE?: KVNamespace;
  MEMORY_KV_NAMESPACE?: KVNamespace;

  // ── Secrets (wrangler secret put / .dev.vars) ──────────────────────────────
  /**
   * Signs and verifies staff and client-portal JWTs.
   * Used in: src/middleware/auth.ts, src/routes/auth.ts, src/routes/portal.ts.
   */
  JWT_SECRET: string;
  /**
   * Gates the internal `x-agent-actor` identity header. It never leaves the
   * Worker, which is what makes that header unforgeable from outside.
   * Used in: src/middleware/auth.ts, src/agents/slack/index.ts.
   */
  AGENT_INTERNAL_SECRET?: string;
  /**
   * Slack's app signing secret. Verifies the HMAC over the raw request body
   * before any Slack payload is trusted.
   * Used in: src/agents/slack/lib/slack.ts.
   */
  SLACK_SIGNING_SECRET?: string;
  /**
   * Slack bot OAuth token, for posting messages back into Slack.
   * Used in: src/agents/slack/index.ts, src/utils/slack.ts.
   */
  SLACK_BOT_OAUTH_TOKEN?: string;
  /**
   * AI Gateway auth token, paired with CF_ACCOUNT_ID and CF_GATEWAY_NAME.
   * Used in: src/agents/slack/index.ts.
   */
  CF_AIG_TOKEN?: string;

  // ── Plaintext config (wrangler.jsonc `vars`) ───────────────────────────────
  /** AI Gateway account and gateway name — src/agents/slack/index.ts. */
  CF_ACCOUNT_ID?: string;
  CF_GATEWAY_NAME?: string;
  /** Model and provider for the agent pipeline — src/agents/slack/index.ts. */
  LLM_MODEL?: string;
  LLM_PROVIDER?: string;
  /** Agent identifier passed to the pipeline — src/agents/slack/index.ts. */
  AGENT_ID?: string;
  /** Extra agent logging — src/agents/slack/index.ts. */
  VERBOSE?: string;
};

const app = new Hono<{ Bindings: Env }>();

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
  service: 'officeOS Office API',
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
app.route('/api/agent', agentRouter);
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
  return c.json({ success: false, error: 'Route not found' }, 404);
});

// ── Error Handler ───────────────────────────────────────────────
app.onError((err, c) => {
  console.error('[unhandled]', err);
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

export default app;
