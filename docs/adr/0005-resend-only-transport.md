# 0005 — Resend is the only outbound mail transport

**Status:** Accepted

**Context.** On the Workers Free plan, Cloudflare Email Sending delivers only to
verified destination addresses; once the apex MX moved to Cloudflare every staff
address became own-domain and could not be one.

**Decision.** All outbound mail goes through Resend via `src/email/transport.ts`, with
an account-wide daily cap (90) below Resend's free tier. Inbound mail arrives through
Email Routing at the Worker's `email()` handler and is stored in D1 + R2.

**Consequences.** Mail volume is a budget: notifications are sent once per event, never
per occurrence (see 0007). The delivery webhook is the only unauthenticated write and
fails closed without its secret.
