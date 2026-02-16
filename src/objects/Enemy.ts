import Phaser from 'phaser';

export type EnemyType = 'patroller' | 'drone' | 'stationary';

export interface EnemyConfig {
  type?: EnemyType;
  health?: number;
  speed?: number;
  scoreValue?: number;
  patrolDistance?: number;
}

// Map enemy type to texture key and animation prefix
const ENEMY_TEXTURES: Record<EnemyType, string> = {
  patroller: 'patroller',
  drone:     'drone',
  stationary: 'patroller',
};

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  protected _health: number;
  protected _maxHealth: number;
  protected _scoreValue: number;
  protected _speed: number;
  protected _type: EnemyType;

  private patrolDistance: number;
  private startX: number;
  private patrolDir = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, config: EnemyConfig = {}) {
    const type: EnemyType = config.type ?? 'patroller';
    const texture = ENEMY_TEXTURES[type];
    super(scene, x, y, texture);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this._health     = config.health      ?? 2;
    this._maxHealth  = this._health;
    this._scoreValue = config.scoreValue  ?? 100;
    this._speed      = config.speed       ?? 80;
    this._type       = type;
    this.patrolDistance = config.patrolDistance ?? 120;
    this.startX      = x;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);

    // Scale down to match the gameplay visual size
    // TODO: verify once actual frame size is confirmed in assets.json
    this.setScale(0.5);
    this.setDepth(8);

    this.playIdleAnim();
  }

  get health()     { return this._health; }
  get scoreValue() { return this._scoreValue; }

  takeDamage(amount = 1): boolean {
    this._health -= amount;
    this.scene.tweens.add({
      targets: this,
      alpha: 0.3,
      duration: 60,
      yoyo: true,
      repeat: 2,
    });
    if (this._health <= 0) {
      this.onDeath();
      return true;
    }
    return false;
  }

  protected onDeath() {
    this.emit('enemy-died', this);
    this.destroy();
  }

  update(_delta: number) {
    if (this._type === 'drone') {
      this.updatePatrol(true);
    } else {
      this.updatePatrol(false);
    }
  }

  private updatePatrol(floating: boolean) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.setVelocityX(this._speed * this.patrolDir);
    this.setFlipX(this.patrolDir < 0);

    if (floating) {
      // Drones maintain a fixed vertical position — no gravity
      body.setAllowGravity(false);
      // Gentle sine-wave vertical movement is driven by the caller if desired
    }

    const distFromStart = this.x - this.startX;
    if (distFromStart > this.patrolDistance || body.blocked.right) {
      this.patrolDir = -1;
    } else if (distFromStart < -this.patrolDistance || body.blocked.left) {
      this.patrolDir = 1;
    }
  }

  private playIdleAnim() {
    const key = `${this._type}-idle`;
    if (this.scene.anims.exists(key)) {
      this.play(key, true);
    }
  }
}
