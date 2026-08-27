import type { LanguageModel } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { Env } from '../index';

/**
 * Builds the language model an agent runs its turn loop on, routed through that
 * agent's AI Gateway.
 *
 * Workers AI is still reached through the `AI` **binding**, not the REST
 * endpoint: no third-party quota can stop a payroll run half way through, and
 * there is no account API token to rotate. The gateway sits in front of it for
 * what a gateway is actually for — per-agent request logs, cost attribution,
 * caching and rate limiting — without changing where the model runs.
 *
 * One gateway per agent rather than one shared: the accountant and the Slack
 * assistant have nothing to say about each other's traffic, and a single log
 * mixing payroll runs with "what's on my calendar" is a log nobody reads.
 */

/**
 * The per-model settings that select a gateway and authenticate to it.
 *
 * Separated from model construction so it can be asserted directly. The
 * `cf-aig-authorization` header is the part worth pinning: these gateways have
 * Authenticated Gateway enabled, so without it every call is refused by the
 * gateway itself (`AiGatewayError 2009`) before Workers AI ever sees it.
 *
 * `extraHeaders` reaches `binding.run()`'s options — `GatewayOptions` has no
 * field for gateway credentials, because on the REST path the header is set by
 * the caller. Through the binding, this is how it gets there.
 */
export function gatewaySettings(
  env: Env,
  gatewayId: string | undefined,
): Record<string, unknown> {
  if (!gatewayId) return {};

  if (!env.CF_AIG_TOKEN) {
    // Deliberately falls back to the direct binding rather than failing. These
    // gateways require authentication, so calling one without the token would
    // 401 every turn — and an accountant that cannot answer at all is worse
    // than one whose requests are missing from a dashboard. Loud in the logs so
    // the missing secret is findable, rather than silent.
    console.warn(
      `[model] CF_AIG_TOKEN is unset; bypassing the "${gatewayId}" gateway and calling Workers AI directly.`,
    );
    return {};
  }

  return {
    gateway: { id: gatewayId },
    extraHeaders: { 'cf-aig-authorization': `Bearer ${env.CF_AIG_TOKEN}` },
  };
}

/**
 * The chat model for an agent, gateway-routed when one is configured.
 *
 * The return type is annotated rather than inferred: the provider's model class
 * has private members, so an inferred type cannot be named in a declaration
 * file and the build fails on it.
 */
export function agentModel(env: Env, gatewayId: string | undefined): LanguageModel {
  const workersai = createWorkersAI({ binding: env.AI as any });
  const modelId = env.LLM_MODEL || '@cf/openai/gpt-oss-120b';
  return workersai(modelId as any, gatewaySettings(env, gatewayId)) as LanguageModel;
}
