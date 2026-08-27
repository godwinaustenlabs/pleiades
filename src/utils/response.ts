import { Context } from 'hono';

export function ok<T>(c: Context, data: T, status: 200 | 201 = 200) {
  return c.json({ success: true, data }, status);
}

export function created<T>(c: Context, data: T) {
  return c.json({ success: true, data }, 201);
}

export function notFound(c: Context, message = 'Record not found') {
  return c.json({ success: false, error: message }, 404);
}

export function badRequest(c: Context, message = 'Bad request') {
  return c.json({ success: false, error: message }, 400);
}

export function forbidden(c: Context, message = 'Forbidden') {
  return c.json({ success: false, error: message }, 403);
}

export function serverError(c: Context, err: unknown) {
  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('[server_error]', err);
  return c.json({ success: false, error: message }, 500);
}
