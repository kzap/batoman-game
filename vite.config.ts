import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { editorPlugin } from './tools/dev/editor-plugin';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(r('./package.json'), 'utf8')) as { version: string };

/**
 * Public path the built site is served from. Dev, `vite preview`, and CI leave
 * this unset and stay at `/`. The Pages workflow sets `VITE_BASE_PATH` because
 * the project site is a subpath of the user site (`/batoman-game/`).
 */
function siteBase(): string {
  const raw = process.env.VITE_BASE_PATH?.trim();
  if (!raw || raw === '/') return '/';
  const withLead = raw.startsWith('/') ? raw : `/${raw}`;
  return withLead.endsWith('/') ? withLead : `${withLead}/`;
}

/** Actions sets `GITHUB_SHA`. Local builds stay `dev` and hide the corner label. */
const buildSha = process.env.GITHUB_SHA ?? 'dev';
const buildTime = process.env.BUILD_TIME ?? (buildSha === 'dev' ? '' : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));

export default defineConfig({
  base: siteBase(),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
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
