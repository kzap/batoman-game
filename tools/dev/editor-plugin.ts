import type { ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type * as EditorSave from './editor-save';

/**
 * Dev-server endpoint for the level editor (`?edit=1`):
 *
 *   GET /__editor/ping             -> { ok: true }
 *   PUT /__editor/levels/<id>      -> validates the body and writes src/content/levels/<id>.json
 *
 * The validation and write logic lives in tools/dev/editor-save.ts and is
 * loaded through Vite's SSR loader so it can share `src/content` (with its
 * path aliases) with the app. Nothing here exists in the production build;
 * the editor falls back to downloading the file.
 */
export function editorPlugin(): Plugin {
  /** Text last written per level file. A change event whose content matches is the editor's own save: the page must not reload over the editor's state. */
  const written = new Map<string, string>();
  return {
    name: 'batoman-editor',
    apply: 'serve',
    async hotUpdate(ctx) {
      const saved = written.get(ctx.file);
      if (saved === undefined) return undefined;
      if ((await ctx.read()) === saved) return [];
      written.delete(ctx.file); // edited by hand since: reload as usual
      return undefined;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/__editor/')) return next();
        if (req.method === 'GET' && url === '/__editor/ping') return json(res, 200, { ok: true });
        const m = /^\/__editor\/levels\/([^/?]+)$/.exec(url);
        if (!m || req.method !== 'PUT') return json(res, 404, { ok: false, problems: ['unknown editor endpoint'] });
        const id = decodeURIComponent(m[1]!);
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => (body += chunk));
        req.on('end', () => {
          void server
            .ssrLoadModule('/tools/dev/editor-save.ts')
            .then((mod) => {
              const { saveLevel, defaultIo } = mod as typeof EditorSave;
              const result = saveLevel(id, body, defaultIo(server.config.root));
              if (result.status === 200 && result.body.path && result.body.text !== undefined) {
                written.set(result.body.path, result.body.text);
                server.config.logger.info(`[editor] saved ${result.body.path} (${result.body.text.length} bytes)`);
              }
              json(res, result.status, { ok: result.body.ok, problems: result.body.problems, path: result.body.path });
            })
            .catch((e: unknown) => json(res, 500, { ok: false, problems: [(e as Error).message] }));
        });
      });
    },
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
