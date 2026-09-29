import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.jsonc' },
			miniflare: {
				// Secrets normally supplied via .dev.vars / wrangler secret.
				bindings: {
					JWT_SECRET: 'test-jwt-secret',
					AGENT_INTERNAL_SECRET: 'test-agent-internal-secret',
					SLACK_SIGNING_SECRET: 'test-slack-signing-secret',
					/**
					 * Blank on purpose, and this one is not cosmetic.
					 *
					 * Miniflare loads `.dev.vars`, which holds the real Resend key so that
					 * `wrangler dev` can send. Without this line the suite inherits it and
					 * every test that reaches `drainOne` makes a live call to
					 * api.resend.com — spending a 90-a-day allowance on assertions, and
					 * mailing whatever address a fixture happens to name.
					 *
					 * Empty means `transport.ts` takes its console path, which is what lets
					 * the whole outbox — claim, backoff, idempotency, the lease — be
					 * exercised with nothing leaving the machine.
					 */
					RESEND_API_KEY: '',
				},
			},
		}),
	],
	test: {
		include: ['test/**/*.test.ts'],
	},
});
