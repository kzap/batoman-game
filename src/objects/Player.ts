import Phaser from 'phaser';

export class Player extends Phaser.Physics.Arcade.Sprite {
  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: { up: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key };
  private fireKey!: Phaser.Input.Keyboard.Key;

  // Stats
  private _health = 3;
  private _maxHealth = 3;
  private _lives = 3;
  private _score = 0;

  // Jump / coyote time
  private coyoteTimer = 0;
  private readonly COYOTE_LIMIT = 100;

  // Plasma buster / charge
  private chargeTimer = 0;
  private readonly CHARGE_THRESHOLD = 800;
  private isCharging = false;
  private fireRateTimer = 0;
  private readonly BURST_FIRE_RATE = 200;

  // Hurt stun
  private hurtTimer = 0;
  private readonly HURT_STUN = 300;

  // Animation state
  private isShooting = false;
  private isHurt = false;

  // Projectile group (set by GameScene)
  private projectiles!: Phaser.Physics.Arcade.Group;

  // HUD callbacks
  private onHealthChange?: (health: number) => void;
  private onScoreChange?:  (score: number)  => void;
  private onLivesChange?:  (lives: number)  => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'batoman');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setGravityY(0);
    body.setMaxVelocityX(280);
    body.setMaxVelocityY(800);
    body.setSize(60, 112);
    body.setOffset(58, 60);
    body.setCollideWorldBounds(true);

    this.setDepth(10);
    this.setScale(2);
    this.play('batoman-idle');
    this.setupInput(scene);
  }

  private setupInput(scene: Phaser.Scene) {
    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.wasdKeys = {
      up:    scene.input.keyboard!.addKey('W'),
      left:  scene.input.keyboard!.addKey('A'),
      right: scene.input.keyboard!.addKey('D'),
      down:  scene.input.keyboard!.addKey('S'),
    };
    this.fireKey = scene.input.keyboard!.addKey('Z');
  }

  setProjectileGroup(group: Phaser.Physics.Arcade.Group)         { this.projectiles = group; }
  setOnHealthChange(cb: (health: number) => void)                { this.onHealthChange = cb; }
  setOnScoreChange(cb: (score: number)   => void)                { this.onScoreChange  = cb; }
  setOnLivesChange(cb: (lives: number)   => void)                { this.onLivesChange  = cb; }

  get health()    { return this._health; }
  get maxHealth() { return this._maxHealth; }
  get lives()     { return this._lives; }
  get score()     { return this._score; }

  addScore(amount: number) {
    this._score += amount;
    this.onScoreChange?.(this._score);
  }

  takeDamage(amount = 1) {
    // Ignore damage while hurt-stunned or already dead
    if (this.hurtTimer > 0 || this._health <= 0) return;

    this._health = Math.max(0, this._health - amount);
    this.onHealthChange?.(this._health);

    this.isHurt = true;
    this.hurtTimer = this.HURT_STUN;
    this.play('batoman-hurt', true);

    // Invincibility flash
    this.scene.tweens.add({
      targets: this,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: 5,
      onComplete: () => { this.setAlpha(1); },
    });

    if (this._health <= 0) {
      this.onDie();
    }
  }

  private onDie() {
    this.play('batoman-death', true);
    this._lives -= 1;
    this.onLivesChange?.(this._lives);
    this.emit('died');
  }

  /** Called by GameScene to respawn player at a position (after lives > 0) */
  respawn(x: number, y: number) {
    this.setPosition(x, y);
    this._health = this._maxHealth;
    this.hurtTimer = 0;
    this.isHurt = false;
    this.isShooting = false;
    this.setAlpha(1);
    this.setVelocity(0, 0);
    this.play('batoman-idle', true);
    this.onHealthChange?.(this._health);
  }

  update(delta: number) {
    // Decrement stun timer
    if (this.hurtTimer > 0) {
      this.hurtTimer -= delta;
      if (this.hurtTimer <= 0) {
        this.hurtTimer = 0;
        this.isHurt = false;
      }
    }

    if (this._health <= 0) return; // dead — no further input

    this.handleMovement(delta);
    this.handleJump(delta);
    this.handleFire(delta);
    this.updateAnimation();
  }

  private handleMovement(delta: number) {
    if (this.isHurt) return; // stun — no horizontal control

    const left  = this.cursors.left.isDown  || this.wasdKeys.left.isDown;
    const right = this.cursors.right.isDown || this.wasdKeys.right.isDown;
    const body  = this.body as Phaser.Physics.Arcade.Body;

    // Salakot dash: down + direction
    const down  = this.cursors.down.isDown || this.wasdKeys.down.isDown;
    if (down && body.blocked.down && (left || right)) {
      const dir = left ? -1 : 1;
      this.setVelocityX(RUN_SPEED * 1.5 * dir);
      this.setFlipX(dir < 0);
      body.setSize(60, 72);
      body.setOffset(58, 100);
      return;
    } else {
      body.setSize(60, 112);
      body.setOffset(58, 60);
    }

    if (left) {
      this.setVelocityX(-RUN_SPEED);
      this.setFlipX(true);
    } else if (right) {
      this.setVelocityX(RUN_SPEED);
      this.setFlipX(false);
    } else {
      // Smooth deceleration
      const vx = body.velocity.x;
      body.setVelocityX(vx * DECEL_FACTOR);
      if (Math.abs(vx) < STOP_THRESHOLD) body.setVelocityX(0);
    }

    // Suppress delta warning — delta used indirectly via timer
    void delta;
  }

  private handleJump(delta: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up)    ||
      Phaser.Input.Keyboard.JustDown(this.wasdKeys.up)   ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space);
    const jumpReleased =
      Phaser.Input.Keyboard.JustUp(this.cursors.up)    ||
      Phaser.Input.Keyboard.JustUp(this.wasdKeys.up)   ||
      Phaser.Input.Keyboard.JustUp(this.cursors.space);

    if (onGround) {
      this.coyoteTimer = this.COYOTE_LIMIT;
    } else {
      this.coyoteTimer -= delta;
    }

    if (jumpPressed && this.coyoteTimer > 0 && !this.isHurt) {
      this.setVelocityY(JUMP_VELOCITY);
      this.coyoteTimer = 0;
      // TODO: play sfx-jump when audio assets are available
    }

    if (jumpReleased && body.velocity.y < JUMP_CUT_VEL) {
      this.setVelocityY(JUMP_CUT_VEL);
    }

    // Wall kick
    if (jumpPressed && !body.blocked.down) {
      if (body.blocked.left) {
        this.setVelocityX(RUN_SPEED);
        this.setVelocityY(JUMP_VELOCITY * 0.9);
        this.setFlipX(false);
        this.coyoteTimer = 0;
      } else if (body.blocked.right) {
        this.setVelocityX(-RUN_SPEED);
        this.setVelocityY(JUMP_VELOCITY * 0.9);
        this.setFlipX(true);
        this.coyoteTimer = 0;
      }
    }
  }

  private handleFire(delta: number) {
    if (!this.projectiles || this.isHurt) return;

    this.fireRateTimer = Math.max(0, this.fireRateTimer - delta);

    if (Phaser.Input.Keyboard.JustDown(this.fireKey)) {
      this.chargeTimer = 0;
      this.isCharging = true;
    }

    if (this.fireKey.isDown && this.isCharging) {
      this.chargeTimer += delta;
    }

    if (Phaser.Input.Keyboard.JustUp(this.fireKey) && this.isCharging) {
      if (this.chargeTimer >= this.CHARGE_THRESHOLD) {
        this.fireNovaBlast();
      } else {
        this.firePlasmaBurst();
      }
      this.chargeTimer = 0;
      this.isCharging  = false;
      this.fireRateTimer = this.BURST_FIRE_RATE;
      this.playShootAnim();
      // TODO: play sfx-shoot when audio assets are available
    }
  }

  private playShootAnim() {
    this.isShooting = true;
    this.play('batoman-shoot', true);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'batoman-shoot', () => {
      this.isShooting = false;
    });
  }

  private firePlasmaBurst() {
    if (this.fireRateTimer > 0) return;
    const dir = this.flipX ? -1 : 1;
    const bullet = this.projectiles.create(
      this.x + dir * 20, this.y, 'plasma-burst'
    ) as Phaser.Physics.Arcade.Image;
    if (bullet) {
      bullet.setVelocityX(dir * 600);
      bullet.setDepth(9);
      bullet.setData('type', 'burst');
    }
  }

  private fireNovaBlast() {
    const dir = this.flipX ? -1 : 1;
    const blast = this.projectiles.create(
      this.x + dir * 20, this.y, 'nova-blast'
    ) as Phaser.Physics.Arcade.Image;
    if (blast) {
      blast.setVelocityX(dir * 380);
      blast.setDepth(9);
      blast.setScale(1.5);
      blast.setData('type', 'nova');
    }
  }

  private updateAnimation() {
    if (this.isShooting || this.isHurt || this._health <= 0) return;

    const body = this.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;
    const speedX   = Math.abs(body.velocity.x);

    if (this.isCharging && this.chargeTimer >= this.CHARGE_THRESHOLD * 0.5) {
      this.playAnim('batoman-charge');
      return;
    }

    if (!onGround) {
      this.playAnim(body.velocity.y < 0 ? 'batoman-jump' : 'batoman-fall');
      return;
    }

    if (speedX > 60)      this.playAnim('batoman-run');
    else if (speedX > 5)  this.playAnim('batoman-walk');
    else                  this.playAnim('batoman-idle');
  }

  private playAnim(key: string) {
    if (this.anims.currentAnim?.key !== key) this.play(key, true);
  }
}

// Movement constants — matches TDD Section 6.2
const RUN_SPEED     = 220;
const DECEL_FACTOR  = 0.75;
const STOP_THRESHOLD = 5;
const JUMP_VELOCITY = -580;
const JUMP_CUT_VEL  = -200;
