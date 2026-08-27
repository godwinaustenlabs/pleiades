import { Hono } from 'hono';
import { Env } from '../../index';
import {
  verifySlackSignature,
  resolveSlackActor,
  postToSlack,
} from './lib/slack';
import { conversationKey, type SlackTurn } from './agent';
import { mayUseAccountant } from '../accountant/access';

export { SlackAgent } from './agent';

/**
 * Slack webhook entry.
 *
 * This layer does three things and nothing else: verify the request really came
 * from Slack, work out who is speaking, and hand a verified turn to the agent.
 * All reasoning lives in the Durable Object (agent.ts), so the security-
 * relevant path stays short enough to read in one go.
 *
 * The order matters and is pinned by tests: the signature is checked over the
 * exact bytes Slack sent, *before* the url_verification handshake is answered
 * and before a Slack id is ever treated as an identity.
 */
const createSlackAgentRouter = (_app: Hono<{ Bindings: Env }>) => {
  const slackAgentRouter = new Hono<{ Bindings: Env }>();

  slackAgentRouter.post('/event', async (c) => {
    const env = c.env;
    const contentType = c.req.header('Content-Type') || '';

    // Read the RAW body and verify Slack's HMAC over those exact bytes.
    // Parsing and re-serialising changes the bytes and every signature fails.
    const rawBody = await c.req.text();
    if (!(await verifySlackSignature(env, c.req.raw, rawBody))) {
      console.error('[Slack] Rejected request with invalid signature');
      return c.text('unauthorized', 401);
    }

    let slackId = '';
    let channel = '';
    let prompt = '';
    let threadTs: string | undefined;
    let responseUrl: string | undefined;

    if (contentType.includes('application/json')) {
      const body = JSON.parse(rawBody);

      // Slack signs the handshake too, so answering it here is still after
      // verification.
      if (body.type === 'url_verification') return c.json({ challenge: body.challenge });
      if (body.type !== 'event_callback') return c.body(null, 200);

      const event = body.event;
      // Ignore our own messages and edits/joins, or the agent talks to itself.
      if (!event || event.bot_id || event.subtype) return c.body(null, 200);
      if (
        event.type !== 'app_mention' &&
        event.type !== 'message' &&
        event.type !== 'assistant_thread_started'
      ) {
        return c.body(null, 200);
      }

      slackId = event.user;
      channel = event.channel || event.assistant_thread?.channel_id;
      threadTs =
        event.thread_ts || event.assistant_thread?.thread_ts || event.assistant_thread?.id;
      if (!slackId || !channel) return c.body(null, 200);

      if (event.type === 'assistant_thread_started') {
        c.executionCtx.waitUntil(
          (async () => {
            try {
              const token = env.SLACK_BOT_OAUTH_TOKEN;
              if (token) {
                await postToSlack(
                  token,
                  channel,
                  `Hi <@${slackId}>! I'm officeOS, your personal AI assistant. How can I help you today?`,
                  threadTs,
                );
              }
            } catch (err) {
              console.error('[Slack] Welcome message failed:', err);
            }
          })(),
        );
        return c.body(null, 200);
      }

      prompt = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim() || 'Hello';
    } else {
      // Slash commands arrive form-encoded, parsed from the same verified bytes.
      const form = new URLSearchParams(rawBody);
      slackId = form.get('user_id') || '';
      channel = form.get('channel_id') || '';
      prompt = form.get('text') || 'Hello';
      responseUrl = form.get('response_url') || undefined;
      if (!slackId || !channel) return c.body(null, 200);
    }

    // A Slack id is not an identity by itself. This lookup is the only thing
    // that turns one into an officeOS user, and it runs after verification.
    const actor = await resolveSlackActor(env, slackId);
    if (!actor) {
      return c.json(
        {
          response_type: 'ephemeral',
          text: "Your Slack account isn't linked to an active officeOS user, so I can't act on your behalf.",
        },
        200,
      );
    }

    // The accountant is a separate, higher-trust capability. A Slack message
    // never passes through Hono middleware carrying the actor's identity, so the
    // entry check happens here explicitly rather than being assumed.
    const wantsAccountant = /\b(accountant|payroll|withholding|eobi|ledger|journal|tax|filing|invoice)\b/i.test(prompt);
    if (wantsAccountant) {
      const access = await mayUseAccountant(env, actor.userId);
      if (!access.allowed) {
        return c.json({ response_type: 'ephemeral', text: access.reason }, 200);
      }
    }

    const turn: SlackTurn = {
      slackId,
      actorUserId: actor.userId,
      channel,
      threadTs,
      prompt,
      responseUrl,
      origin: new URL(c.req.url).origin,
    };

    // Slack retries anything not answered within 3 seconds, so acknowledge now
    // and let the agent take as long as it needs.
    const id = env.SLACK_AGENT.idFromName(conversationKey(channel, threadTs));
    const stub = env.SLACK_AGENT.get(id);
    c.executionCtx.waitUntil(
      stub
        .fetch('https://slack-agent.internal/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(turn),
        })
        .then(async (res) => {
          if (!res.ok) console.error('[Slack] Agent turn failed:', res.status, await res.text());
        })
        .catch((err) => console.error('[Slack] Agent dispatch failed:', err)),
    );

    return c.body(null, 200);
  });

  return slackAgentRouter;
};

export default createSlackAgentRouter;
