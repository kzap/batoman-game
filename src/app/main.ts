import { DEFAULT_LEVEL_ID, levelIdFromQuery, loadLevelById } from '@content/levels';
import { HttpAssetSource, loadAssets } from '@render/assets';
import { App, installHooks, postOptionsFromQuery } from './app';
import { lockstepFromQuery } from './lockstep';
import { GameAudio } from './audio';
import { Overlay } from './shell/overlay';
import { resolveUnlockAll } from './shell/progression';
import { reduceMotionQuery } from './shell/save';
import { Shell } from './shell/shell';

const hooks = installHooks();
showBuildStamp();

/** Corner label plus a console line so a playtester can see which commit is deployed. */
function showBuildStamp(): void {
  const sha = __BUILD_SHA__;
  const short = sha === 'dev' ? 'dev' : sha.slice(0, 7);
  const when = __BUILD_TIME__.replace(/:\d{2}(?:\.\d+)?Z$/, 'Z').replace('T', ' ');
  console.info(`BatoMan ${__APP_VERSION__} ${short}${when ? ` ${when}` : ''}`);
  const el = document.getElementById('build-stamp');
  if (!el || sha === 'dev') return;
  el.textContent = when ? `${short} · ${when}` : short;
}

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('#game-canvas not found');
}

/**
 * Boot: load the first level's assets, build the App, wrap it in the shell.
 * `/` opens the title over the frozen default level; `?level=<id>` starts
 * that level directly; `?edit=1` opens it in the editor (a separate chunk).
 */
async function boot(): Promise<void> {
  const query = new URLSearchParams(location.search);
  const edit = query.get('edit') === '1';
  const direct = query.has('level') || edit;
  const levelId = direct ? levelIdFromQuery(location.search) : DEFAULT_LEVEL_ID;
  const level = await loadLevelById(levelId);
  const base = `${import.meta.env.BASE_URL}assets/`;
  const assets = await loadAssets(level, new HttpAssetSource(base));
  const app = new App(canvas as HTMLCanvasElement, hooks, level, assets, {
    post: postOptionsFromQuery(location.search),
    // Folded to null unless this is the e2e build (`VITE_E2E_LOCKSTEP=1`). Pages sets
    // `VITE_BASE_PATH` and runs `npm run build`, which does not define this flag.
    lockstep: import.meta.env.VITE_E2E_LOCKSTEP === '1' ? lockstepFromQuery(location.search) : null,
  });
  const audio = new GameAudio(import.meta.env.BASE_URL);
  const shell = new Shell(app, new Overlay(document.getElementById('overlay') ?? document.createElement('div')), audio, localStorage, {
    reduceMotion: reduceMotionQuery(location.search),
    unlockAll: resolveUnlockAll(import.meta.env.VITE_UNLOCK_ALL_LEVELS, location.search),
  });
  app.start();
  shell.start(direct ? levelId : null);
  if (edit) {
    const { Editor } = await import('@editor/editor');
    new Editor(app, assets).attach();
  }
}

boot().catch((e: unknown) => {
  hooks.errors.push(`boot failed: ${(e as Error).message}`);
  throw e;
});
