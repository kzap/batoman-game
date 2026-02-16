import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    this.createLoadingBar();

    // Backgrounds & parallax layers
    this.load.image('level-1-background', 'assets/level-1-background.png');
    this.load.image('level-1-midground', 'assets/level-1.png');
    this.load.image('level-1-foreground', 'assets/level-1-foreground.png');
    this.load.image('level-select', 'assets/level-select.png');

    // Music
    this.load.audio('bgm-level1', 'assets/level-1-music.mp3');

    // Player spritesheet — 8 columns × 4 rows, each frame 176×184px
    this.load.spritesheet('batoman', 'assets/batoman-sprites.png', {
      frameWidth: 176,
      frameHeight: 184,
    });

    // TODO: add tilemaps as levels are built in Tiled
    // this.load.tilemapTiledJSON('level1', 'assets/tilemaps/level1.json');
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
