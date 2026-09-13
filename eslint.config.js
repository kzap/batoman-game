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
    // The sim core must stay free of DOM and renderer dependencies.
    files: ['src/core/**/*.ts', 'src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*', 'postprocessing'], message: 'core/game must not depend on the renderer.' },
            { group: ['@render/*', '@app/*'], message: 'core/game must not depend on render/app layers.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'requestAnimationFrame', 'performance'],
    },
  },
  {
    files: ['tools/**/*.ts', 'tests/**/*.ts', '*.config.ts', 'eslint.config.js'],
    rules: { 'no-console': 'off' },
  },
);
