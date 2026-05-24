import { Env } from '../index';

export async function postToSlack(env: Env, channel: string, text: string, threadTs?: string) {
  const botToken = env.SLACK_BOT_OAUTH_TOKEN;
  if (!botToken) {
    console.error('[postToSlack] SLACK_BOT_OAUTH_TOKEN not configured');
    return;
  }

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
