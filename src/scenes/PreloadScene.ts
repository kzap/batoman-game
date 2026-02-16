import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    this.createLoadingBar();

    // Backgrounds & parallax layers
    this.load.image('level-1-background', 'assets/level-1/background.png');
    this.load.image('level-1-midground',  'assets/level-1/midground.png');
    this.load.image('level-1-foreground', 'assets/level-1/foreground.png');
    this.load.image('level-select', 'assets/level-select.png');

    // Tilesets
    this.load.image('level-1-tileset', 'assets/level-1/tileset.png');

    // Tilemaps
    this.load.tilemapTiledJSON('level1', 'assets/level-1/level-1.json');

    // Music
    this.load.audio('bgm-level1', 'assets/level-1/music.mp3');

    // Player spritesheet — 8 columns × 4 rows, each frame 176×184px
    this.load.spritesheet('batoman', 'assets/characters/batoman-sprites.png', {
      frameWidth: 176,
      frameHeight: 184,
    });

    // Level 1 enemy spritesheets — frame size TBD, verify against actual sprite art
    this.load.spritesheet('drone',     'assets/characters/drone-sprites.png',     { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('patroller', 'assets/characters/patroller-sprites.png', { frameWidth: 128, frameHeight: 128 });
  }

  create() {
    this.createProjectileTextures();
    this.scene.start('MenuScene');
  }

  // Create procedural textures for projectiles so firing never crashes.
  // Replace with real PNG assets when available.
  private createProjectileTextures() {
    if (!this.textures.exists('plasma-burst')) {
      const gfx = this.make.graphics({ x: 0, y: 0 }, false);
      // Cyan elongated bolt
      gfx.fillStyle(0x00eeff, 1);
      gfx.fillRect(0, 3, 16, 6);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(2, 5, 6, 2);
      gfx.generateTexture('plasma-burst', 16, 12);
      gfx.destroy();
    }

    if (!this.textures.exists('nova-blast')) {
      const gfx = this.make.graphics({ x: 0, y: 0 }, false);
      // Larger orange-yellow orb
      gfx.fillStyle(0xff8800, 1);
      gfx.fillCircle(12, 12, 10);
      gfx.fillStyle(0xffdd00, 1);
      gfx.fillCircle(12, 12, 6);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillCircle(10, 10, 3);
      gfx.generateTexture('nova-blast', 24, 24);
      gfx.destroy();
    }

    if (!this.textures.exists('checkpoint')) {
      const gfx = this.make.graphics({ x: 0, y: 0 }, false);
      gfx.fillStyle(0x00ff88, 1);
      gfx.fillRect(0, 0, 16, 48);
      gfx.fillStyle(0x00ffaa, 0.6);
      gfx.fillRect(2, 2, 12, 12);
      gfx.generateTexture('checkpoint', 16, 48);
      gfx.destroy();
    }
  }

  private createLoadingBar() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const barWidth = 400;
    const barHeight = 20;

    const bg = this.add.graphics();
    bg.fillStyle(0x222244, 1);
    bg.fillRect(cx - barWidth / 2 - 2, cy - barHeight / 2 - 2, barWidth + 4, barHeight + 4);

    const bar = this.add.graphics();

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
