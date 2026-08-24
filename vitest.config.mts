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
					API_KEY_SECRET: 'test-api-key-secret',
					AGENT_INTERNAL_SECRET: 'test-agent-internal-secret',
					SLACK_SIGNING_SECRET: 'test-slack-signing-secret',
				},
			},
		}),
	],
	test: {
		include: ['test/**/*.test.ts'],
	},
});
