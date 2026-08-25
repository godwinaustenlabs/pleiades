import { Hono } from 'hono';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { checkFeaturePermission } from '../middleware/rbac';
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
  'avatars/', 'profiles/', 'entity-photos/',
  'company-docs/', 'finance-docs/', 'crm-docs/', 'employee-docs/',
  'ops-docs/', 'legal-docs/', 'acquisition-docs/', 'task-attachments/',
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
/**
 * Which grant a caller needs to read an object, by key prefix.
 *
 * Authentication alone was the only check here, so any signed-in user could
 * fetch any key they could name — every employee document, finance document,
 * CRM document and task attachment in the bucket, regardless of role. The
 * upload allowlist already constrains where objects can be written, so the
 * same prefixes are the natural unit to authorize reads against.
 *
 * A prefix that does not encode its department (company documents are one
 * shared store, task attachments span every module) accepts the matching
 * feature in ANY app the caller holds — matching how those routes are gated
 * per department elsewhere rather than inventing a stricter rule here.
 */
/**
 * Readable by any signed-in user. Used for logos and entity photographs, which
 * are shown beside records the caller can already see and carry nothing
 * sensitive — the alternative is a broken image for anyone lacking one specific
 * module grant.
 */
const ANY_AUTHENTICATED: [string, string][] = [];

const READ_RULES: { prefix: string; grants: [string, string][] }[] = [
  // ── Current prefixes ───────────────────────────────────────────────────────
  { prefix: 'employee-docs/', grants: [['hr', 'employees']] },
  { prefix: 'finance-docs/', grants: [['finance', 'docs']] },
  { prefix: 'crm-docs/', grants: [['crm', 'documents']] },
  { prefix: 'ops-docs/', grants: [['ops', 'docs'], ['core', 'docs']] },
  { prefix: 'legal-docs/', grants: [['legal', 'templates'], ['legal', 'sops'], ['legal', 'agreements']] },
  { prefix: 'acquisition-docs/', grants: [['acquisition', 'content'], ['acquisition', 'campaigns']] },
  {
    prefix: 'company-docs/',
    grants: [['hr', 'employees'], ['finance', 'docs'], ['ops', 'docs'], ['core', 'docs']],
  },
  {
    prefix: 'task-attachments/',
    grants: [
      ['hr', 'tasks'], ['finance', 'tasks'], ['legal', 'tasks'], ['tech', 'tasks'],
      ['acquisition', 'tasks'], ['ops', 'tasks'], ['crm', 'tasks'], ['dashboard', 'tasks'],
    ],
  },
  // Logos and entity photographs. These are decoration rendered in grids and
  // headers next to records the caller can already see; gating them on a
  // specific module's grant only produces broken images.
  { prefix: 'entity-photos/', grants: ANY_AUTHENTICATED },

  // ── Legacy prefixes ────────────────────────────────────────────────────────
  // Upload keys used to be derived from the *title of the form* doing the
  // upload ("Upload Institutional Asset" -> `upload_institutional_asset/`), so
  // the set of prefixes in the bucket was never a fixed list. These are the
  // ones that actually have objects behind them. Nothing writes here any more
  // (see ALLOWED_UPLOAD_PREFIXES), but the files must stay readable, so each is
  // mapped to the grant its module requires rather than being waved through.
  { prefix: 'upload_institutional_asset/', grants: [['crm', 'documents']] },
  { prefix: 'new_documents/', grants: [['core', 'docs'], ['ops', 'docs']] },
  { prefix: 'update_template/', grants: [['legal', 'templates']] },
  { prefix: 'new_template/', grants: [['legal', 'templates']] },
  { prefix: 'new_sop/', grants: [['legal', 'sops']] },
  { prefix: 'update_clients/', grants: ANY_AUTHENTICATED },
  { prefix: 'invoices/', grants: [['finance', 'invoices'], ['finance', 'docs']] },
  {
    prefix: 'tasks/',
    grants: [
      ['hr', 'tasks'], ['finance', 'tasks'], ['legal', 'tasks'], ['tech', 'tasks'],
      ['acquisition', 'tasks'], ['ops', 'tasks'], ['crm', 'tasks'], ['dashboard', 'tasks'],
    ],
  },
];

/**
 * Percent-decodes an object key, mirroring the upload route.
 *
 * A malformed sequence would throw out of decodeURIComponent, so the raw key is
 * used in that case rather than failing the request.
 */
function decodeKey(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Publicly readable: these are rendered in <img> tags with no credentials. */
const PUBLIC_PREFIXES = ['avatars/', 'profiles/'];

const isPublicKey = (key: string) => PUBLIC_PREFIXES.some((p) => key.startsWith(p));

async function mayReadKey(c: Parameters<typeof checkFeaturePermission>[0], key: string): Promise<boolean> {
  const rule = READ_RULES.find((r) => key.startsWith(r.prefix));
  // An unrecognised prefix cannot be reasoned about, so it is not served.
  if (!rule) return false;
  // An empty grant list means "any authenticated caller" — the caller has
  // already been authenticated by the middleware above to get here.
  if (rule.grants.length === 0) return true;
  for (const [app, feature] of rule.grants) {
    if (await checkFeaturePermission(c, app, feature, 'view')) return true;
  }
  return false;
}

assetsRouter.get('/*', async (c, next) => {
  const path = c.req.path;
  const key = path.includes('/download/')
    ? decodeKey(path.substring(path.indexOf('/download/') + '/download/'.length))
    : '';
  if (!isPublicKey(key)) {
    return authMiddleware(c, next);
  }
  return next();
}, async (c) => {
  const path = c.req.path;
  
  if (!path.includes('/download/')) {
    return notFound(c);
  }

  // The upload route decodes the key before storing it, so an object whose name
  // contains a space is stored with a real space. Without the matching decode
  // here the lookup asks R2 for the literal "%20" and misses — which is why
  // every file with a space in its name 404'd.
  const key = decodeKey(path.substring(path.indexOf('/download/') + '/download/'.length));

  try {
    const r2 = c.env.CRM_BUCKET;
    if (!r2) {
      console.error('[Debug] R2 bucket not configured');
      return badRequest(c, 'R2 bucket not configured');
    }
    
    if (!isPublicKey(key)) {
      const user = c.get('user');
      if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
      // Authenticated is not authorized: check the grant the prefix requires.
      if (!(await mayReadKey(c, key))) {
        return c.json({ success: false, error: 'Forbidden' }, 403);
      }
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

    // Only public objects may be cached by shared caches; an authorized
    // response must not be stored where the next caller could be served it.
    if (isPublicKey(key)) {
      headers.set('Cache-Control', 'public, max-age=31536000');
    } else {
      headers.set('Cache-Control', 'private, no-store');
    }

    // Handle conditional requests
    if (c.req.header('If-None-Match') === object.httpEtag) {
      return new Response(null, { status: 304, headers });
    }
    
    return new Response(object.body, { headers });
  } catch (err) { return serverError(c, err); }
});

export default assetsRouter;
