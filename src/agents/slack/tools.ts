import { z } from 'zod';
import { tool } from 'ai';

/** Calls back into this Worker's own API as the resolved user. */
export type ApiCaller = (method: string, path: string, body?: unknown) => Promise<string>;

/**
 * The agent's tool surface.
 *
 * Every tool goes through `callApi`, which routes back through the Worker's own
 * Hono app with the internal actor header — so a tool call passes the same
 * authMiddleware -> requireAppAccess -> requireFeatureAccess chain a browser
 * request does. There is deliberately no direct database access here: that is
 * the rule SECURITY.md sets out for agent tools, and it is why the agent can
 * never read more than the person it is acting for.
 */
/**
 * A repeating task's rule, exactly as `POST /api/tasks` takes it (see
 * src/tasks/recurrence.ts). The model fills in a schedule; the server decides what
 * it means — the agent never does date arithmetic, it reads back `summary`.
 */
const recurrenceSchema = z.object({
  frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly']),
  interval: z.number().int().min(1).optional().describe('Every N hours/days/weeks/months. Default 1.'),
  weekdays: z.array(z.number().int().min(0).max(6)).optional()
    .describe('Weekly only. 0=Sunday … 6=Saturday, e.g. [1,3,5] for Mon/Wed/Fri. Default: the start date\'s weekday.'),
  monthDay: z.number().int().min(1).max(31).optional()
    .describe('Monthly only. Day of the month; 29–31 fall on the last day of shorter months. Default: the start date\'s day.'),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe('24-hour HH:MM. Default 09:00.'),
  timezone: z.string().optional().describe('IANA zone, e.g. Asia/Karachi. Default Asia/Karachi.'),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD. Usually today.'),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD, inclusive. Omit to repeat indefinitely.'),
});

