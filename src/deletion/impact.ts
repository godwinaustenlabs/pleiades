import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { chunk } from '../utils/batch';

/**
 * What deleting something takes with it, and then taking it.
 *
 * Two halves, deliberately in one file. `appointmentImpact`/`employeeImpact` READ
 * and describe; `deleteAppointment`/`deleteEmployee` write. They must agree — a
 * warning screen that under-reports is worse than no warning, because somebody
 * confirms a deletion believing it is smaller than it is — so each fate below is
 * named once, in `ImpactItem`, and the writer is derived from the same queries the
 * reader ran.
 *
 * Every dependency falls into one of four fates, and choosing among them is the
 * whole design:
 *
 *   delete   the row goes. Only for records that describe the relationship itself
 *            (an appointment's grants, an employee's attendance) and are
 *            meaningless without it.
 *   release  the row survives, pointed at nobody. An asset is not destroyed
 *            because the person holding it left; it goes back in the pool.
 *   detach   like release, but for something that then needs a new reader — a
 *            mailbox. See the note on `orphanedMailboxes`.
 *   keep     untouched, and listed anyway. A payroll record being deleted and a
 *            finance transaction being kept are both facts somebody needs before
 *            they press the button.
 *
 * What is never deleted: `audit_logs`. It has no foreign key into either table on
 * purpose, and the record of who deleted what must outlive the thing deleted.
 */

type Db = ReturnType<typeof getDb>;

export type Fate = 'delete' | 'release' | 'detach' | 'keep';

export type DownloadLink = {
  name: string;
  /** A path under /api/assets/download/, which the browser must authenticate to. */
  url: string;
};

export type ImpactItem = {
  /** Read by a person, not a table name. */
  label: string;
  count: number;
  fate: Fate;
  /** What actually happens, in one sentence. Shown next to the count. */
  note: string;
  /** A few examples, so a count of 14 is not a leap of faith. */
  examples?: string[];
  downloads?: DownloadLink[];
};

export type Impact = {
  kind: 'appointment' | 'employee' | 'mailbox';
  id: string;
  /** "Acquisition Manager" / "Zaid Burhan" — what the confirmation should name. */
  label: string;
  /**
   * Reasons this cannot be deleted at all, cascade or not. Non-empty means the
   * wizard shows them and offers no confirm button — a blocker is not a warning.
   */
  blockers: string[];
  items: ImpactItem[];
  /** Every file that is about to be destroyed, flattened for one-click download. */
  downloads: DownloadLink[];
  /** Nested reports for the posts an employee holds, so the total is inspectable. */
  appointments?: Impact[];
};

const assetUrl = (key: string) => `/api/assets/download/${key}`;

/** A stored url may already be a full download path or a bare R2 key. */
function toLink(name: string, stored: string | null | undefined): DownloadLink | null {
  if (!stored) return null;
  const url = stored.startsWith('/api/assets/download/') || stored.startsWith('http')
    ? stored
    : assetUrl(stored.replace(/^\/+/, ''));
  return { name, url };
}

/** The R2 key a download path points at, for actually removing the object. */
export function keyFromUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const marker = '/api/assets/download/';
  const i = stored.indexOf(marker);
  if (i >= 0) return decodeURIComponent(stored.slice(i + marker.length));
  if (stored.startsWith('http')) return null;
  return stored.replace(/^\/+/, '') || null;
}

const some = (xs: (string | null)[], n = 5) =>
  xs.filter((x): x is string => !!x).slice(0, n);

// ── Appointment ──────────────────────────────────────────────────────────────

/**
 * Everything an appointment owns.
 *
 * Read once and reused by both the report and the delete, so the two cannot
 * describe different sets.
 */
async function appointmentRows(db: Db, appointmentId: string) {
  const appointment = await db.query.appointments.findFirst({
    where: eq(schema.appointments.id, appointmentId),
    with: { employee: { columns: { id: true, name: true } } },
  });
  if (!appointment) return null;

  const grants = await db.query.appointmentAppPermissions.findMany({
    where: eq(schema.appointmentAppPermissions.appointmentId, appointmentId),
  });

  const tasks = await db.query.universalTasks.findMany({
    where: eq(schema.universalTasks.appointmentId, appointmentId),
    columns: { id: true, title: true, status: true, department: true },
  });

  const taskIds = tasks.map((t) => t.id);
  const attachments = taskIds.length > 0
    ? (await Promise.all(
        chunk(taskIds, 20).map((ids) =>
          db.query.taskAttachments.findMany({ where: inArray(schema.taskAttachments.taskId, ids) }),
        ),
      )).flat()
    : [];

  const assignments = taskIds.length > 0
    ? (await Promise.all(
        chunk(taskIds, 20).map((ids) =>
          db.query.taskAssignments.findMany({ where: inArray(schema.taskAssignments.taskId, ids) }),
        ),
      )).flat()
    : [];

  const mailboxes = await db.query.mailboxes.findMany({
    where: eq(schema.mailboxes.appointmentId, appointmentId),
  });

  return { appointment, grants, tasks, taskIds, attachments, assignments, mailboxes };
}

