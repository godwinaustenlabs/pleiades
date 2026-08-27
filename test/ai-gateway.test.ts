import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { gatewaySettings } from '../src/utils/model';

/**
 * Both agents reach Workers AI through the binding, fronted by their own AI
 * Gateway. What is asserted here is the part that silently breaks everything if
 * it is wrong: these gateways have Authenticated Gateway enabled, so a call
 * that omits `cf-aig-authorization` is refused by the gateway itself
 * (`AiGatewayError 2009`) before Workers AI ever sees the request.
 */
describe('AI Gateway routing', () => {
	const withToken = { ...env, CF_AIG_TOKEN: 'test-aig-token' } as any;

	it('selects the named gateway and authenticates to it', () => {
		const s = gatewaySettings(withToken, 'pleiades-accounting-agent');
		expect(s.gateway).toEqual({ id: 'pleiades-accounting-agent' });
		// `GatewayOptions` has no field for a gateway credential — on the REST
		// path the caller sets the header. Through the binding, `extraHeaders` is
		// how it gets there.
		expect(s.extraHeaders).toEqual({ 'cf-aig-authorization': 'Bearer test-aig-token' });
	});

	it('keeps the two agents on separate gateways', () => {
		// A single log mixing payroll runs with "what's on my calendar" is a log
		// nobody reads.
		const accountant = gatewaySettings(withToken, 'pleiades-accounting-agent');
		const slack = gatewaySettings(withToken, 'pleiades-slack-agent');
		expect((accountant.gateway as any).id).not.toBe((slack.gateway as any).id);
	});

	it('falls back to the direct binding when the token is missing', () => {
		// These gateways refuse unauthenticated calls, so routing to one without
		// the token would 401 every turn. An accountant missing from a dashboard
		// beats an accountant that cannot answer at all — and the bypass is
		// logged, so the unset secret stays findable.
		const s = gatewaySettings({ ...env, CF_AIG_TOKEN: undefined } as any, 'pleiades-accounting-agent');
		expect(s).toEqual({});
	});

	it('never sends a bare gateway id with no credential', () => {
		// The failure mode worth excluding: selecting the gateway but omitting the
		// header, which fails every call instead of falling back.
		for (const token of [undefined, '']) {
			const s = gatewaySettings({ ...env, CF_AIG_TOKEN: token } as any, 'pleiades-accounting-agent');
			expect(s.gateway).toBeUndefined();
		}
	});

	it('routes direct when no gateway is configured for an agent', () => {
		expect(gatewaySettings(withToken, undefined)).toEqual({});
	});

	it('is wired to the gateways this account actually has', () => {
		// Pinned against wrangler.jsonc: a typo here is a 404 at the gateway and
		// a dead agent, and nothing else in the suite would catch it.
		expect(env.AI_GATEWAY_ACCOUNTANT).toBe('pleiades-accounting-agent');
		expect(env.AI_GATEWAY_SLACK).toBe('pleiades-slack-agent');
	});
});