export const buildTools = (callApi: ApiCaller) => ({
  get_employee_info: tool({
    description: 'Fetches employee records. Use slack_id to find a specific person or filter by department.',
    inputSchema: z.object({
          slack_id: z.string().optional().describe('Slack ID (starts with U)'),
          employee_id: z.string().optional().describe('Internal employee ID (starts with emp_)'),
          department: z.string().optional().describe('Filter by department name')
        }),
    execute: async (args: any) => {
        let url = '/api/core/employees';
        if (args.employee_id) url = `/api/core/employees/${args.employee_id}`;
        else {
          const params = new URLSearchParams();
          if (args.slack_id) params.append('slack_id', args.slack_id);
          if (args.department) params.append('department', args.department);
          const qs = params.toString();
          if (qs) url += `?${qs}`;
        }
        return await callApi('GET', url);
      },
  }),

  get_tasks: tool({
    description: 'Fetches tasks with optional filters. scope "workspace" returns the caller\'s own tasks: assigned to them, or on a post or committee they hold.',
    inputSchema: z.object({
          scope: z.enum(['workspace']).optional().describe('Use "workspace" for "my tasks"; other filters are then ignored.'),
          dept: z.string().optional().describe('Department name'),
          userId: z.string().optional().describe('Assignee Employee ID (emp_...)'),
          status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional(),
          committeeId: z.string().optional(),
          appointmentId: z.string().optional()
        }),
    execute: async (args: any) => {
        const params = new URLSearchParams(args as any);
        return await callApi('GET', `/api/tasks?${params.toString()}`);
      },
  }),

  create_task: tool({
    description:
      'Creates a task. Pass `recurrence` to make it REPEAT (every Monday, the 1st of each month, daily at 10:00…): ' +
      'each occurrence then appears as its own task shortly before it is due. Read the returned `summary` back to the user.',
    inputSchema: z.object({
          title: z.string(),
          department: z.string(),
          description: z.string().optional(),
          priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
          status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional().describe('Ignored for a repeating task: occurrences start as todo.'),
          assigneeIds: z.array(z.string()).optional().describe('Array of Assignee Employee IDs'),
          committeeId: z.string().optional(),
          appointmentId: z.string().optional(),
          startDate: z.string().optional().describe('YYYY-MM-DD. One-off tasks only.'),
          dueDate: z.string().optional().describe('YYYY-MM-DD. One-off tasks only.'),
          recurrence: recurrenceSchema.optional(),
        }),
    execute: async (args: any) => {
        return await callApi('POST', '/api/tasks', args);
      },
  }),

  update_task: tool({
    description: 'Updates an existing task.',
    inputSchema: z.object({
          id: z.string().describe('Task ID (task_...)'),
          title: z.string().optional(),
          status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional(),
          description: z.string().optional(),
          assigneeIds: z.array(z.string()).optional().describe('Array of Assignee Employee IDs')
        }),
    execute: async (args: any) => {
        const { id, ...updates } = args;
        return await callApi('PATCH', `/api/tasks/${id}`, updates);
      },
  }),

  delete_task: tool({
    description: 'Deletes one task by ID. For a repeating task this removes only that occurrence; use stop_repeating_task to end the series.',
    inputSchema: z.object({ id: z.string() }),
    execute: async (args: any) => await callApi('DELETE', `/api/tasks/${args.id}`),
  }),

  get_repeating_task: tool({
    description: 'Reads a repeating series: its schedule in words (`summary`), people and template. A task with a recurrenceId belongs to one.',
    inputSchema: z.object({ recurrenceId: z.string().describe('Series ID (trec_...)') }),
    execute: async (args: any) => await callApi('GET', `/api/tasks/recurrences/${args.recurrenceId}`),
  }),

  update_repeating_task: tool({
    description:
      'Changes a repeating series. Affects upcoming occurrences nobody has started; past and started ones are left as they are. ' +
      'Pass a full `recurrence` to change the schedule.',
    inputSchema: z.object({
          recurrenceId: z.string().describe('Series ID (trec_...)'),
          title: z.string().optional(),
          description: z.string().optional(),
          priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
          assigneeIds: z.array(z.string()).optional(),
          recurrence: recurrenceSchema.optional(),
        }),
    execute: async (args: any) => {
        const { recurrenceId, ...changes } = args;
        return await callApi('PATCH', `/api/tasks/recurrences/${recurrenceId}`, changes);
      },
  }),

  stop_repeating_task: tool({
    description: 'Stops a repeating series: no more occurrences. Upcoming ones nobody has started are removed. Confirm with the user first.',
    inputSchema: z.object({ recurrenceId: z.string().describe('Series ID (trec_...)') }),
    execute: async (args: any) => await callApi('POST', `/api/tasks/recurrences/${args.recurrenceId}/stop`),
  }),

  get_notifications: tool({
    description: 'Fetches your personal notifications.',
    inputSchema: z.object({}),
    execute: async () => await callApi('GET', '/api/notifications'),
  }),

  get_app_messages: tool({
    description: 'Fetches application messages, flags, or requests.',
    inputSchema: z.object({
          app: z.string().optional().describe('Filter by app (hr, tech, etc.) or "all"')
        }),
    execute: async (args: any) => {
        const qs = args.app ? `?app=${args.app}` : '';
        return await callApi('GET', `/api/messages${qs}`);
      },
  }),

  manage_personal_notes: tool({
    description: 'List, create, update, or delete your private notes.',
    inputSchema: z.object({
          action: z.enum(['list', 'create', 'update', 'delete']),
          id: z.string().optional().describe('Note ID (note_...)'),
          title: z.string().optional(),
          content: z.string().optional(),
          pinned: z.boolean().optional(),
          color: z.string().optional()
        }),
    execute: async (args: any) => {
        const { action, id, ...data } = args;
        if (action === 'list') return await callApi('GET', '/api/dashboard/notes');
        if (action === 'create') return await callApi('POST', '/api/dashboard/notes', data);
        if (action === 'update') {
          if (!id) return 'Error: id required for update';
          return await callApi('PATCH', `/api/dashboard/notes/${id}`, data);
        }
        if (action === 'delete') {
          if (!id) return 'Error: id required for delete';
          return await callApi('DELETE', `/api/dashboard/notes/${id}`);
        }
        return 'Invalid action';
      },
  }),
});
