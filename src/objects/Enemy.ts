import Phaser from 'phaser';

export type EnemyType = 'patrol' | 'stationary';

export interface EnemyConfig {
  type?: EnemyType;
  health?: number;
  speed?: number;
  scoreValue?: number;
  patrolDistance?: number;
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  protected _health: number;
  protected _maxHealth: number;
  protected _scoreValue: number;
  protected _speed: number;
  protected _type: EnemyType;

  // Patrol
  private patrolDistance: number;
  private startX: number;
  private patrolDir = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, config: EnemyConfig = {}) {
    super(scene, x, y, texture);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this._health = config.health ?? 2;
    this._maxHealth = this._health;
    this._scoreValue = config.scoreValue ?? 100;
    this._speed = config.speed ?? 80;
    this._type = config.type ?? 'patrol';
    this.patrolDistance = config.patrolDistance ?? 120;
    this.startX = x;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    this.setDepth(8);
  }

  get health() { return this._health; }
  get scoreValue() { return this._scoreValue; }

  takeDamage(amount = 1): boolean {
    this._health -= amount;
    // Flash white on hit
    this.scene.tweens.add({
      targets: this,
      alpha: 0.3,
      duration: 60,
      yoyo: true,
      repeat: 2,
    });
    if (this._health <= 0) {
      this.onDeath();
      return true; // dead
    }
    return false;
  }

  protected onDeath() {
    // Emit event so GameScene can award score and clean up
    this.emit('enemy-died', this);
    this.destroy();
  }

  update(_delta: number) {
    if (this._type === 'patrol') {
      this.updatePatrol();
    }
  }

  private updatePatrol() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.setVelocityX(this._speed * this.patrolDir);
    this.setFlipX(this.patrolDir < 0);

    // Flip direction at patrol bounds or when hitting a wall
    const distFromStart = this.x - this.startX;
    if (distFromStart > this.patrolDistance || body.blocked.right) {
      this.patrolDir = -1;
    } else if (distFromStart < -this.patrolDistance || body.blocked.left) {
      this.patrolDir = 1;
    }
  }
}
