import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Reuse the app's resolve aliases so tests import `@core/...` exactly like src does.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            include: ['tests/unit/**/*.test.ts', 'tools/**/*.test.ts'],
            environment: 'node',
          },
        },
        {
          extends: true,
          test: {
            name: 'replay',
            include: ['tests/replay/**/*.test.ts'],
            environment: 'node',
          },
        },
      ],
    },
  }),
);