export async function appointmentImpact(env: Env, appointmentId: string): Promise<Impact | null> {
  const db = getDb(env);
  const rows = await appointmentRows(db, appointmentId);
  if (!rows) return null;

  const { appointment, grants, tasks, attachments, assignments, mailboxes } = rows;
  const items: ImpactItem[] = [];
  const downloads: DownloadLink[] = [];

  const holder = appointment.employee?.name ?? null;

  if (grants.length > 0) {
    items.push({
      label: 'Permissions this post grants',
      count: grants.length,
      fate: 'delete',
      note: holder
        ? `${holder} loses this access on their next request. Nothing granted to them personally is touched.`
        : 'Nobody holds this post, so nobody loses access.',
      examples: grants.map((g) => `${g.appName}/${g.feature}`).slice(0, 6),
    });
  }

  if (tasks.length > 0) {
    // Attachments are listed with the tasks rather than as a line of their own:
    // the reason to download them is that the task they belong to is going.
    for (const a of attachments) {
      const link = toLink(a.title, a.r2Key);
      if (link) downloads.push(link);
    }
    items.push({
      label: 'Tasks addressed to this post',
      count: tasks.length,
      fate: 'delete',
      note: `Deleted outright, with ${assignments.length} assignment(s) and ${attachments.length} attachment(s). To keep one, open it first and point it at another post or none.`,
      examples: some(tasks.map((t) => `${t.title} (${t.status})`)),
      downloads: attachments.map((a) => toLink(a.title, a.r2Key)).filter((l): l is DownloadLink => !!l),
    });
  }

  if (mailboxes.length > 0) {
    /**
     * A mailbox is NOT deleted with the post.
     *
     * It holds received correspondence, which is the one thing here that cannot be
     * reconstructed — and the person who wants the post gone is rarely the person
     * who knows whether the mail still matters. So it is detached and deactivated:
     * it stops sending, keeps everything it received, and becomes readable by
     * whoever holds `admin/mailboxes` (see `canUseMailbox`, which treats a post
     * mailbox with no post exactly as it treats a vacant one).
     */
    items.push({
      label: 'Mailbox attached to this post',
      count: mailboxes.length,
      fate: 'detach',
      note: 'Kept and switched off, not deleted — it holds received mail. It stops sending and becomes readable by mailbox administrators. Export it below first if anybody still needs it.',
      examples: mailboxes.map((m) => m.address),
      downloads: mailboxes.map((m) => ({
        name: `${m.address} (mbox export)`,
        url: `/api/email/export?mailboxId=${encodeURIComponent(m.id)}`,
      })),
    });
    for (const m of mailboxes) {
      downloads.push({ name: `${m.address} (mbox export)`, url: `/api/email/export?mailboxId=${encodeURIComponent(m.id)}` });
    }
  }

  if (appointment.committeeId && appointment.employeeId) {
    items.push({
      label: 'Committee seat this post carries',
      count: 1,
      fate: 'release',
      note: `${holder ?? 'The holder'} leaves the committee, unless another active post of theirs also sits on it. Committee membership grants the CRM workspace, so this is access too.`,
    });
  }

  return {
    kind: 'appointment',
    id: appointmentId,
    label: appointment.roleOrTitle || 'Untitled post',
    blockers: [],
    items,
    downloads,
  };
}

/** The writes that delete one appointment. Returns R2 keys to remove after they commit. */
async function appointmentDeletions(db: Db, appointmentId: string): Promise<{ writes: unknown[]; r2Keys: string[]; summary: Record<string, number> } | null> {
  const rows = await appointmentRows(db, appointmentId);
  if (!rows) return null;
  const { appointment, grants, tasks, taskIds, attachments, mailboxes } = rows;

  const writes: unknown[] = [];
  const r2Keys: string[] = [];

  for (const ids of chunk(taskIds, 20)) {
    writes.push(db.delete(schema.taskAssignments).where(inArray(schema.taskAssignments.taskId, ids)));
    writes.push(db.delete(schema.taskAttachments).where(inArray(schema.taskAttachments.taskId, ids)));
    writes.push(db.delete(schema.universalTasks).where(inArray(schema.universalTasks.id, ids)));
  }
  for (const a of attachments) {
    const k = keyFromUrl(a.r2Key);
    if (k) r2Keys.push(k);
  }

  // Detached and switched off, never deleted — see the note in appointmentImpact.
  for (const m of mailboxes) {
    writes.push(
      db.update(schema.mailboxes)
        .set({ appointmentId: null, isActive: false, updatedAt: new Date() })
        .where(eq(schema.mailboxes.id, m.id)),
    );
  }

  writes.push(
    db.delete(schema.appointmentAppPermissions)
      .where(eq(schema.appointmentAppPermissions.appointmentId, appointmentId)),
  );
  writes.push(db.delete(schema.appointments).where(eq(schema.appointments.id, appointmentId)));

  return {
    writes,
    r2Keys,
    summary: {
      grants: grants.length,
      tasks: tasks.length,
      taskAttachments: attachments.length,
      mailboxesDetached: mailboxes.length,
    },
  };
}

// ── Employee ─────────────────────────────────────────────────────────────────

