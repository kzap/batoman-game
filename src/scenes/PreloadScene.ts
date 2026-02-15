import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    this.createLoadingBar();

    // Backgrounds
    this.load.image('level-1-background', 'assets/level-1-background.png');
    this.load.image('level-select', 'assets/level-select.png');

    // TODO: add spritesheets, tilemaps, and audio as assets become available
    // this.load.spritesheet('batoman', 'assets/images/batoman.png', { frameWidth: 32, frameHeight: 48 });
    // this.load.tilemapTiledJSON('level1', 'assets/tilemaps/level1.json');
    // this.load.audio('bgm-level1', 'assets/audio/bgm-level1.mp3');
  }

  create() {
    this.scene.start('MenuScene');
  }

  private createLoadingBar() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const barWidth = 400;
    const barHeight = 20;

    // Background bar
    const bg = this.add.graphics();
    bg.fillStyle(0x222244, 1);
    bg.fillRect(cx - barWidth / 2 - 2, cy - barHeight / 2 - 2, barWidth + 4, barHeight + 4);

    // Fill bar
    const bar = this.add.graphics();

    // Title text
    this.add.text(cx, cy - 50, 'BATOMAN', {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#00eeff',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 40, 'LOADING...', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#8888aa',
    }).setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      bar.clear();
      bar.fillStyle(0x00eeff, 1);
      bar.fillRect(cx - barWidth / 2, cy - barHeight / 2, barWidth * value, barHeight);
    });
  }
}
