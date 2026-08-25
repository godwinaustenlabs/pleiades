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
    description: 'Fetches tasks with optional filters.',
    inputSchema: z.object({
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
    description: 'Creates a new task.',
    inputSchema: z.object({
          title: z.string(),
          department: z.string(),
          description: z.string().optional(),
          status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional(),
          assigneeIds: z.array(z.string()).optional().describe('Array of Assignee Employee IDs'),
          committeeId: z.string().optional(),
          appointmentId: z.string().optional()
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
    description: 'Deletes a task by ID.',
    inputSchema: z.object({ id: z.string() }),
    execute: async (args: any) => await callApi('DELETE', `/api/tasks/${args.id}`),
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
