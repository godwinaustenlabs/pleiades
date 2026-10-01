import { Hono, type MiddlewareHandler } from 'hono';
import { and, eq, or } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { APP_FEATURES, checkFeaturePermission, requireFeatureAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';
import { chunk } from '../utils/batch';
import { appointmentImpact, deleteAppointment } from '../deletion/impact';

/**
 * Appointments: the posts themselves, and what holding one grants.
 *
 * Mounted at the TOP level, at `/api/appointments`, rather than inside `admin.ts` —
 * the same arrangement as `/api/email` and `/api/assets`, and for the same reason: a
 * post is not one app's concern. HQ manages it, HR reads it to show somebody's job
 * in the directory, and the mailbox editor reads it to attach an address. Inside the
 * admin router it would have inherited `requireAppAccess('admin')`, which no HR user
 * holds, so the directory column would have been blank for everybody who works in HR.
 *
 * So there is no `requireAppAccess` here: the router carries only `authMiddleware`
 * and every route states its own gate.
 *
 * It used to live in `src/routes/hr.ts` behind `hr/appointments`, and moving it is
 * not tidying. Since 0047 an appointment IS an access control: creating one and
 * assigning a holder hands that person every grant the post carries, its mailbox and
 * its committee seat, and a handover moves all three in a single edit. Behind an HR
 * grant, that meant whoever ran the payroll could also confer any access a post
 * carried. Migration 0050 moves the grant to `admin/appointments`.
 *
 * TWO features, and the split is the security property:
 *
 *   admin/appointments  create a post, assign it, end it, delete it.
 *   admin/permissions   decide what a post may REACH.
 *
 * Collapsing them would make `admin/appointments` an escalation to everything, by
 * way of creating a post, granting it the world and appointing yourself to it. So
 * the routes below are gated on one or the other, never on whichever is handy, and
 * `POST /` deliberately ignores a `permissions` key on its body.
 */
const appointmentsRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
appointmentsRouter.use('*', authMiddleware);

// ── APPOINTMENT GRANTS ────────────────────────────────────────────────────────

/**
 * Either grant opens the appointment list.
 *
 * The Posts editor needs it (admin/permissions) and so does the mailbox editor, to
 * attach an address to a post (admin/mailboxes). Gated on permissions alone, a
 * mailbox administrator got a 403 and the appointment picker rendered empty — which
 * looks like "there are no appointments" rather than "you cannot see them".
 */
/**
 * Reading the list of posts, which four different jobs legitimately need.
 *
 * Any ONE of these grants opens it, because each is a real reason to see who holds
 * what, and requiring the union would mean nobody could do their job without
 * everybody else's access:
 *
 *   admin/appointments  manage the posts.
 *   admin/permissions   edit what a post reaches, which needs a post to pick.
 *   admin/mailboxes     attach an address to a post, which needs the same picker.
 *   hr/employees        show somebody's post in the staff directory. The ONLY thing
 *                       HR still needs from appointments after migration 0050 —
 *                       reading who holds what, never changing it.
 *
 * Gated on `admin/appointments` alone, a mailbox administrator saw a 403 and the
 * picker rendered empty, which reads as "there are no posts" rather than "you cannot
 * see them".
 */
const canReadAppointments: MiddlewareHandler = async (rawCtx, next) => {
  const c = rawCtx as Parameters<typeof checkFeaturePermission>[0];
  for (const [app, feature] of [
    ['admin', 'appointments'],
    ['admin', 'permissions'],
    ['admin', 'mailboxes'],
    ['hr', 'employees'],
  ] as const) {
    if (await checkFeaturePermission(c, app, feature, 'view')) return await next();
  }
  return c.json({
    error: 'Forbidden: reading posts needs one of admin/appointments, admin/permissions, admin/mailboxes or hr/employees',
  }, 403);
};

appointmentsRouter.get('/', canReadAppointments, async (c) => {
  try {
    /**
     * Every appointment, with its holder. The one list — the HR copy that used to
     * exist alongside it is gone, since two endpoints over the same rows is two
     * places a filter has to be fixed.
     */
    const rows = await getDb(c.env).query.appointments.findMany({
      with: { employee: { columns: { id: true, name: true, department: true } } },
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

appointmentsRouter.get('/:id/permissions', requireFeatureAccess('admin', 'permissions', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env).query.appointmentAppPermissions.findMany({
      where: eq(schema.appointmentAppPermissions.appointmentId, c.req.param('id')!),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/**
 * PUT /admin/appointments/:id/permissions
 *
 * Replaces one appointment's entire grant set. Body: { permissions: [{ appName,
 * feature, canView, canEdit, canDelete }] }. Delete-then-insert, so unticking a
 * box actually removes the grant.
 *
 * Saving this changes what the CURRENT HOLDER can reach, on their next request —
 * grants are read per request, so there is no token to expire first. It also
 * changes what every future holder can reach, which is the point of editing the
 * post rather than the person.
 */
appointmentsRouter.put('/:id/permissions', requireFeatureAccess('admin', 'permissions', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const actor = c.get('user');
    const appointmentId = c.req.param('id')!;
    const { permissions } = await c.req.json<{ permissions: any[] }>();
    if (!Array.isArray(permissions)) return badRequest(c, 'permissions array required');

    const appointment = await db.query.appointments.findFirst({
      where: eq(schema.appointments.id, appointmentId),
      columns: { id: true, roleOrTitle: true, employeeId: true, isActive: true },
    });
    if (!appointment) return notFound(c, 'Appointment not found');

    const unknown = permissions
      .filter((p) => !APP_FEATURES[p.appName]?.includes(p.feature))
      .map((p) => `${p.appName}/${p.feature}`);
    if (unknown.length > 0) return badRequest(c, `Unknown app/feature: ${unknown.join(', ')}`);

    await db.delete(schema.appointmentAppPermissions)
      .where(eq(schema.appointmentAppPermissions.appointmentId, appointmentId));

    const now = new Date();
    const toInsert = permissions
      .filter((p) => p.canView || p.canEdit || p.canDelete)
      .map((p) => ({
        id: generateId('aap'),
        appointmentId,
        appName: p.appName,
        feature: p.feature,
        canView: p.canView ?? false,
        canEdit: p.canEdit ?? false,
        canDelete: p.canDelete ?? false,
        createdAt: now,
        updatedAt: now,
      }));
    for (const batch of chunk(toInsert, 5)) {
      if (batch.length > 0) await db.insert(schema.appointmentAppPermissions).values(batch as any);
    }

    await logAudit(c.env, actor.id, 'UPDATE', 'appointment_app_permissions', appointmentId, {
      count: toInsert.length,
      roleOrTitle: appointment.roleOrTitle ?? null,
      // Who this took effect for immediately. An access change that is invisible
      // in the audit log because it was addressed to a post rather than a person
      // is the one thing appointment-level grants could have made worse.
      holder: appointment.employeeId ?? null,
      appliesNow: appointment.isActive === true,
    });
    return ok(c, { appointmentId, count: toInsert.length, holder: appointment.employeeId ?? null });
  } catch (err) { return serverError(c, err); }
});

/* ── APPOINTMENTS ── */
/**
 * An appointment is a POST, and the unit access is defined on.
 *
 * The important route here is not the create — it is `PATCH /appointments/:id`
 * changing `employeeId`. That single edit is a handover: the new holder gains
 * every grant in `appointment_app_permissions`, every mailbox attached to the
 * appointment, and the committee seat; the previous holder loses all three. No
 * permission matrix is opened for either person, and there is no second login to
 * create or remember to deactivate.
 *
 * What these routes deliberately do NOT do:
 *
 *   - create or update a login. One login per person, provisioned against the
 *     employee (`POST /hr/employees/:id/account`), never against a post. The old
 *     `/appointments/provision` did both at once, which is how a person holding
 *     two posts ended up with two accounts and could read only one at a time.
 *   - write permissions. See the note at the top of this file.
 */
/** What a caller may set on an appointment. An allowlist, so a new column is not writable by accident. */
const APPOINTMENT_FIELDS = [
  'roleOrTitle', 'appointmentDate', 'termType', 'appointmentEndDate',
  'isActive', 'employeeId', 'committeeId',
] as const;

function appointmentPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of APPOINTMENT_FIELDS) {
    if (!(key in body)) continue;
    const value = body[key];
    /**
     * `isActive` is coerced rather than passed through, because it is the switch on
     * whether this post grants anything. Drizzle's boolean mode would write the
     * string "false" as a truthy 1, so a client sending JSON-in-a-string would
     * silently REINSTATE access it meant to withdraw.
     */
    if (key === 'isActive') {
      patch[key] = value === true || value === 1 || value === 'true';
      continue;
    }
    // An empty string in a foreign key column is not null and does not exist,
    // so it fails the constraint rather than clearing the field. The web form
    // sends '' for "nobody".
    patch[key] = value === '' ? null : value;
  }
  return patch;
}

/**
 * Keeps committee membership in step with who holds the appointment.
 *
 * Membership implies the `crm` grants in src/middleware/rbac.ts, so it is access
 * and has to move on a handover like everything else. The outgoing holder's seat
 * is removed only when no other active appointment of theirs names that
 * committee — somebody can sit on a committee for more than one reason, and
 * dropping a seat they hold independently would revoke access this edit was
 * never about.
 */
async function syncCommitteeSeat(
  env: Env,
  committeeId: string | null,
  incoming: string | null,
  outgoing: string | null,
  roleInCommittee?: string | null,
  /**
   * The committee this appointment named BEFORE the edit, when that changed.
   *
   * Without it, moving a post from one committee to another left its holder seated
   * on the old one — access the edit was meant to withdraw, silently kept. The
   * holder being the same person in that case is exactly why it is easy to miss:
   * nothing looks like a handover.
   */
  previousCommitteeId?: string | null,
): Promise<void> {
  const db = getDb(env);

  if (previousCommitteeId && previousCommitteeId !== committeeId) {
    await vacateSeat(env, previousCommitteeId, outgoing ?? null);
    await vacateSeat(env, previousCommitteeId, incoming ?? null);
  }

  if (!committeeId) return;

  if (incoming) {
    const existing = await db.query.committeeMembers.findFirst({
      where: and(
        eq(schema.committeeMembers.committeeId, committeeId),
        eq(schema.committeeMembers.employeeId, incoming),
      ),
    });
    if (!existing) {
      await db.insert(schema.committeeMembers).values({
        committeeId,
        employeeId: incoming,
        roleInCommittee: roleInCommittee ?? null,
        joinedAt: new Date().toISOString(),
      });
    }
  }

  if (outgoing && outgoing !== incoming) await vacateSeat(env, committeeId, outgoing);
}

/**
 * Removes one person's seat on one committee — but only when no active appointment
 * of theirs still names it.
 *
 * Somebody can sit on a committee for more than one reason, and dropping a seat
 * they hold independently would revoke access this edit was never about.
 */
async function vacateSeat(env: Env, committeeId: string, employeeId: string | null): Promise<void> {
  if (!employeeId) return;
  const db = getDb(env);
  const stillSeated = await db.query.appointments.findMany({
    where: and(
      eq(schema.appointments.employeeId, employeeId),
      eq(schema.appointments.committeeId, committeeId),
      eq(schema.appointments.isActive, true),
    ),
    columns: { id: true },
  });
  if (stillSeated.length > 0) return;

  await db.delete(schema.committeeMembers).where(and(
    eq(schema.committeeMembers.committeeId, committeeId),
    eq(schema.committeeMembers.employeeId, employeeId),
  ));
}

/** The holder must be a real employee; a post assigned to an id that does not exist reaches nobody and looks filled. */
async function employeeExists(env: Env, employeeId: unknown): Promise<boolean> {
  if (typeof employeeId !== 'string' || !employeeId) return false;
  const row = await getDb(env).query.employees.findFirst({
    where: eq(schema.employees.id, employeeId),
    columns: { id: true },
  });
  return !!row;
}

appointmentsRouter.post('/', requireFeatureAccess('admin', 'appointments', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();
    const patch = appointmentPatch(body);

    if (!patch.roleOrTitle) return badRequest(c, 'roleOrTitle is required — an appointment is a named post.');
    if (patch.employeeId && !(await employeeExists(c.env, patch.employeeId))) {
      return badRequest(c, 'employeeId does not name a known employee.');
    }

    const id = generateId('appt');
    await db.insert(schema.appointments).values({
      ...patch,
      id,
      // Vacant is a legitimate state: the post exists, grants nobody, and hands
      // everything to whoever is appointed to it later.
      employeeId: (patch.employeeId as string | null) ?? null,
      isActive: patch.isActive === undefined ? true : patch.isActive === true,
      createdAt: new Date(),
    } as any);

    await syncCommitteeSeat(
      c.env,
      (patch.committeeId as string | null) ?? null,
      (patch.employeeId as string | null) ?? null,
      null,
      (patch.roleOrTitle as string | null) ?? null,
    );

    await logAudit(c.env, user.id, 'CREATE', 'appointments', id, patch);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

appointmentsRouter.get('/:id', requireFeatureAccess('admin', 'appointments', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.appointments.findFirst({ where: eq(schema.appointments.id, c.req.param('id')!) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

/**
 * PATCH /appointments/:id — including the handover.
 *
 * Changing `employeeId` moves the post's access, its mail and its committee seat
 * from one person to another in one edit. That is the whole reason grants hang off
 * appointments rather than people, so it is audited as a handover explicitly
 * rather than as a field change among others.
 */
appointmentsRouter.patch('/:id', requireFeatureAccess('admin', 'appointments', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id')!;
    const before = await db.query.appointments.findFirst({ where: eq(schema.appointments.id, id) });
    if (!before) return notFound(c);

    const body = await c.req.json();
    const patch = appointmentPatch(body);
    if (Object.keys(patch).length === 0) {
      return badRequest(c, `Nothing to change. This route accepts: ${APPOINTMENT_FIELDS.join(', ')}.`);
    }
    if (patch.employeeId && !(await employeeExists(c.env, patch.employeeId))) {
      return badRequest(c, 'employeeId does not name a known employee.');
    }

    await db.update(schema.appointments).set(patch).where(eq(schema.appointments.id, id));

    const committeeId = ('committeeId' in patch ? patch.committeeId : before.committeeId) as string | null;
    const incoming = ('employeeId' in patch ? patch.employeeId : before.employeeId) as string | null;
    await syncCommitteeSeat(
      c.env,
      committeeId,
      incoming,
      before.employeeId ?? null,
      ('roleOrTitle' in patch ? patch.roleOrTitle : before.roleOrTitle) as string | null,
      before.committeeId ?? null,
    );

    /**
     * Ending a post vacates its committee seat as well.
     *
     * `isActive` is what decides whether the post grants anything, and membership is
     * itself access (it implies the crm grants in rbac.ts) — so leaving the seat
     * behind would mean unticking Active withdrew some of the access and not the
     * rest, which is the worst of the three possible behaviours.
     */
    if ('isActive' in patch && patch.isActive === false && committeeId) {
      await vacateSeat(c.env, committeeId, incoming);
    }

    const handover = 'employeeId' in patch && (patch.employeeId ?? null) !== (before.employeeId ?? null);
    await logAudit(c.env, user.id, 'UPDATE', 'appointments', id, {
      ...patch,
      ...(handover ? { handover: { from: before.employeeId ?? null, to: patch.employeeId ?? null } } : {}),
    });
    return ok(c, { id, ...(handover ? { handover: true } : {}) });
  } catch (err) { return serverError(c, err); }
});

/**
 * GET /appointments/:id/impact
 *
 * What deleting this post would take with it. Read-only, and the thing the
 * confirmation screen is built from.
 *
 * It exists because `FOREIGN KEY constraint failed` is not an answer. That is what
 * this route used to return when a post owned anything, and it left the operator to
 * guess which of a dozen tables was holding on — so the honest options were to
 * refuse forever or to cascade blind. This is the third one: say exactly what goes,
 * what is merely released, and what is kept, then do precisely that.
 */
appointmentsRouter.get('/:id/impact', requireFeatureAccess('admin', 'appointments', 'delete'), async (c) => {
  try {
    const impact = await appointmentImpact(c.env, c.req.param('id')!);
    if (!impact) return notFound(c, 'Appointment not found');
    return ok(c, impact);
  } catch (err) { return serverError(c, err); }
});

/**
 * DELETE /appointments/:id           refuses while anything depends on the post
 * DELETE /appointments/:id?cascade=1 deletes it and everything in the impact report
 *
 * Two modes rather than one, because the cascade destroys tasks and cannot be
 * undone. The plain form stays the default and now names what is in the way and
 * where to go and look at it, instead of reporting a constraint error.
 *
 * It does NOT touch the holder's login in either mode. This used to deactivate the
 * account named by `appointments.account_id`, which meant ending one of somebody's
 * posts locked them out of the system entirely — with one login per person that is
 * unambiguously wrong, and the column it read is gone. A person is removed by
 * deleting the EMPLOYEE (`DELETE /api/core/employees/:id?cascade=1`), which is also
 * the only thing that removes a login.
 */
appointmentsRouter.delete('/:id', requireFeatureAccess('admin', 'appointments', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id')!;
    const cascade = c.req.query('cascade') === '1' || c.req.query('cascade') === 'true';

    const before = await db.query.appointments.findFirst({
      where: eq(schema.appointments.id, id),
      columns: { employeeId: true, committeeId: true, roleOrTitle: true },
    });
    if (!before) return notFound(c);

    const impact = await appointmentImpact(c.env, id);
    if (!impact) return notFound(c);

    if (!cascade) {
      // Everything that is not merely released has to go for the post to go.
      const holding = impact.items.filter((i) => i.fate === 'delete' || i.fate === 'detach');
      if (holding.length > 0) {
        return c.json({
          success: false,
          error: `${impact.label} still has ${holding.map((i) => `${i.count} ${i.label.toLowerCase()}`).join(', ')}. Review it at GET /api/appointments/${id}/impact, then repeat this request with ?cascade=1 to delete all of it.`,
          data: { impact },
        }, 409);
      }
    }

    const result = await deleteAppointment(c.env, id);
    if (!result) return notFound(c);

    // After the delete, so `vacateSeat` cannot see this appointment as a reason to
    // keep the seat.
    if (before.committeeId) await vacateSeat(c.env, before.committeeId, before.employeeId ?? null);

    await logAudit(c.env, user.id, 'DELETE', 'appointments', id, {
      roleOrTitle: before.roleOrTitle ?? null,
      holder: before.employeeId ?? null,
      cascade,
      ...result.summary,
      filesRemoved: result.filesRemoved,
    });
    return ok(c, { id, deleted: true, ...result });
  } catch (err: any) {
    if (err.message?.includes('FOREIGN KEY constraint failed')) {
      return serverError(c, new Error('Cannot delete appointment: something still references it that the impact report does not know about. Please report this — the report and the cascade are meant to agree.'));
    }
    return serverError(c, err);
  }
});

export default appointmentsRouter;
