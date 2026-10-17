# 0002 — Access is the union of a person's grants and their posts' grants

**Status:** Accepted (migrations 0047, 0050)

**Context.** Logins were once per *appointment*, so a person with two posts had two
accounts. Roles (0020) were tried and removed (0025): a role widens access for
everyone who holds it.

**Decision.** One login per person. Effective access is the OR of
`user_app_permissions` (the person) and `appointment_app_permissions` for every
active post they hold, plus committee-implied grants. Assigning a post
(`admin/appointments`) and deciding what a post reaches (`admin/permissions`) are
separate grants, so neither escalates to the other. Superadmin is set only in the
database.

**Consequences.** A handover is one edit to `appointments.employee_id`, which moves
grants, the post's mailbox and its committee seat. Grants are resolved per request
from the database, never from the token, so revocation is immediate.
`test/appointments-rbac.test.ts` and the brute-force suite pin the model.
