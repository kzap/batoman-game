import { App, installHooks } from './app';

const hooks = installHooks();

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('#game-canvas not found');
}

try {
  new App(canvas, hooks).start();
} catch (e) {
  hooks.errors.push(`boot failed: ${(e as Error).message}`);
  throw e;
}
