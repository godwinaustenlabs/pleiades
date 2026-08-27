import { getDb, schema } from '@pleiades/database';
import { Env } from '../../index';
import { generateId } from '../../utils/id';
import { loadConfig } from './config';
import { recordAction } from './journal';
import { accountantKey, type AccountantTurn } from './agent';

/**
 * The twice-daily check.
 *
 * A cron rather than the Agents SDK's `this.schedule()`: the run is global, not
 * per-conversation, and no Durable Object here wakes on a timer of its own. It
 * runs as a configured operator so its tool calls stay bounded by a real
 * person's grants — a scheduled turn with no actor would have to bypass
 * authorisation or hold a privileged identity, and both are worse.
 *
 * It proposes. Anything consequential still raises an approval, which is the
 * whole point of the draft-never-file rule: an unattended job that could file
 * with a government portal is precisely what must not exist.
 */

/** Morning: what is due. Evening: what was left undone. */
export function promptFor(now: Date, slot: 'morning' | 'evening'): string {
  const today = now.toISOString().slice(0, 10);
  const period = today.slice(0, 7);

  const common =
    `Today is ${today}. This is your scheduled ${slot} check — nobody has asked you a question.\n\n` +
    `Work from what is recorded, in this order:\n` +
    `1. knowledge_search — the compliance manual, for deadlines that fall near today.\n` +
    `2. get_compliance_config — the operator's rates and filing dates. These are the only rates ` +
    `you may quote; if one you need is unset, say which, and stop there rather than estimating.\n` +
    `3. recall_actions with period_label "${period}" — what you have already done this month, so ` +
    `you do not propose it twice.\n` +
    `4. list_statements — what has already been produced.\n\n`;

  if (slot === 'morning') {
    return (
      common +
      `Then say what is due: filings approaching their deadline, months with no depreciation ` +
      `posted, periods with no statement generated. If a monthly statement is due and the period ` +
      `has closed, generate it — that writes a draft PDF and changes no books. Anything that would ` +
      `change the books, raise as an approval and stop.\n\n` +
      `If nothing is due, say exactly that in one line. A quiet day is a useful answer; inventing ` +
      `work to look busy is not.`
    );
  }

  return (
    common +
    `Then review the day: approvals still pending, depreciation or statements you flagged this ` +
    `morning that are still outstanding, and anything in the manual falling due within the next ` +
    `seven days. Be brief. If nothing has changed since this morning, say so in one line.`
  );
}

export interface RunnerResult {
  ran: boolean;
  reason?: string;
  reply?: string;
  messageId?: string;
}

export async function runDailyCheck(
  env: Env,
  origin: string,
  now: Date = new Date(),
): Promise<RunnerResult> {
  const vars = await loadConfig(env, now);
  const actorUserId = vars.find((v) => v.key === 'daily_runner_actor')?.value?.trim();

  if (!actorUserId) {
    // Not an error. Nobody has said whose authority this runs under, and
    // choosing one would be inventing an answer to a question about trust.
    return { ran: false, reason: 'daily_runner_actor is not configured.' };
  }

  const db = getDb(env);
  const account = await db.query.usersLogins.findFirst({
    where: (u, { eq }) => eq(u.id, actorUserId),
  });
  if (!account || !account.isActive) {
    return { ran: false, reason: `daily_runner_actor "${actorUserId}" is not an active account.` };
  }

  const slot: 'morning' | 'evening' = now.getUTCHours() < 12 ? 'morning' : 'evening';
  const turn: AccountantTurn = {
    actorUserId,
    operatorName: account.name || account.email || actorUserId,
    prompt: promptFor(now, slot),
    origin,
    // Its own conversation per day and slot, so the run has the morning's
    // context without inheriting somebody's interactive chat.
    conversationId: `conv_runner_${now.toISOString().slice(0, 10)}_${slot}`,
  };

  const id = env.PLEIADES_AGENT.idFromName(accountantKey(actorUserId, `runner-${slot}`));
  const stub = env.PLEIADES_AGENT.get(id);
  const res = await stub.fetch('https://pleiades.internal/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(turn),
  });

  if (!res.ok) {
    const detail = await res.text();
    return { ran: false, reason: `The agent could not complete the run: ${detail.slice(0, 300)}` };
  }

  const body = (await res.json()) as { reply: string; pendingApprovals?: { id: string }[] };
  const reply = (body.reply || '').trim();

  // Written to app_messages so a suggestion survives nobody being logged in;
  // the NotificationCenter already reads /api/messages?app=finance.
  const messageId = generateId('msg');
  await db.insert(schema.appMessages).values({
    id: messageId,
    senderApp: 'finance',
    targetApp: 'finance',
    senderId: actorUserId,
    type: 'agent_check',
    title: slot === 'morning' ? "Accountant's morning check" : "Accountant's end-of-day check",
    message: reply || 'The run produced no output.',
    priority: body.pendingApprovals?.length ? 'high' : 'low',
    createdAt: new Date(),
  });

  await recordAction(env, {
    actionType: 'daily_check',
    subject: `Scheduled ${slot} check`,
    summary: reply.slice(0, 1000) || 'No output.',
    rationale: 'Scheduled run, not requested by anyone.',
    periodLabel: now.toISOString().slice(0, 7),
    entities: { messageId, pendingApprovals: body.pendingApprovals?.map((a) => a.id) ?? [] },
    actorUserId,
    conversationId: turn.conversationId,
  });

  return { ran: true, reply, messageId };
}
