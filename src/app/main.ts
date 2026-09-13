import { App } from './app';

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('#game-canvas not found');
}

const app = new App(canvas);
app.start();
