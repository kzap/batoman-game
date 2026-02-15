import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { GAME_WIDTH } from '../config/gameConfig';

const PADDING = 16;
const HEART_SIZE = 22;
const HEART_GAP = 6;

export class UIScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private healthHearts: Phaser.GameObjects.Text[] = [];
  private scoreText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'UIScene' });
  }

  init(data: { gameScene: GameScene }) {
    this.gameScene = data.gameScene;
  }

  create() {
    const player = this.gameScene.getPlayer();

    this.createHealthBar(player.maxHealth);
    this.createScoreDisplay();

    // Listen for updates from GameScene events
    this.gameScene.events.on('health-changed', (health: number) => {
      this.updateHealthBar(health, player.maxHealth);
    }, this);

    this.gameScene.events.on('score-changed', (score: number) => {
      this.updateScore(score);
    }, this);

    // Clean up listeners when this scene stops
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.gameScene.events.off('health-changed');
      this.gameScene.events.off('score-changed');
    });
  }

  private createHealthBar(maxHealth: number) {
    this.add.text(PADDING, PADDING, 'HP', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#8888aa',
    }).setScrollFactor(0).setDepth(100);

    this.healthHearts = [];
    for (let i = 0; i < maxHealth; i++) {
      const heart = this.add.text(
        PADDING + 30 + i * (HEART_SIZE + HEART_GAP),
        PADDING - 2,
        '♥',
        { fontFamily: 'monospace', fontSize: `${HEART_SIZE}px`, color: '#ff4466' }
      ).setScrollFactor(0).setDepth(100);
      this.healthHearts.push(heart);
    }
  }

  private updateHealthBar(health: number, maxHealth: number) {
    for (let i = 0; i < maxHealth; i++) {
      this.healthHearts[i]?.setColor(i < health ? '#ff4466' : '#334455');
    }
  }

  private createScoreDisplay() {
    this.scoreText = this.add.text(GAME_WIDTH - PADDING, PADDING, 'SCORE  0', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#00eeff',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);
  }

  private updateScore(score: number) {
    this.scoreText.setText(`SCORE  ${score.toString().padStart(6, '0')}`);
  }
}
