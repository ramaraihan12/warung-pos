import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.next', 'drizzle', 'coverage', 'playwright-report', 'test-results', 'public/sw.js', 'next-env.d.ts'] },
  js.configs.recommended,
  ...nextVitals,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