async function employeeRows(db: Db, employeeId: string) {
  const employee = await db.query.employees.findFirst({
    where: eq(schema.employees.id, employeeId),
  });
  if (!employee) return null;

  const login = await db.query.usersLogins.findFirst({
    where: eq(schema.usersLogins.employeeId, employeeId),
    columns: { id: true, email: true, username: true, isSuperadmin: true },
  });

  const [
    appointments, assets, employeeDocs, attendance, leaveRequests, leaveBalances,
    payroll, salaryStructures, salaryRevisions, loans, reviews, legalTracker,
    labMemberships, committeeSeats, taskAssignments, workDays, timeEntries,
  ] = await Promise.all([
    db.query.appointments.findMany({ where: eq(schema.appointments.employeeId, employeeId), columns: { id: true, roleOrTitle: true, isActive: true } }),
    db.query.assets.findMany({ where: eq(schema.assets.assignedTo, employeeId), columns: { id: true, assetName: true, assetType: true } }),
    db.query.employeeDocuments.findMany({ where: eq(schema.employeeDocuments.employeeId, employeeId) }),
    db.query.attendance.findMany({ where: eq(schema.attendance.employeeId, employeeId), columns: { id: true, date: true } }),
    db.query.leaveRequests.findMany({ where: eq(schema.leaveRequests.employeeId, employeeId), columns: { id: true, leaveType: true, startDate: true } }),
    db.query.leaveBalances.findMany({ where: eq(schema.leaveBalances.employeeId, employeeId), columns: { id: true, leaveType: true } }),
    db.query.payrollRecords.findMany({ where: eq(schema.payrollRecords.employeeId, employeeId), columns: { id: true, payrollMonth: true, netPay: true, financeReference: true } }),
    db.query.salaryStructures.findMany({ where: eq(schema.salaryStructures.employeeId, employeeId), columns: { id: true, baseSalary: true } }),
    db.query.salaryRevisions.findMany({ where: eq(schema.salaryRevisions.employeeId, employeeId), columns: { id: true } }),
    db.query.loans.findMany({ where: eq(schema.loans.employeeId, employeeId), columns: { id: true, remainingBalance: true, status: true } }),
    db.query.performanceReviews.findMany({ where: eq(schema.performanceReviews.employeeId, employeeId), columns: { id: true, reviewPeriod: true } }),
    db.query.legalTracker.findMany({ where: eq(schema.legalTracker.employeeId, employeeId), columns: { id: true, contractType: true } }),
    db.query.employeeLab.findMany({ where: eq(schema.employeeLab.employeeId, employeeId) }),
    db.query.committeeMembers.findMany({ where: eq(schema.committeeMembers.employeeId, employeeId) }),
    db.query.taskAssignments.findMany({ where: eq(schema.taskAssignments.employeeId, employeeId), columns: { id: true, taskId: true } }),
    db.query.workDays.findMany({ where: eq(schema.workDays.employeeId, employeeId), columns: { id: true } }),
    db.query.timeEntries.findMany({ where: eq(schema.timeEntries.employeeId, employeeId), columns: { id: true, taskId: true } }),
  ]);

  /**
   * Places this person is named on SOMEBODY ELSE's record: the reviewer of a
   * review, the approver of a leave request, the lead of a lab. Those rows are
   * other people's history and are kept — only the name is cleared.
   */
  const [reviewedByThem, approvedLeave, approvedRevisions, ledLabs, headedSectors, crmTickets, uploadedDocs, reports, ticketNotes] = await Promise.all([
    db.query.performanceReviews.findMany({ where: eq(schema.performanceReviews.reviewerId, employeeId), columns: { id: true } }),
    db.query.leaveRequests.findMany({ where: eq(schema.leaveRequests.approvedBy, employeeId), columns: { id: true } }),
    db.query.salaryRevisions.findMany({ where: eq(schema.salaryRevisions.approvedBy, employeeId), columns: { id: true } }),
    db.query.labs.findMany({ where: eq(schema.labs.opsLeadId, employeeId), columns: { id: true, labName: true } }),
    db.query.sectors.findMany({ where: eq(schema.sectors.headEmployeeId, employeeId), columns: { id: true, sectorName: true } }),
    db.query.crmTickets.findMany({ where: eq(schema.crmTickets.assignedTo, employeeId), columns: { id: true, title: true } }),
    db.query.companyDocuments.findMany({ where: eq(schema.companyDocuments.uploadedBy, employeeId), columns: { id: true, title: true } }),
    db.query.employees.findMany({ where: eq(schema.employees.reportingManagerId, employeeId), columns: { id: true, name: true } }),
    login
      ? db.query.crmTicketNotes.findMany({ where: eq(schema.crmTicketNotes.authorId, login.id), columns: { id: true } })
      : Promise.resolve([]),
  ]);

  const structureIds = salaryStructures.map((s) => s.id);
  const salaryComponents = structureIds.length > 0
    ? (await Promise.all(
        chunk(structureIds, 20).map((ids) =>
          db.query.salaryComponents.findMany({ where: inArray(schema.salaryComponents.structureId, ids) }),
        ),
      )).flat()
    : [];

  return {
    employee, login, appointments, assets, employeeDocs, attendance, leaveRequests,
    leaveBalances, payroll, salaryStructures, salaryComponents, salaryRevisions, loans,
    reviews, legalTracker, labMemberships, committeeSeats, taskAssignments, workDays, timeEntries,
    reviewedByThem, approvedLeave, approvedRevisions, ledLabs, headedSectors,
    crmTickets, uploadedDocs, reports, ticketNotes,
  };
}

