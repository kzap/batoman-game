import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Load minimal assets needed to show the loading bar in PreloadScene
    // (nothing needed for now — loading bar is drawn with graphics)
  }

  create() {
    this.scene.start('PreloadScene');
  }
}
