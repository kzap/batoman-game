import Phaser from 'phaser';

export class Player extends Phaser.Physics.Arcade.Sprite {
  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: { up: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
  private fireKey!: Phaser.Input.Keyboard.Key;

  // State
  private _health = 3;
  private _score = 0;
  private _maxHealth = 3;

  // Jump / coyote time
  private coyoteTimer = 0;
  private readonly COYOTE_LIMIT = 100;
  // Plasma buster / charge
  private chargeTimer = 0;
  private readonly CHARGE_THRESHOLD = 800;
  private isCharging = false;
  private fireRateTimer = 0;
  private readonly BURST_FIRE_RATE = 200; // ms between bursts

  // Animation state
  private isShooting = false;

  // Projectile group (set by GameScene)
  private projectiles!: Phaser.Physics.Arcade.Group;

  // Event emitter for HUD updates
  private onHealthChange?: (health: number) => void;
  private onScoreChange?: (score: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'batoman');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setGravityY(0); // uses world gravity
    body.setMaxVelocityX(280);
    body.setMaxVelocityY(800);
    // Trim physics hitbox to the visible character inside the 176×184 frame
    body.setSize(60, 100);
    body.setOffset(58, 60);

    this.setDepth(10);
    this.play('batoman-idle');

    this.setupInput(scene);
  }

  private setupInput(scene: Phaser.Scene) {
    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.wasdKeys = {
      up: scene.input.keyboard!.addKey('W'),
      left: scene.input.keyboard!.addKey('A'),
      right: scene.input.keyboard!.addKey('D'),
    };
    this.fireKey = scene.input.keyboard!.addKey('Z');
  }

  /** Called by GameScene — provides the projectile group to fire into */
  setProjectileGroup(group: Phaser.Physics.Arcade.Group) {
    this.projectiles = group;
  }

  setOnHealthChange(cb: (health: number) => void) { this.onHealthChange = cb; }
  setOnScoreChange(cb: (score: number) => void) { this.onScoreChange = cb; }

  get health() { return this._health; }
  get maxHealth() { return this._maxHealth; }
  get score() { return this._score; }

  addScore(amount: number) {
    this._score += amount;
    this.onScoreChange?.(this._score);
  }

  takeDamage(amount = 1) {
    this._health = Math.max(0, this._health - amount);
    this.onHealthChange?.(this._health);
    // Flash red on hit
    this.scene.tweens.add({
      targets: this,
      alpha: 0.2,
      duration: 80,
      yoyo: true,
      repeat: 3,
    });
    if (this._health <= 0) {
      this.emit('died');
    }
  }

  update(delta: number) {
    this.handleMovement();
    this.handleJump(delta);
    this.handleFire(delta);
    this.updateAnimation();
  }

  private handleMovement() {
    const left = this.cursors.left.isDown || this.wasdKeys.left.isDown;
    const right = this.cursors.right.isDown || this.wasdKeys.right.isDown;

    if (left) {
      this.setVelocityX(-220);
      this.setFlipX(true);
    } else if (right) {
      this.setVelocityX(220);
      this.setFlipX(false);
    } else {
      // Decelerate
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocityX(body.velocity.x * 0.75);
      if (Math.abs(body.velocity.x) < 5) body.setVelocityX(0);
    }
  }

  private handleJump(delta: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.wasdKeys.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space);
    const jumpReleased =
      Phaser.Input.Keyboard.JustUp(this.cursors.up) ||
      Phaser.Input.Keyboard.JustUp(this.wasdKeys.up) ||
      Phaser.Input.Keyboard.JustUp(this.cursors.space);

    // Update coyote timer
    if (onGround) {
      this.coyoteTimer = this.COYOTE_LIMIT;
    } else {
      this.coyoteTimer -= delta;
    }

    if (jumpPressed && this.coyoteTimer > 0) {
      this.setVelocityY(-580);
      this.coyoteTimer = 0;
    }

    // Variable jump height: cut upward velocity on early release
    if (jumpReleased && body.velocity.y < -200) {
      this.setVelocityY(-200);
    }
  }

  private handleFire(delta: number) {
    if (!this.projectiles) return;

    this.fireRateTimer = Math.max(0, this.fireRateTimer - delta);

    if (Phaser.Input.Keyboard.JustDown(this.fireKey)) {
      this.chargeTimer = 0;
      this.isCharging = true;
    }

    if (this.fireKey.isDown && this.isCharging) {
      this.chargeTimer += delta;
      // TODO: show charge VFX when chargeTimer > CHARGE_THRESHOLD * 0.7
    }

    if (Phaser.Input.Keyboard.JustUp(this.fireKey) && this.isCharging) {
      if (this.chargeTimer >= this.CHARGE_THRESHOLD) {
        this.fireNovaBlast();
      } else {
        this.firePlasmaBurst();
      }
      this.chargeTimer = 0;
      this.isCharging = false;
      this.fireRateTimer = this.BURST_FIRE_RATE;
      this.playShootAnim();
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
    const offsetX = dir * 20;

    const bullet = this.projectiles.create(
      this.x + offsetX,
      this.y,
      'plasma-burst'
    ) as Phaser.Physics.Arcade.Image;

    if (bullet) {
      bullet.setVelocityX(dir * 600);
      bullet.setDepth(9);
      // Auto-destroy when off camera bounds
      bullet.setData('type', 'burst');
    }
  }

  private fireNovaBlast() {
    const dir = this.flipX ? -1 : 1;
    const offsetX = dir * 20;

    const blast = this.projectiles.create(
      this.x + offsetX,
      this.y,
      'nova-blast'
    ) as Phaser.Physics.Arcade.Image;

    if (blast) {
      blast.setVelocityX(dir * 380);
      blast.setDepth(9);
      blast.setData('type', 'nova');
      blast.setScale(1.5);
    }
  }

  private updateAnimation() {
    // Shooting animation has highest priority — don't interrupt it
    if (this.isShooting) return;

    const body = this.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;
    const speedX = Math.abs(body.velocity.x);

    // Charging: show charge loop while holding fire key
    if (this.isCharging && this.chargeTimer >= this.CHARGE_THRESHOLD * 0.5) {
      this.playAnim('batoman-charge');
      return;
    }

    // Airborne
    if (!onGround) {
      const key = body.velocity.y < 0 ? 'batoman-jump' : 'batoman-fall';
      this.playAnim(key);
      return;
    }

    // Grounded
    if (speedX > 60) {
      this.playAnim('batoman-run');
    } else if (speedX > 5) {
      this.playAnim('batoman-walk');
    } else {
      this.playAnim('batoman-idle');
    }
  }

  /** Play animation only if it isn't already playing (avoids restart flicker) */
  private playAnim(key: string) {
    if (this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }
}
