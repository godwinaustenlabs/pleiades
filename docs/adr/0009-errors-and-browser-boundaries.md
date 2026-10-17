# 0009 — Errors never describe internals; tokens only in headers; strict CSP

**Status:** Accepted (October 2026 audit — see SECURITY.md)

**Decision.**

- `serverError` returns `Something went wrong (ref xxxxxxxx)` and logs the full error
  with the same ref. Only a thrown `PublicError` reaches the client verbatim. (drizzle
  0.45 wraps errors as `Failed query: <SQL> params: <values>`; echoing them would leak
  the schema and bound values.)
- A token is read from `Authorization: Bearer` only — plus `?token=` on GETs to the two
  link-opened paths (`/api/assets/download/*`, `/api/email/export`). No cookie is
  accepted: a cookie is the credential a browser attaches cross-site by itself.
- CORS answers only `WORKER_ORIGIN`.
- API responses carry nosniff, `Referrer-Policy: no-referrer`, HSTS, `X-Frame-Options`
  and a `default-src 'none'; sandbox` CSP (downloads may be framed same-origin). The
  SPA's static files get theirs from `apps/web/public/_headers`, including a CSP with
  `script-src 'self'` — the theme boot script lives in `/boot.js` for that reason.

**Consequences.** A user reporting an error quotes a ref, not a stack. Any new
link-opened download path must be added to the middleware's list. A new third-party
origin needs a CSP change.
