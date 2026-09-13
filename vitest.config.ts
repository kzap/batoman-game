import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const alias = {
  '@core': r('./src/core'),
  '@game': r('./src/game'),
  '@render': r('./src/render'),
  '@app': r('./src/app'),
  '@content': r('./src/content'),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tools/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'replay',
          include: ['tests/replay/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
