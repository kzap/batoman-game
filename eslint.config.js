// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', 'art-source/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    // The sim core must stay headless and deterministic: no renderer, no DOM,
    // no wall-clock time, no unseeded randomness.
    files: ['src/core/**/*.ts', 'src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*', 'postprocessing'], message: 'core/game must not depend on the renderer.' },
            { group: ['@render/*', '@app/*', '**/render/**', '**/app/**'], message: 'core/game must not depend on render/app layers.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'setTimeout',
        'setInterval',
        'performance',
        'globalThis',
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG in world state.' },
        { object: 'Date', property: 'now', message: 'Sim time comes from the tick counter.' },
        { object: 'performance', property: 'now', message: 'Sim time comes from the tick counter.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'Sim time comes from the tick counter.' },
      ],
    },
  },
  {
    files: ['tools/**/*.ts', 'tests/**/*.ts', '*.config.ts', 'eslint.config.js'],
    rules: { 'no-console': 'off' },
  },
);
