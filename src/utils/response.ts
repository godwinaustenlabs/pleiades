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

/**
 * An error whose message was written for the person who will read it.
 *
 * Throw this, and only this, when the message should reach the client. Every other
 * error is an internal detail: see `serverError`.
 */
export class PublicError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 422 | 500 = 400) {
    super(message);
    this.name = 'PublicError';
  }
}

/**
 * The 500. The client gets a generic message and a reference; the log gets the error.
 *
 * It used to return `err.message` verbatim. A D1 error names the table and column it
 * failed on, and from drizzle-orm 0.45 every database error is wrapped as
 * `Failed query: <the full SQL> params: <the bound values>` — so echoing it would
 * hand any caller who can provoke an error the schema and whatever values the query
 * carried. The reference is printed in the log line beside the full error, so a
 * person reporting "it says ref 3f9a…" can be traced exactly.
 */
export function serverError(c: Context, err: unknown) {
  if (err instanceof PublicError) {
    return c.json({ success: false, error: err.message }, err.status);
  }
  const ref = crypto.randomUUID().slice(0, 8);
  console.error(`[server_error] ref=${ref} ${c.req.method} ${c.req.path}`, err);
  return c.json({ success: false, error: `Something went wrong (ref ${ref})` }, 500);
}
