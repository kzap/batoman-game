import { levelIdFromQuery, loadLevelById } from '@content/levels';
import { HttpAssetSource, loadAssets } from '@render/assets';
import { App, installHooks, postOptionsFromQuery } from './app';

const hooks = installHooks();

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('#game-canvas not found');
}

/** `?level=<id>` picks a manifest level; `?edit=1` opens it in the editor (a separate chunk, loaded on demand). */
async function boot(): Promise<void> {
  const level = await loadLevelById(levelIdFromQuery(location.search));
  const assets = await loadAssets(level, new HttpAssetSource(`${import.meta.env.BASE_URL}assets/`));
  const app = new App(canvas as HTMLCanvasElement, hooks, level, assets, { post: postOptionsFromQuery(location.search) });
  app.start();
  if (new URLSearchParams(location.search).get('edit') === '1') {
    const { Editor } = await import('@editor/editor');
    new Editor(app, assets).attach();
  }
}

boot().catch((e: unknown) => {
  hooks.errors.push(`boot failed: ${(e as Error).message}`);
  throw e;
});
