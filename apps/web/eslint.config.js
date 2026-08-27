import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Allow an intentionally-unused binding to be marked with a leading
      // underscore (props kept for interface parity, ignored catch bindings).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],

      // ── Warnings, not errors, so `npm run lint` is usable as a CI gate ──────
      // Each of these is real debt that stays visible in the output. They are
      // downgraded because clearing them needs a project, not a patch — and a
      // mechanical "fix" would be worse than the warning.

      // ~220 sites. Eliminating these means giving the UI real domain types.
      // The types already exist in packages/database (Drizzle `$inferSelect`),
      // so the fix is to import them type-only rather than invent duplicates.
      // Note apps/web is not in `strict` mode, which caps the payoff until that
      // changes — enable `strict` first, then burn these down.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Flags the ordinary "fetch in an effect, setState with the result"
      // pattern used throughout the app. It is a React-Compiler-era rule about
      // cascading renders, not a defect report; clearing it means moving data
      // fetching to a library or `use()`, which is a rewrite, not a lint fix.
      'react-hooks/set-state-in-effect': 'warn',

      // Fires on legitimate imperative DOM work (`document.body.style.cursor`
      // while dragging in CalendarView) and on declaration ordering where the
      // closure resolves after render. Neither is a bug here.
      'react-hooks/immutability': 'warn',

      // `Date.now()` inside an event handler is reported as an impure call
      // during render; that is a false positive for these two call sites.
      'react-hooks/purity': 'warn',
    },
  },
])