export async function employeeImpact(
  env: Env,
  employeeId: string,
  actor: { id: string; canDeleteLogins: boolean },
): Promise<Impact | null> {
  const db = getDb(env);
  const rows = await employeeRows(db, employeeId);
  if (!rows) return null;

  const r = rows;
  const items: ImpactItem[] = [];
  const downloads: DownloadLink[] = [];
  const blockers: string[] = [];

  /**
   * Three refusals, and none of them is a warning.
   *
   * A superadmin's account is a direct database operation everywhere else in this
   * system and must be here too. Deleting your own record signs you out mid-cascade
   * with no way to finish it. And the login is an `admin/users` object, so removing
   * one needs that grant even though the employee record needs `core/employees` —
   * otherwise `core/employees` delete quietly becomes the ability to delete accounts.
   */
  if (r.login?.isSuperadmin) {
    blockers.push(`${r.employee.name} signs in as a superadmin (${r.login.email}). A superadmin account is removed by direct database access only.`);
  }
  if (r.login && r.login.id === actor.id) {
    blockers.push('This is your own record. Deleting it would sign you out part-way through the cascade.');
  }
  if (r.login && !actor.canDeleteLogins) {
    blockers.push(`${r.employee.name} has a login (${r.login.email}). Deleting an account needs the admin/users delete permission as well as this one.`);
  }

  const nested: Impact[] = [];
  for (const a of r.appointments) {
    const sub = await appointmentImpact(env, a.id);
    if (sub) {
      nested.push(sub);
      downloads.push(...sub.downloads);
    }
  }

  if (r.appointments.length > 0) {
    items.push({
      label: 'Posts they hold',
      count: r.appointments.length,
      fate: 'delete',
      note: 'Each is deleted with everything it owns — expand below for what that is. To keep a post and hand it on, reassign it to somebody else first.',
      examples: some(r.appointments.map((a) => `${a.roleOrTitle}${a.isActive ? '' : ' (ended)'}`)),
    });
  }

  if (r.login) {
    items.push({
      label: 'Their login',
      count: 1,
      fate: 'delete',
      note: `${r.login.email} stops working immediately. Their personal mailbox is kept and switched off, not deleted. Anything they created — documents, notes, tasks — survives, but stops naming them as the author.`,
      examples: [r.login.email],
    });
  }

  if (r.assets.length > 0) {
    items.push({
      label: 'Assets in their custody',
      count: r.assets.length,
      fate: 'release',
      note: 'Returned to the pool, not deleted — marked Available and assigned to nobody. The register keeps its purchase cost and depreciation.',
      examples: some(r.assets.map((a) => `${a.assetName} (${a.assetType})`)),
    });
  }

  if (r.employeeDocs.length > 0) {
    const links = r.employeeDocs
      .map((d) => toLink(`${d.documentType} — ${r.employee.name}`, d.url))
      .filter((l): l is DownloadLink => !!l);
    downloads.push(...links);
    items.push({
      label: 'Their personal documents',
      count: r.employeeDocs.length,
      fate: 'delete',
      note: 'Deleted, and the files themselves are removed from storage. These are things like a CNIC scan or a signed contract — download them now if the company has to retain them, because this cannot be undone.',
      examples: some(r.employeeDocs.map((d) => d.documentType)),
      downloads: links,
    });
  }

  if (r.payroll.length > 0) {
    const referenced = r.payroll.filter((p) => p.financeReference).length;
    items.push({
      label: 'Payroll records',
      count: r.payroll.length,
      fate: 'delete',
      note: `The company's own record of what this person was paid. ${referenced} of them name a finance transaction; those transactions are NOT deleted and will simply no longer point back at a payslip.`,
      examples: some(r.payroll.map((p) => `${p.payrollMonth} — ${p.netPay ?? '?'}`)),
    });
  }

  const openLoans = r.loans.filter((l) => l.status !== 'Paid');
  if (r.loans.length > 0) {
    items.push({
      label: 'Loans',
      count: r.loans.length,
      fate: 'delete',
      note: openLoans.length > 0
        ? `${openLoans.length} still outstanding, totalling ${openLoans.reduce((n, l) => n + (l.remainingBalance || 0), 0)}. Deleting the record does not settle the debt — write it off in Finance first if that is what you mean.`
        : 'All settled.',
    });
  }

  const hrRecords: [string, number][] = [
    ['Attendance days (before time logging)', r.attendance.length],
    // A person's logged time is theirs alone, so it goes with them — and with it
    // their share of every task it was on. The tasks themselves are untouched.
    ['Days of logged time', r.workDays.length],
    ['Logged time entries', r.timeEntries.length],
    ['Leave requests', r.leaveRequests.length],
    ['Leave balances', r.leaveBalances.length],
    ['Salary structures', r.salaryStructures.length + r.salaryComponents.length],
    ['Salary revisions', r.salaryRevisions.length],
    ['Performance reviews', r.reviews.length],
    ['Contracts on the legal tracker', r.legalTracker.length],
    ['Lab memberships', r.labMemberships.length],
    ['Committee seats', r.committeeSeats.length],
    ['Task assignments', r.taskAssignments.length],
  ];
  const hrTotal = hrRecords.reduce((n, [, c]) => n + c, 0);
  if (hrTotal > 0) {
    items.push({
      label: 'Their HR history',
      count: hrTotal,
      fate: 'delete',
      note: 'Records that exist only to describe this person and mean nothing without them. Task assignments go, but the tasks themselves stay — a task with no assignee is still the department’s work.',
      examples: hrRecords.filter(([, c]) => c > 0).map(([label, c]) => `${label}: ${c}`),
    });
  }

  const mentions: [string, number, string][] = [
    ['Reviews they wrote', r.reviewedByThem.length, 'kept, reviewer left blank'],
    ['Leave they approved', r.approvedLeave.length, 'kept, approver left blank'],
    ['Salary revisions they approved', r.approvedRevisions.length, 'kept, approver left blank'],
    ['Labs they lead', r.ledLabs.length, 'kept, no ops lead until you set one'],
    ['Sectors they head', r.headedSectors.length, 'kept, no head until you set one'],
    ['CRM tickets assigned to them', r.crmTickets.length, 'kept, unassigned'],
    ['Company documents they uploaded', r.uploadedDocs.length, 'kept, uploader left blank'],
    ['People reporting to them', r.reports.length, 'kept, no manager until you set one'],
    ['Notes they wrote on support tickets', r.ticketNotes.length, 'kept, author left blank'],
  ];
  const mentionTotal = mentions.reduce((n, [, c]) => n + c, 0);
  if (mentionTotal > 0) {
    items.push({
      label: 'Places they are named on somebody else’s record',
      count: mentionTotal,
      fate: 'release',
      note: 'None of these rows is deleted — they are other people’s history. Only the reference to this person is cleared, so somebody will need to fill the gaps in.',
      examples: mentions.filter(([, c]) => c > 0).map(([label, c, what]) => `${label}: ${c} — ${what}`),
    });
  }

  if (r.employee.profilePhoto) {
    const link = toLink(`Profile photo — ${r.employee.name}`, r.employee.profilePhoto);
    if (link) downloads.push(link);
  }

  items.push({
    label: 'The audit log',
    count: 0,
    fate: 'keep',
    note: 'Never touched. Everything this person did, and this deletion itself, stays on the record — which is the point of it not having a foreign key into either table.',
  });

  return {
    kind: 'employee',
    id: employeeId,
    label: r.employee.name,
    blockers,
    items,
    downloads,
    appointments: nested,
  };
}

