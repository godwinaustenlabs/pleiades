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
import slackAgentRouter from './agents/slack-agent';

export type Env = {
  [x: string]: any;
  DB: D1Database;
  JWT_SECRET: string;
  API_KEY_SECRET: string;
  ASSETS: Fetcher;
  LLM_MODEL?: string;
  LLM_PROVIDER?: string;
  CLIENT_ID?: string;
  AGENT_ID?: string;
  GROQ_API_KEY?: string;
  SYSTEM_PROMPT?: string;
  VERBOSE?: string;
  CF_ACCOUNT_ID?: string;
  CF_GATEWAY_NAME?: string;
  CF_AIG_TOKEN?: string;
  WA_VERIFY_TOKEN?: string;
  WA_PHONE_NUMBER_ID?: string;
  WA_ACCESS_TOKEN?: string;
  DASHBOARD_PASSWORD?: string;
  CLIENTS_KV_NAMESPACE?: KVNamespace;
  MEMORY_KV_NAMESPACE?: KVNamespace;
  AI?: Ai;
  CRM_BUCKET?: R2Bucket;
  SLACK_BOT_OAUTH_TOKEN?: string;
  SLACK_SIGNING_SECRET?: string;
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SLACK_VERIFICATION_TOKEN?: string;
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
