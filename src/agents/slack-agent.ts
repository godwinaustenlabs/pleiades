import { Hono } from 'hono';
import { z } from 'zod';
import { Pipeline } from 'nova-agent-framework';
import { Env } from '../index';
import { verifySlackSignature, resolveSlackActor } from './lib/slack';

// Helper: Post a message back to Slack using the Bot OAuth token (chat.postMessage)
async function postToSlack(botToken: string, channel: string, text: string, threadTs?: string) {
  const payload: any = { channel, text };
  if (threadTs) payload.thread_ts = threadTs;

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${botToken}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json() as any;
  if (!data.ok) console.error('[postToSlack] Slack API error:', JSON.stringify(data));
  return data;
}

// Helper: Reply to a slash command via its response_url
async function replyToSlashCommand(responseUrl: string, text: string) {
  const payload = { response_type: 'ephemeral', text };
  const res = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('[replyToSlashCommand] Error:', res.status, errorText);
  }
}

const createSlackAgentRouter = (app: Hono<{ Bindings: Env }>) => {
  const slackAgentRouter = new Hono<{ Bindings: Env }>();

  slackAgentRouter.post('/event', async (c) => {
    const env = c.env;
    const contentType = c.req.header('Content-Type') || '';
    let body: any;
    let slackID = '';
    let channel = '';
    let userPrompt = '';
    let threadTs: string | undefined = undefined;

    // Read the RAW body first and verify Slack's signature over those exact
    // bytes. Parsing and re-serializing changes the bytes and every signature
    // would fail. Slack signs the url_verification challenge too, so this runs
    // before the handshake is answered.
    const rawBody = await c.req.text();
    if (!(await verifySlackSignature(env, c.req.raw, rawBody))) {
      console.error('[Slack Agent] Rejected request with invalid signature');
      return c.text('unauthorized', 401);
    }

    if (contentType.includes('application/json')) {
      body = JSON.parse(rawBody);

      // 1. Handle Slack's URL verification handshake
      if (body.type === 'url_verification') {
        return c.json({ challenge: body.challenge });
      }

      // 2. Only process actual event callbacks
      if (body.type !== 'event_callback') {
        return c.body(null, 200);
      }

      const event = body.event;

      // 3. Ignore bot messages
      if (!event || event.bot_id || event.subtype) {
        return c.body(null, 200);
      }

      // 4. Handle supported event types
      if (
        event.type !== 'app_mention' &&
        event.type !== 'message' &&
        event.type !== 'assistant_thread_started'
      ) {
        return c.body(null, 200);
      }

      slackID = event.user;
      channel = event.channel || event.assistant_thread?.channel_id;
      threadTs = event.thread_ts || event.assistant_thread?.thread_ts || event.assistant_thread?.id;

      if (!slackID || !channel) {
        return c.body(null, 200);
      }

      if (event.type === 'assistant_thread_started') {
        c.executionCtx.waitUntil((async () => {
          try {
            const token = env.SLACK_BOT_OAUTH_TOKEN;
            if (token) {
              await postToSlack(
                token,
                channel,
                `Hi <@${slackID}>! I'm officeOS, your personal AI assistant. How can I help you today?`,
                threadTs
              );
            }
          } catch (error: any) {
            console.error('Welcome message error:', error);
          }
        })());
        return c.body(null, 200);
      }

      const rawText: string = event.text || '';
      userPrompt = rawText.replace(/<@[A-Z0-9]+>/g, '').trim() || 'Hello';
    } else {
      // Slash commands (application/x-www-form-urlencoded), parsed from the
      // same raw bytes the signature was computed over.
      const form = new URLSearchParams(rawBody);
      body = Object.fromEntries(form);
      slackID = form.get('user_id') || '';
      channel = form.get('channel_id') || '';
      userPrompt = form.get('text') || 'Hello';
      (c as any)._responseUrl = form.get('response_url') || '';

      if (!slackID || !channel) {
        return c.body(null, 200);
      }
    }

    // Map the (now verified) Slack user to an officeOS account. The Slack id is
    // never an identity by itself — this lookup is the only thing that turns it
    // into one, and it happens after signature verification.
    const actor = await resolveSlackActor(env, slackID);
    if (!actor) {
      return c.json({
        response_type: 'ephemeral',
        text: "Your Slack account isn't linked to an active officeOS user, so I can't act on your behalf.",
      }, 200);
    }

    const actorUserId = actor.userId;

    async function callApi(method: string, path: string, body?: any) {
      const baseUrl = new URL(c.req.url).origin;
      const url = `${baseUrl}${path}`;

      // Authorize as the resolved user via the secret-gated internal header.
      // The secret never leaves the Worker, so this cannot be forged externally.
      const headers: any = {
        'Content-Type': 'application/json',
        'x-agent-actor': actorUserId,
        'x-agent-secret': env.AGENT_INTERNAL_SECRET || '',
      };

      const fetchOpts: any = { method, headers };
      if (body) fetchOpts.body = JSON.stringify(body);

      try {
        const internalReq = new Request(url, fetchOpts);
        const response = await app.fetch(internalReq, env);
        const data = await response.json() as any;
        return JSON.stringify(data);
      } catch (error: any) {
        console.error(`[Slack Agent] API Call Error (${method} ${path}):`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }

    // 6. Initialize the Nova Agent Pipeline
    const pipeline = new Pipeline({
      verbose: env.VERBOSE === 'true',
      llmConfig: {
        model: env.LLM_MODEL,
        provider: env.LLM_PROVIDER,
        temperature: 0.2,
        cloudflare: {
          accountId: env.CF_ACCOUNT_ID,
          gatewayId: env.CF_GATEWAY_NAME,
          cfAIGToken: env.CF_AIG_TOKEN
        }
      },
      ctxManagerConfig: {
        clientId: slackID,
        agentId: env.AGENT_ID || 'nova-slack-agent',
        memory: {
          type: 'summary',
          kvNamespace: env.MEMORY_KV_NAMESPACE,
          limitTurns: 3,
        }
      },
      promptBuilderConfig: {
        systemPrompt: `You are office, a collaborative human-like peer at Godwin Austen Labs.
Your primary goal is to help with tasks, notes, and records only when asked.

CRITICAL OPERATIONAL RULES:
1. SECURITY & RBAC: Authenticate all actions using the user's Slack ID "${slackID}".
2. IDENTITY MAPPING: 
   - Start by calling 'get_employee_info' to retrieve your internal 'emp_ID'.
   - ALWAYS use this 'emp_ID' for all operations involving tasks, notes, or records. NEVER use 'slackID' for these lookups.
   - Never mention emp_ID or usrID or internal information to the user.
3. PERSONALITY & TONE: You are a human peer. Be concise, direct, and conversational. 
   - DO NOT provide unsolicited summaries, briefings, or lists of information unless specifically requested.
   - If a user asks "what's up" or "help", offer simple, helpful assistance.
   - Avoid "energetic" or "optimistic" filler; just be professional and helpful.
4. DATA INTEGRITY: Never assume. Use the 'emp_ID' for all tool lookups.
5. SLACK FORMATTING (Mrkdwn): Use Slack's formatting only:
   - Use *bold* for emphasis.
   - Use _italics_ for nuances.
   - Use • for bulleted lists (not dashes).
   - DO NOT use standard Markdown (e.g., no tables, no headers with #).
6. BRIEFING WORKFLOWS: Only execute these when the user explicitly requests a "morning brief" or "night brief". Otherwise, remain quiet and wait for instructions.

You have access to tools for:
- Employee Records: Fetch info about yourself or others.
- Tasks: Manage tasks across the organization.
- Notifications: Check your personal alerts.
- Messages: Read app-level requests and flags.
- Notes: Create and manage personal notes.

Always confirm destructive actions like deleting a task or note. If an API call returns an error, explain it clearly to the user.`
      },
      tools: [
        {
          name: 'get_employee_info',
          description: 'Fetches employee records. Use slack_id to find a specific person or filter by department.',
          schema: z.object({
            slack_id: z.string().optional().describe('Slack ID (starts with U)'),
            employee_id: z.string().optional().describe('Internal employee ID (starts with emp_)'),
            department: z.string().optional().describe('Filter by department name')
          }),
          func: async (args: { employee_id: any; slack_id: string; department: string; }) => {
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
          }
        },
        {
          name: 'get_tasks',
          description: 'Fetches tasks with optional filters.',
          schema: z.object({
            dept: z.string().optional().describe('Department name'),
            userId: z.string().optional().describe('Assignee Employee ID (emp_...)'),
            status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional(),
            committeeId: z.string().optional(),
            appointmentId: z.string().optional()
          }),
          func: async (args: any) => {
            const params = new URLSearchParams(args as any);
            return await callApi('GET', `/api/tasks?${params.toString()}`);
          }
        },
        {
          name: 'create_task',
          description: 'Creates a new task.',
          schema: z.object({
            title: z.string(),
            department: z.string(),
            description: z.string().optional(),
            status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional(),
            assigneeIds: z.array(z.string()).optional().describe('Array of Assignee Employee IDs'),
            committeeId: z.string().optional(),
            appointmentId: z.string().optional()
          }),
          func: async (args: any) => {
            return await callApi('POST', '/api/tasks', args);
          }
        },
        {
          name: 'update_task',
          description: 'Updates an existing task.',
          schema: z.object({
            id: z.string().describe('Task ID (task_...)'),
            title: z.string().optional(),
            status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional(),
            description: z.string().optional(),
            assigneeIds: z.array(z.string()).optional().describe('Array of Assignee Employee IDs')
          }),
          func: async (args: { [x: string]: any; id: any; }) => {
            const { id, ...updates } = args;
            return await callApi('PATCH', `/api/tasks/${id}`, updates);
          }
        },
        {
          name: 'delete_task',
          description: 'Deletes a task by ID.',
          schema: z.object({ id: z.string() }),
          func: async (args: { id: any; }) => await callApi('DELETE', `/api/tasks/${args.id}`)
        },
        {
          name: 'get_notifications',
          description: 'Fetches your personal notifications.',
          schema: z.object({}),
          func: async () => await callApi('GET', '/api/notifications')
        },
        {
          name: 'get_app_messages',
          description: 'Fetches application messages, flags, or requests.',
          schema: z.object({
            app: z.string().optional().describe('Filter by app (hr, tech, etc.) or "all"')
          }),
          func: async (args: { app: any; }) => {
            const qs = args.app ? `?app=${args.app}` : '';
            return await callApi('GET', `/api/messages${qs}`);
          }
        },
        {
          name: 'manage_personal_notes',
          description: 'List, create, update, or delete your private notes.',
          schema: z.object({
            action: z.enum(['list', 'create', 'update', 'delete']),
            id: z.string().optional().describe('Note ID (note_...)'),
            title: z.string().optional(),
            content: z.string().optional(),
            pinned: z.boolean().optional(),
            color: z.string().optional()
          }),
          func: async (args: { [x: string]: any; action: any; id: any; }) => {
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
          }
        }
      ]
    });

    const responseUrl = (c as any)._responseUrl;
    c.executionCtx.waitUntil((async () => {
      let success = false;
      let finalOutput = '';
      try {
        finalOutput = await pipeline.run(userPrompt);
        success = true;
      } catch (error: any) {
        console.error(`[Slack Agent] Pipeline Error:`, error);
        const errText = `Sorry <@${slackID}>, I encountered an error: ${error.message}`;
        const token = env.SLACK_BOT_OAUTH_TOKEN;
        if (responseUrl) {
          await replyToSlashCommand(responseUrl, errText);
        } else if (token) {
          await postToSlack(token, channel, errText, threadTs);
        }
        return;
      }

      if (success) {
        const replyText = channel.startsWith('D') ? finalOutput : `<@${slackID}> ${finalOutput}`;
        const token = env.SLACK_BOT_OAUTH_TOKEN;
        if (responseUrl) {
          await replyToSlashCommand(responseUrl, replyText);
        } else if (token) {
          await postToSlack(token, channel, replyText, threadTs);
        }
      }
    })());

    return c.body(null, 200);
  });

  return slackAgentRouter;
};

export default createSlackAgentRouter;
