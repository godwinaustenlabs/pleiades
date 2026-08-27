import { Env } from '../../index';
import type { ApiCaller } from './tools';

/**
 * What each approval-gated action actually *does*, separated from the tool that
 * proposes it.
 *
 * This exists so an approved action can be carried out without the model. The
 * approval row already stores `tool_name` and the exact `payload`; before this,
 * executing one required the agent to call the same tool a second time with a
 * byte-identical payload plus the token, and `consumeApproval` compared a
 * SHA-256 of it. The model had no conversation memory, so it could neither
 * recall the approval id nor reproduce the payload — any re-derived amount or
 * re-ordered `lines` array changed the hash and was refused. Approving in the
 * UI therefore did nothing at all.
 *
 * Now the same map is used from both directions: the tool layer calls it after
 * a token check, and the approvals route calls it directly with the stored
 * payload. One implementation, so the thing approved and the thing executed
 * cannot drift apart.
 */
export type Executor = (payload: any) => Promise<string>;

export function buildExecutors(callApi: ApiCaller): Record<string, Executor> {
  return {
    set_salary_structure: (p) =>
      callApi('POST', `/api/hr/salary-structures/${p.employee_id}/setup`, {
        baseSalary: p.base_salary,
        effectiveDate: p.effective_date,
        components: p.components,
      }),

    generate_payroll: (p) => callApi('POST', '/api/hr/payroll/generate', { month: p.month }),

    create_ledger: (p) => callApi('POST', '/api/finance/ledgers', p),

    create_account: (p) => callApi('POST', '/api/finance/accounts', p),

    create_journal_entry: (p) => callApi('POST', '/api/finance/journals', p),

    record_transaction: (p) => callApi('POST', '/api/finance/transactions', p),

    post_depreciation: (p) =>
      callApi('POST', '/api/finance/assets/post-depreciation', { period: p.period }),
  };
}

/**
 * A caller that reaches the Worker's own API as a given user.
 *
 * The same construction `PleiadesAgent.apiCaller` uses, lifted out so the
 * approvals route can execute as the person who *requested* the action rather
 * than the one who approved it. Approval is authorisation, not impersonation:
 * attributing the write to the approver would put the wrong name on every
 * audit row.
 */
export function apiCallerFor(env: Env, actorUserId: string, origin: string): ApiCaller {
  return async (method: string, path: string, body?: unknown): Promise<string> => {
    try {
      // Prefer the self service binding: it dispatches in-process instead of
      // going back out to the origin, so there is no DNS dependency and no
      // second TLS handshake per tool call. The origin fetch stays as a
      // fallback for contexts where the binding is absent.
      const url = `${origin}${path}`;
      const init: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-agent-actor': actorUserId,
          'x-agent-secret': env.AGENT_INTERNAL_SECRET,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      };
      const res = env.SELF ? await env.SELF.fetch(url, init) : await fetch(url, init);
      const text = await res.text();
      if (!res.ok) {
        return JSON.stringify({ success: false, status: res.status, error: text.slice(0, 500) });
      }
      return text;
    } catch (err) {
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Request failed',
      });
    }
  };
}
