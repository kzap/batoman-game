import { parseLevel } from '@content/level';
import level1 from '@content/levels/level-1.json';
import { HttpAssetSource, loadAssets } from '@render/assets';
import { App, installHooks, postOptionsFromQuery } from './app';

const hooks = installHooks();

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('#game-canvas not found');
}

const level = parseLevel(level1, 'level-1');

loadAssets(level, new HttpAssetSource(`${import.meta.env.BASE_URL}assets/`))
  .then((assets) => new App(canvas, hooks, level, assets, { post: postOptionsFromQuery(location.search) }).start())
  .catch((e: unknown) => {
    hooks.errors.push(`boot failed: ${(e as Error).message}`);
    throw e;
  });
