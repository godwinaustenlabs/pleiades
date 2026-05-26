import { Hono } from 'hono';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { ok, badRequest, notFound, serverError } from '../utils/response';
import { Env } from '../index';

const assetsRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();

assetsRouter.use('*', async (c, next) => {
  console.log(`[Debug] Request entering assetsRouter: ${c.req.url}`);
  await next();
});

// No global auth here; handled per-route for public access to specific assets
// assetsRouter.use('*', authMiddleware);

/**
 * PUT /api/assets/upload/*
 * Upload a file to R2
 */
assetsRouter.put('/upload/*', authMiddleware, async (c) => {
  try {
    const r2 = c.env.CRM_BUCKET;
    if (!r2) {
      console.error('[Debug] R2 bucket not configured');
      return badRequest(c, 'R2 bucket not configured');
    }
    
    // In Hono, c.req.path or splitting the URL is more reliable for multi-segment keys
    const path = c.req.path;
    const prefix = '/api/assets/upload/';
    const key = path.substring(path.indexOf(prefix) + prefix.length);

    if (!key) {
      console.error('[Debug] No key provided, path:', path);
      return badRequest(c, 'No key provided');
    }

    const body = await c.req.arrayBuffer();
    const contentType = c.req.header('Content-Type') || 'application/octet-stream';
    
    console.log(`[Debug] Attempting to upload to R2, key: ${key}, size: ${body.byteLength}, contentType: ${contentType}`);
    
    await r2.put(key, body, { httpMetadata: { contentType } });
    
    // Return URL with /api prefix as standard
    return ok(c, { key, uploaded: true, url: `/api/assets/download/${key}` });
  } catch (err) { 
    console.error('[Debug] Error during R2 upload:', err);
    return serverError(c, err); 
  }
});

/**
 * GET /api/assets/download/*
 * Download/view a file from R2
 */
assetsRouter.get('/*', async (c) => {
  const path = c.req.path;
  console.log(`[Debug] Incoming path in assetsRouter: ${path}`);
  
  if (!path.includes('/download/')) {
    console.log(`[Debug] Path does not include /download/, path: ${path}`);
    return notFound(c);
  }

  const key = path.substring(path.indexOf('/download/') + '/download/'.length);
  console.log(`[Debug] Attempting to fetch key: "${key}"`);
  
  try {
    const r2 = c.env.CRM_BUCKET;
    if (!r2) {
      console.error('[Debug] R2 bucket not configured');
      return badRequest(c, 'R2 bucket not configured');
    }
    
    // Public access for avatars and profile photos
    const isPublicPrefix = key.startsWith('avatars/') || key.startsWith('profiles/');
    
    if (!isPublicPrefix) {
      // Manual check for auth since we want to allow some public keys
      const user = c.get('user');
      if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const object = await r2.get(key);
    
    if (!object) {
      console.log(`[Debug] Object not found for key: "${key}"`);
      return notFound(c);
    }
    
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    
    if (isPublicPrefix) {
      headers.set('Cache-Control', 'public, max-age=31536000');
    }

    // Handle conditional requests
    if (c.req.header('If-None-Match') === object.httpEtag) {
      return new Response(null, { status: 304, headers });
    }
    
    return new Response(object.body, { headers });
  } catch (err) { return serverError(c, err); }
});

export default assetsRouter;
