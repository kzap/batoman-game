import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { editorPlugin } from './tools/dev/editor-plugin';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(r('./package.json'), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [editorPlugin()],
  server: { port: 5173, strictPort: true },
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@game': r('./src/game'),
      '@render': r('./src/render'),
      '@app': r('./src/app'),
      '@content': r('./src/content'),
      '@editor': r('./src/editor'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
