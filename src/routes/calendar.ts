import { Hono } from 'hono';
import { eq, and, or, inArray } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { generateId } from '../utils/id';

const calendarRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/calendar/feed/:token
 * Public (via token) ICS feed for tasks and appointments.
 * Handles both plain token and token with .ics extension.
 */
calendarRouter.get('/feed/:token', async (c) => {
  const tokenParam = c.req.param('token');
  if (!tokenParam) {
    console.error('[calendar] Missing token parameter');
    return c.text('Token required', 400);
  }
  
  const token = tokenParam.replace('.ics', '');
  const db = getDb(c.env);

  // Find the user associated with this token
  const feed = await db.query.calendarFeeds.findFirst({
    where: eq(schema.calendarFeeds.token, token),
    with: { user: true }
  }) as any; // Cast to any or ensure relation type is handled

  if (!feed || !feed.user) {
    console.error(`[calendar] Invalid token or user missing for token: ${token}`);
    return c.text('Invalid calendar token or user missing', 404);
  }

  const userId = feed.userId;
  const employeeId = feed.user.employeeId;

  // Fetch tasks
  const tasks = employeeId 
    ? await db.query.universalTasks.findMany({
        where: eq(schema.universalTasks.assigneeId, employeeId)
      })
    : [];

  // Fetch appointments
  const appointments = await db.query.appointments.findMany({
    where: and(
      or(
        employeeId ? eq(schema.appointments.employeeId, employeeId) : undefined,
        eq(schema.appointments.accountId, userId)
      ),
      eq(schema.appointments.isActive, true)
    )
  });

  // Generate ICS
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//officeOS//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:officeOS - ' + (feed.user.name || feed.user.username),
    'X-WR-TIMEZONE:UTC',
    'X-WR-CALDESC:Tasks and Appointments for ' + (feed.user.name || feed.user.username),
  ];

  // Helper to format date for ICS (YYYYMMDD)
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return dateStr.replace(/-/g, '');
  };

  tasks.forEach(task => {
    if (!task.dueDate) return;
    const start = formatDate(new Date(task.createdAt).toISOString().split('T')[0]);
    const end = new Date(task.dueDate);
    end.setDate(end.getDate() + 1); // ICS DTEND is exclusive
    const endStr = formatDate(end.toISOString().split('T')[0]);
    
    if (!start || !endStr) return;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:task-${task.id}@officeos.org`);
    lines.push(`DTSTAMP:${new Date(task.createdAt).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${endStr}`);
    lines.push(`SUMMARY:[Task] ${task.title}`);
    lines.push(`DESCRIPTION:${task.description || ''}\\nStatus: ${task.status}\\nPriority: ${task.priority || 'N/A'}`);
    lines.push('END:VEVENT');
  });

  // Add Appointments as all-day events
  appointments.forEach(appt => {
    if (!appt.appointmentDate) return;
    const date = formatDate(appt.appointmentDate);
    if (!date) return;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:appt-${appt.id}@officeos.org`);
    lines.push(`DTSTAMP:${new Date(appt.createdAt).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
    lines.push(`DTSTART;VALUE=DATE:${date}`);
    lines.push(`SUMMARY:[Appt] ${appt.roleOrTitle}`);
    lines.push(`DESCRIPTION:Term: ${appt.termType || 'N/A'}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="calendar.ics"`,
      'Cache-Control': 'public, max-age=1800' // 30 minutes cache
    }
  });
});

export default calendarRouter;
