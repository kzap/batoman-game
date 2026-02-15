import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';

export class MenuScene extends Phaser.Scene {
  private enterKey!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Background
    this.add.image(cx, cy, 'level-select').setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    // Dark overlay
    this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45);

    // Title
    this.add.text(cx, cy - 180, 'BATOMAN', {
      fontFamily: 'monospace',
      fontSize: '72px',
      color: '#00eeff',
      stroke: '#003344',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 110, 'Neo-Maynila, 2147', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#aaddff',
    }).setOrigin(0.5);

    // Start prompt with blinking animation
    const startText = this.add.text(cx, cy + 60, 'PRESS ENTER TO START', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: startText,
      alpha: 0,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    // Controls hint
    this.add.text(cx, cy + 160, 'ARROWS / WASD — Move     Z — Fire / Charge Shot', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#667799',
    }).setOrigin(0.5);

    // Input
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  update() {
    if (
      Phaser.Input.Keyboard.JustDown(this.enterKey) ||
      Phaser.Input.Keyboard.JustDown(this.spaceKey)
    ) {
      this.scene.start('GameScene', { level: 1 });
    }
  }
}
