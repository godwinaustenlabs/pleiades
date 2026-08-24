import { Hono } from 'hono';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { ok, badRequest, notFound, serverError } from '../utils/response';
import { Env } from '../index';

const assetsRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();

// No global auth here; handled per-route for public access to specific assets
// assetsRouter.use('*', authMiddleware);

/**
 * PUT /api/assets/upload/*
 * Upload a file to R2
 */
/** Prefixes a caller may write to. Anything else is rejected outright. */
const ALLOWED_UPLOAD_PREFIXES = [
  'avatars/', 'profiles/', 'company-docs/', 'finance-docs/',
  'crm-docs/', 'employee-docs/', 'task-attachments/',
];

/** 25 MB — a Worker request body has to be held in memory to reach R2. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Validates a caller-supplied R2 key.
 *
 * The key used to be taken from the URL verbatim, which let a caller write
 * anywhere in the bucket — including over another user's object, and into
 * `avatars/`/`profiles/`, which are served publicly with no authentication.
 */
function validateUploadKey(key: string): { ok: true; key: string } | { ok: false; reason: string } {
  const decoded = decodeURIComponent(key);

  if (!decoded) return { ok: false, reason: 'No key provided' };
  if (decoded.length > 512) return { ok: false, reason: 'Key too long' };
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\\]/.test(decoded)) return { ok: false, reason: 'Key contains invalid characters' };
  if (decoded.startsWith('/') || decoded.includes('..') || decoded.includes('//')) {
    return { ok: false, reason: 'Key contains invalid path segments' };
  }
  if (!ALLOWED_UPLOAD_PREFIXES.some((p) => decoded.startsWith(p))) {
    return { ok: false, reason: `Key must start with one of: ${ALLOWED_UPLOAD_PREFIXES.join(', ')}` };
  }
  return { ok: true, key: decoded };
}

assetsRouter.put('/upload/*', authMiddleware, async (c) => {
  try {
    const r2 = c.env.CRM_BUCKET;
    if (!r2) {
      console.error('[assets] R2 bucket not configured');
      return badRequest(c, 'R2 bucket not configured');
    }

    // In Hono, c.req.path is more reliable than a param for multi-segment keys
    const path = c.req.path;
    const prefix = '/api/assets/upload/';
    const rawKey = path.substring(path.indexOf(prefix) + prefix.length);

    const validated = validateUploadKey(rawKey);
    if (!validated.ok) return badRequest(c, validated.reason);
    const key = validated.key;

    const body = await c.req.arrayBuffer();
    if (body.byteLength === 0) return badRequest(c, 'Empty upload');
    if (body.byteLength > MAX_UPLOAD_BYTES) {
      return badRequest(c, `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit`);
    }

    const contentType = c.req.header('Content-Type') || 'application/octet-stream';

    await r2.put(key, body, { httpMetadata: { contentType } });

    return ok(c, { key, uploaded: true, url: `/api/assets/download/${key}` });
  } catch (err) {
    console.error('[assets] Error during R2 upload:', err);
    return serverError(c, err);
  }
});

/**
 * GET /api/assets/download/*
 * Download/view a file from R2
 */
assetsRouter.get('/*', async (c, next) => {
  const path = c.req.path;
  const key = path.includes('/download/') ? path.substring(path.indexOf('/download/') + '/download/'.length) : '';
  const isPublicPrefix = key.startsWith('avatars/') || key.startsWith('profiles/');

  if (!isPublicPrefix) {
    return authMiddleware(c, next);
  }
  return next();
}, async (c) => {
  const path = c.req.path;
  
  if (!path.includes('/download/')) {
    return notFound(c);
  }

  const key = path.substring(path.indexOf('/download/') + '/download/'.length);
  
  try {
    const r2 = c.env.CRM_BUCKET;
    if (!r2) {
      console.error('[Debug] R2 bucket not configured');
      return badRequest(c, 'R2 bucket not configured');
    }
    
    // Check auth if not public
    const isPublicPrefix = key.startsWith('avatars/') || key.startsWith('profiles/');
    if (!isPublicPrefix) {
      const user = c.get('user');
      if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const object = await r2.get(key);
    
    if (!object) {
      return notFound(c);
    }
    
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    // The stored content type comes from whatever the uploader sent. Without
    // these, a user could upload text/html into the publicly-readable avatars/
    // prefix and get stored XSS on this origin. Only a short allowlist renders
    // inline; everything else is forced to download and never sniffed.
    const INLINE_SAFE = [
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif',
      'application/pdf', 'text/plain',
    ];
    const storedType = (headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    headers.set('X-Content-Type-Options', 'nosniff');
    if (!INLINE_SAFE.includes(storedType)) {
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Content-Disposition', 'attachment');
    }

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