// ── Execution ────────────────────────────────────────────────────────────────

export type CascadeResult = { summary: Record<string, number>; filesRemoved: number };

/**
 * Removes R2 objects, after the database writes have committed.
 *
 * In this order because the reverse cannot be undone: a failed batch with the files
 * already gone leaves rows pointing at nothing. Failures here are logged and
 * swallowed — the deletion has happened, and throwing would report it as failed.
 */
async function removeObjects(env: Env, keys: string[]): Promise<number> {
  let removed = 0;
  if (!env.CRM_BUCKET) return 0;
  for (const key of [...new Set(keys)].filter(Boolean)) {
    try {
      await env.CRM_BUCKET!.delete(key);
      removed++;
    } catch (err) {
      console.error(`[deletion] could not remove ${key}:`, err);
    }
  }
  return removed;
}

/**
 * One `db.batch`, so a cascade is all-or-nothing.
 *
 * D1 applies a batch in a single transaction. Half of this applied would be worse
 * than none of it: an employee whose grants are gone and whose appointments remain
 * is somebody who cannot work and cannot be cleaned up either.
 */
async function commit(db: Db, writes: unknown[]): Promise<void> {
  const real = writes.filter(Boolean);
  if (real.length === 0) return;
  // `batch` is typed as a non-empty tuple, which a built-up array cannot satisfy
  // statically; the length check above is the guarantee the type wants.
  await db.batch(real as unknown as [never, ...never[]]);
}

export async function deleteAppointment(env: Env, appointmentId: string): Promise<CascadeResult | null> {
  const db = getDb(env);
  const plan = await appointmentDeletions(db, appointmentId);
  if (!plan) return null;

  await commit(db, plan.writes);
  const filesRemoved = await removeObjects(env, plan.r2Keys);
  return { summary: plan.summary, filesRemoved };
}

