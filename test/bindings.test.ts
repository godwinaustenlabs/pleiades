import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

/**
 * Every binding the Worker expects is actually wired.
 *
 * tsc checks that `Env` is *declared* consistently; nothing else checks that
 * wrangler.jsonc actually provides what `Env` promises. A binding renamed in
 * one place and not the other type-checks, builds, deploys, and then throws on
 * the first request that touches it.
 */
describe('bindings', () => {
  const required: Array<[string, string]> = [
    ['DB', 'prepare'],
    ['ASSETS', 'fetch'],
    ['SELF', 'fetch'],
    ['SLACK_AGENT', 'idFromName'],
    ['PLEIADES_AGENT', 'idFromName'],
    ['CRM_BUCKET', 'get'],
    ['COMPLIANCE_BUCKET', 'get'],
    ['VECTORIZE', 'query'],
    ['AI', 'run'],
  ];

  it.each(required)('binds %s with a usable interface', (name, method) => {
    const b = (env as Record<string, any>)[name];
    expect(b, `binding ${name} is missing`).toBeDefined();
    expect(typeof b[method], `binding ${name} has no ${method}()`).toBe('function');
  });

  const vars = ['AI_GATEWAY_PLEIADES', 'AI_GATEWAY_SLACK', 'WORKER_ORIGIN', 'LLM_MODEL'];

  it.each(vars)('provides the var %s', (name) => {
    expect(typeof (env as Record<string, any>)[name], `var ${name} is not a string`).toBe('string');
  });

  it('keeps the two agents on separate AI Gateways', () => {
    // One request log mixing payroll runs with "what's on my calendar" is a log
    // nobody reads. This is the config-level half of that rule; the behavioural
    // half is in ai-gateway.test.ts.
    expect(env.AI_GATEWAY_PLEIADES).not.toBe(env.AI_GATEWAY_SLACK);
  });

  it('binds no KV namespace', () => {
    expect((env as Record<string, any>).CLIENTS_KV_NAMESPACE).toBeUndefined();
    expect((env as Record<string, any>).MEMORY_KV_NAMESPACE).toBeUndefined();
  });
});
