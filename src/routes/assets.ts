import { Hono } from 'hono';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { ok, badRequest, notFound, serverError } from '../utils/response';
import { Env } from '../index';

const assetsRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();

// Simple auth for uploads/downloads
assetsRouter.use('*', authMiddleware);

/**
 * PUT /api/assets/upload/*
 * Upload a file to R2
 */
assetsRouter.put('/upload/*', async (c) => {
  try {
    const r2 = c.env.CRM_BUCKET;
    if (!r2) return badRequest(c, 'R2 bucket not configured');
    
    const key = c.req.path.replace('/api/assets/upload/', '');
    const body = await c.req.arrayBuffer();
    const contentType = c.req.header('Content-Type') || 'application/octet-stream';
    
    await r2.put(key, body, { httpMetadata: { contentType } });
    
    return ok(c, { key, uploaded: true, url: `/api/assets/download/${key}` });
  } catch (err) { return serverError(c, err); }
});

/**
 * GET /api/assets/download/*
 * Download/view a file from R2
 */
assetsRouter.get('/download/*', async (c) => {
  try {
    const r2 = c.env.CRM_BUCKET;
    if (!r2) return badRequest(c, 'R2 bucket not configured');
    
    const key = c.req.path.replace('/api/assets/download/', '');
    const object = await r2.get(key);
    
    if (!object) return notFound(c);
    
    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Content-Disposition', `inline; filename="${key.split('/').pop()}"`);
    
    return new Response(object.body, { headers });
  } catch (err) { return serverError(c, err); }
});

export default assetsRouter;