export async function deleteEmployee(env: Env, employeeId: string): Promise<CascadeResult | null> {
  const db = getDb(env);
  const rows = await employeeRows(db, employeeId);
  if (!rows) return null;
  const r = rows;

  const r2Keys: string[] = [];
  const summary: Record<string, number> = {};

  /**
   * The posts go first, each through its own cascade, so there is exactly one
   * description of what deleting a post means. Their writes are committed
   * separately from the employee's: a single batch spanning both would be one
   * enormous statement list, and each appointment is independently coherent — a
   * post deleted and then a failure leaves a consistent database, just an
   * unfinished job.
   */
  let posts = 0;
  for (const a of r.appointments) {
    const done = await deleteAppointment(env, a.id);
    if (done) {
      posts++;
      for (const [k, v] of Object.entries(done.summary)) summary[k] = (summary[k] ?? 0) + v;
    }
  }
  summary.appointments = posts;

  const writes: unknown[] = [];

  // ── Things that are only this person ──────────────────────────────────────
  for (const ids of chunk(r.salaryStructures.map((s) => s.id), 20)) {
    writes.push(db.delete(schema.salaryComponents).where(inArray(schema.salaryComponents.structureId, ids)));
  }
  writes.push(db.delete(schema.salaryStructures).where(eq(schema.salaryStructures.employeeId, employeeId)));
  writes.push(db.delete(schema.salaryRevisions).where(eq(schema.salaryRevisions.employeeId, employeeId)));
  writes.push(db.delete(schema.payrollRecords).where(eq(schema.payrollRecords.employeeId, employeeId)));
  writes.push(db.delete(schema.loans).where(eq(schema.loans.employeeId, employeeId)));
  writes.push(db.delete(schema.attendance).where(eq(schema.attendance.employeeId, employeeId)));
  // Entries before days: time_entries.work_day_id references work_days.
  writes.push(db.delete(schema.timeEntries).where(eq(schema.timeEntries.employeeId, employeeId)));
  writes.push(db.delete(schema.workDays).where(eq(schema.workDays.employeeId, employeeId)));
  writes.push(db.delete(schema.leaveRequests).where(eq(schema.leaveRequests.employeeId, employeeId)));
  writes.push(db.delete(schema.leaveBalances).where(eq(schema.leaveBalances.employeeId, employeeId)));
  writes.push(db.delete(schema.performanceReviews).where(eq(schema.performanceReviews.employeeId, employeeId)));
  writes.push(db.delete(schema.legalTracker).where(eq(schema.legalTracker.employeeId, employeeId)));
  writes.push(db.delete(schema.employeeLab).where(eq(schema.employeeLab.employeeId, employeeId)));
  writes.push(db.delete(schema.committeeMembers).where(eq(schema.committeeMembers.employeeId, employeeId)));
  writes.push(db.delete(schema.taskAssignments).where(eq(schema.taskAssignments.employeeId, employeeId)));
  writes.push(db.delete(schema.employeeDocuments).where(eq(schema.employeeDocuments.employeeId, employeeId)));
  for (const d of r.employeeDocs) {
    const k = keyFromUrl(d.url);
    if (k) r2Keys.push(k);
  }
  const photo = keyFromUrl(r.employee.profilePhoto);
  if (photo) r2Keys.push(photo);

  // ── Somebody else's records that merely name them ────────────────────────
  writes.push(db.update(schema.assets).set({ assignedTo: null, status: 'Available', updatedAt: new Date() }).where(eq(schema.assets.assignedTo, employeeId)));
  // Nullable since 0048. It was NOT NULL, so this cascade used to fail outright the
  // first time it met somebody who had ever reviewed a colleague.
  writes.push(db.update(schema.performanceReviews).set({ reviewerId: null }).where(eq(schema.performanceReviews.reviewerId, employeeId)));
  writes.push(db.update(schema.leaveRequests).set({ approvedBy: null }).where(eq(schema.leaveRequests.approvedBy, employeeId)));
  writes.push(db.update(schema.salaryRevisions).set({ approvedBy: null }).where(eq(schema.salaryRevisions.approvedBy, employeeId)));
  writes.push(db.update(schema.labs).set({ opsLeadId: null, updatedAt: new Date() }).where(eq(schema.labs.opsLeadId, employeeId)));
  writes.push(db.update(schema.sectors).set({ headEmployeeId: null }).where(eq(schema.sectors.headEmployeeId, employeeId)));
  writes.push(db.update(schema.crmTickets).set({ assignedTo: null }).where(eq(schema.crmTickets.assignedTo, employeeId)));
  writes.push(db.update(schema.companyDocuments).set({ uploadedBy: null }).where(eq(schema.companyDocuments.uploadedBy, employeeId)));
  writes.push(db.update(schema.employees).set({ reportingManagerId: null, updatedAt: new Date() }).where(eq(schema.employees.reportingManagerId, employeeId)));

  // ── The login ─────────────────────────────────────────────────────────────
  if (r.login) {
    const uid = r.login.id;
    // Attribution is cleared, content is kept: a CRM document does not stop
    // existing because the person who uploaded it left the company.
    writes.push(db.update(schema.universalTasks).set({ creatorId: null }).where(eq(schema.universalTasks.creatorId, uid)));
    writes.push(db.update(schema.taskAttachments).set({ uploadedById: null }).where(eq(schema.taskAttachments.uploadedById, uid)));
    writes.push(db.update(schema.crmDocuments).set({ uploadedById: null }).where(eq(schema.crmDocuments.uploadedById, uid)));
    writes.push(db.update(schema.crmPlannerEvents).set({ createdById: null }).where(eq(schema.crmPlannerEvents.createdById, uid)));
    // Nullable since 0048. It was NOT NULL, which meant deleting a leaver's
    // account required destroying their half of live support conversations.
    writes.push(db.update(schema.crmTicketNotes).set({ authorId: null }).where(eq(schema.crmTicketNotes.authorId, uid)));
    writes.push(db.update(schema.emailMessages).set({ createdBy: null }).where(eq(schema.emailMessages.createdBy, uid)));
    writes.push(db.update(schema.emailTemplates).set({ updatedBy: null }).where(eq(schema.emailTemplates.updatedBy, uid)));
    writes.push(db.update(schema.appMessages).set({ senderId: null }).where(eq(schema.appMessages.senderId, uid)));
    writes.push(db.update(schema.mailboxes).set({ createdBy: null }).where(eq(schema.mailboxes.createdBy, uid)));

    /**
     * Their personal mailbox: detached and switched off, exactly as a post's is.
     * Deleting it would destroy received mail, which is the one thing in here that
     * cannot be reconstructed — and somebody usually needs the leaver's inbox for
     * a while after they go.
     */
    writes.push(
      db.update(schema.mailboxes)
        .set({ ownerUserId: null, isActive: false, updatedAt: new Date() })
        .where(eq(schema.mailboxes.ownerUserId, uid)),
    );

    // Rows that are only the account.
    writes.push(db.delete(schema.userAppPermissions).where(eq(schema.userAppPermissions.userId, uid)));
    writes.push(db.delete(schema.mailboxGrants).where(eq(schema.mailboxGrants.userId, uid)));
    writes.push(db.update(schema.mailboxGrants).set({ createdBy: null }).where(eq(schema.mailboxGrants.createdBy, uid)));
    writes.push(db.delete(schema.emailPrefs).where(eq(schema.emailPrefs.userId, uid)));
    writes.push(db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, uid)));
    writes.push(db.delete(schema.calendarFeeds).where(eq(schema.calendarFeeds.userId, uid)));
    writes.push(db.delete(schema.userDashboardState).where(eq(schema.userDashboardState.userId, uid)));
    writes.push(db.delete(schema.userNotes).where(eq(schema.userNotes.userId, uid)));
    writes.push(db.delete(schema.userNotifications).where(eq(schema.userNotifications.userId, uid)));
    // An agent borrows a person's permissions. With the person gone, the key must
    // stop working rather than keep acting as an account that no longer exists.
    writes.push(db.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, uid)));
    writes.push(db.delete(schema.userOwnership).where(eq(schema.userOwnership.userId, uid)));
    // Accounts this person provisioned would otherwise reference a deleted owner.
    writes.push(db.delete(schema.userOwnership).where(eq(schema.userOwnership.ownerUserId, uid)));
    writes.push(db.update(schema.usersLogins).set({ createdByUserId: null as unknown as string }).where(eq(schema.usersLogins.createdByUserId, uid)));
    writes.push(db.delete(schema.usersLogins).where(eq(schema.usersLogins.id, uid)));
    summary.login = 1;
  }

  writes.push(db.delete(schema.employees).where(eq(schema.employees.id, employeeId)));

  await commit(db, writes);
  const filesRemoved = await removeObjects(env, r2Keys);

  summary.assetsReleased = r.assets.length;
  summary.documentsDeleted = r.employeeDocs.length;
  summary.payrollRecords = r.payroll.length;
  return { summary, filesRemoved };
}

