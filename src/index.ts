import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getDb } from '@ganova/database';

// Routers
import authRouter      from './routes/auth';
import coreRouter      from './routes/core';
import hrRouter from './routes/hr';
import financeRouter from './routes/finance';
import tasksRouter from './routes/tasks';
import legalRouter     from './routes/legal';
import techRouter      from './routes/tech';
import acquisitionRouter from './routes/acquisition';
import opsRouter         from './routes/ops';
import adminRouter       from './routes/admin';
import mcpRouter       from './mcp/server';
import crmRouter       from './routes/crm';
import portalRouter    from './routes/portal';
import dashboardRouter from './routes/dashboard';
import permissionsRouter from './routes/permissions';
import assetsRouter from './routes/assets';
import notificationsRouter from './routes/notifications';

export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  API_KEY_SECRET: string;
  ASSETS: Fetcher;
  // Additional env vars kept for backwards compat
  LLM_MODEL?: string;
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
  service: 'GAnovaOS Office API',
  version: '2.0.0',
  timestamp: new Date().toISOString(),
  endpoints: ['/auth', '/core', '/hr', '/finance', '/legal', '/tech', '/acquisition', '/admin', '/mcp', '/crm', '/portal', '/dashboard'],
}));

// ── Route Registry ──────────────────────────────────────────────
// Auth — login + whoami (no module gate, only auth middleware inside)
app.route('/api/auth', authRouter);

// Core — employees, labs, clients, committees, monthly-reports, docs (auth only)
app.route('/api/core', coreRouter);

// Departmental APIs — each gated by requireAppAccess(module)
app.route('/api/hr',          hrRouter);
app.route('/api/tasks', tasksRouter);
app.route('/api/finance',     financeRouter);
app.route('/api/legal',       legalRouter);
app.route('/api/tech',        techRouter);
app.route('/api/acquisition', acquisitionRouter);
app.route('/api/ops',         opsRouter);

// Admin — roles, permissions, users, API keys, audit logs (ops gate)
app.route('/api/admin', adminRouter);

// MCP — AI agent tool interface (mcp_server gate)
app.route('/api/mcp', mcpRouter);

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
