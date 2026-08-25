import { Hono } from 'hono';
import { Pipeline } from 'nova-agent-framework';
import { Env } from '../../index';
import { verifySlackSignature, resolveSlackActor } from './lib/slack';
import { buildSystemPrompt } from './prompt';
import { buildTools } from './tools';

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
        systemPrompt: buildSystemPrompt(slackID),
      },
      tools: buildTools(callApi),
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