// ── Mailbox ──────────────────────────────────────────────────────────────────

/**
 * Everything a mailbox owns. Read once and shared by the report and the purge.
 *
 * Deleting a mailbox is the most destructive thing in this module, and the only one
 * where "keep it, switched off" is usually the right answer: `is_active = 0` stops it
 * sending while leaving what it received readable, which is what turning a mailbox
 * off should mean. The purge exists because "off forever" is not the same as "gone",
 * and an operator who has finished with an address should not have to keep its mail
 * in the list to be sure it stays unreachable.
 */
async function mailboxRows(db: Db, mailboxId: string) {
  const mailbox = await db.query.mailboxes.findFirst({
    where: eq(schema.mailboxes.id, mailboxId),
  });
  if (!mailbox) return null;

  const messages = await db.query.emailMessages.findMany({
    where: eq(schema.emailMessages.mailboxId, mailboxId),
    columns: { id: true, subject: true, direction: true, folder: true, rawKey: true, createdAt: true },
  });
  const messageIds = messages.map((m) => m.id);

  const attachments = messageIds.length > 0
    ? (await Promise.all(
        chunk(messageIds, 20).map((ids) =>
          db.query.emailAttachments.findMany({ where: inArray(schema.emailAttachments.messageId, ids) }),
        ),
      )).flat()
    : [];

  const threads = await db.query.emailThreads.findMany({
    where: eq(schema.emailThreads.mailboxId, mailboxId),
    columns: { id: true, subject: true },
  });

  const grants = await db.query.mailboxGrants.findMany({
    where: eq(schema.mailboxGrants.mailboxId, mailboxId),
  });

  // An alias has no storage of its own, so one pointing here is meaningless
  // afterwards — but it is still a live address that mail arrives at, so it has to
  // be named rather than silently dropped.
  const aliases = await db.query.mailboxes.findMany({
    where: eq(schema.mailboxes.forwardsToMailboxId, mailboxId),
    columns: { id: true, address: true },
  });

  return { mailbox, messages, messageIds, attachments, threads, grants, aliases };
}

export async function mailboxImpact(env: Env, mailboxId: string): Promise<Impact | null> {
  const db = getDb(env);
  const rows = await mailboxRows(db, mailboxId);
  if (!rows) return null;
  const { mailbox, messages, attachments, threads, grants, aliases } = rows;

  const items: ImpactItem[] = [];
  const downloads: DownloadLink[] = [];
  const blockers: string[] = [];

  /**
   * The machine identity every automated message sends as. Deleting it would break
   * password resets and task notifications, which fail by not arriving.
   */
  if (mailbox.kind === 'system') {
    blockers.push(`${mailbox.address} is the system mailbox. Every automated message sends as it — a password reset, a task notification — and those fail silently if it is gone.`);
  }

  if (messages.length > 0) {
    // Offered before the confirm, because this is the one part of any deletion in
    // this system that cannot be reconstructed from anywhere else: Email Routing
    // keeps no copy, so what is here IS the company's record of this correspondence.
    downloads.push({
      name: `${mailbox.address} — everything, as mbox`,
      url: `/api/email/export?mailboxId=${encodeURIComponent(mailbox.id)}`,
    });
    items.push({
      label: 'Stored messages',
      count: messages.length,
      fate: 'delete',
      note: 'Deleted outright, both directions, every folder — and Cloudflare Email Routing keeps no copy, so this is the only record of them that exists. Export the mbox below first unless you are certain.',
      examples: some(messages.slice(0, 5).map((m) => `${m.direction === 'inbound' ? 'from' : 'to'} · ${m.subject || '(no subject)'}`)),
      downloads: [{ name: `${mailbox.address} — mbox export`, url: `/api/email/export?mailboxId=${encodeURIComponent(mailbox.id)}` }],
    });
  }

  if (attachments.length > 0) {
    const links = attachments
      .map((a) => toLink(a.filename, a.r2Key))
      .filter((l): l is DownloadLink => !!l);
    downloads.push(...links);
    items.push({
      label: 'Attachments',
      count: attachments.length,
      fate: 'delete',
      note: 'The files themselves are removed from storage, along with the raw copy of every message. Download anything that has to be retained.',
      examples: some(attachments.map((a) => a.filename)),
      downloads: links,
    });
  }

  if (threads.length > 0) {
    items.push({
      label: 'Conversations',
      count: threads.length,
      fate: 'delete',
      note: 'The threads these messages were grouped into. Nothing outside this mailbox references them.',
    });
  }

  if (grants.length > 0) {
    items.push({
      label: 'Per-person access rows',
      count: grants.length,
      fate: 'delete',
      note: 'The list that narrowed who could open this mailbox. It describes nothing else.',
    });
  }

  if (aliases.length > 0) {
    items.push({
      label: 'Aliases delivering into it',
      count: aliases.length,
      fate: 'delete',
      note: 'An alias has no storage of its own, so one pointing at a mailbox that is gone would accept mail and drop it. These are deleted too — recreate them against another mailbox if the addresses are still wanted.',
      examples: aliases.map((a) => a.address),
    });
  }

  items.push({
    label: 'Mail that arrives later',
    count: 0,
    fate: 'keep',
    note: `Nothing is routed away. Once ${mailbox.address} has no mailbox, mail to it lands in the catch-all and shows under HQ → Unrouted, the same as any address nobody created.`,
  });

  return {
    kind: 'mailbox',
    id: mailboxId,
    label: mailbox.address,
    blockers,
    items,
    downloads,
  };
}

/** Permanently removes a mailbox and everything stored against it. */
export async function deleteMailbox(env: Env, mailboxId: string): Promise<CascadeResult | null> {
  const db = getDb(env);
  const rows = await mailboxRows(db, mailboxId);
  if (!rows) return null;
  const { mailbox, messages, messageIds, attachments, threads, grants, aliases } = rows;
  if (mailbox.kind === 'system') return null;

  const writes: unknown[] = [];
  const r2Keys: string[] = [];

  for (const ids of chunk(messageIds, 20)) {
    writes.push(db.delete(schema.emailDelivery).where(inArray(schema.emailDelivery.messageId, ids)));
    writes.push(db.delete(schema.emailAttachments).where(inArray(schema.emailAttachments.messageId, ids)));
  }
  // The raw MIME and every attachment. Both live under prefixes that `/api/assets`
  // refuses to upload into, so nothing else can be pointing at them.
  for (const a of attachments) {
    const k = keyFromUrl(a.r2Key);
    if (k) r2Keys.push(k);
  }
  for (const m of messages) {
    const k = keyFromUrl(m.rawKey);
    if (k) r2Keys.push(k);
  }

  writes.push(db.delete(schema.emailMessages).where(eq(schema.emailMessages.mailboxId, mailboxId)));
  writes.push(db.delete(schema.emailThreads).where(eq(schema.emailThreads.mailboxId, mailboxId)));
  writes.push(db.delete(schema.mailboxGrants).where(eq(schema.mailboxGrants.mailboxId, mailboxId)));

  // Aliases first: they hold a foreign key into the row about to go.
  for (const alias of aliases) {
    writes.push(db.delete(schema.mailboxGrants).where(eq(schema.mailboxGrants.mailboxId, alias.id)));
    writes.push(db.delete(schema.mailboxes).where(eq(schema.mailboxes.id, alias.id)));
  }
  writes.push(db.delete(schema.mailboxes).where(eq(schema.mailboxes.id, mailboxId)));

  await commit(db, writes);
  const filesRemoved = await removeObjects(env, r2Keys);

  return {
    summary: {
      messages: messages.length,
      threads: threads.length,
      attachments: attachments.length,
      grants: grants.length,
      aliases: aliases.length,
    },
    filesRemoved,
  };
}
