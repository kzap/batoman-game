import Phaser from 'phaser';
import { Player } from '../objects/Player';
import { Enemy } from '../objects/Enemy';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;

  // Parallax background layers (TileSprite for infinite horizontal scroll)
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgMid!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;

  // Music
  private bgm!: Phaser.Sound.BaseSound;

  // World dimensions (expand as levels grow)
  private readonly WORLD_WIDTH = GAME_WIDTH * 3;
  private readonly WORLD_HEIGHT = GAME_HEIGHT;

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // Set world bounds
    this.physics.world.setBounds(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT);

    this.createAnimations();
    this.createPlaceholderTextures();
    this.createBackground();
    this.createPlatforms();
    this.createPlayer();
    this.createEnemies();
    this.createProjectiles();
    this.setupCollisions();
    this.setupCamera();
    this.startMusic();

    // Launch HUD overlay
    this.scene.launch('UIScene', { gameScene: this });
  }

  update(_time: number, delta: number) {
    this.player.update(delta);

    this.enemies.getChildren().forEach((e) => {
      (e as Enemy).update(delta);
    });

    this.cleanupProjectiles();
    this.updateParallax();
  }

  // ─── Animations ───────────────────────────────────────────────────────────

  private createAnimations() {
    // Spritesheet layout — 8 cols × 4 rows, 176×184px per frame
    // Row 0 (frames  0– 7): idle & walk
    // Row 1 (frames  8–15): run
    // Row 2 (frames 16–23): shoot / charge
    // Row 3 (frames 24–31): jump, fall, hurt, death

    const anim = this.anims;

    anim.create({
      key: 'batoman-idle',
      frames: anim.generateFrameNumbers('batoman', { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });

    anim.create({
      key: 'batoman-walk',
      frames: anim.generateFrameNumbers('batoman', { start: 4, end: 7 }),
      frameRate: 10,
      repeat: -1,
    });

    anim.create({
      key: 'batoman-run',
      frames: anim.generateFrameNumbers('batoman', { start: 8, end: 15 }),
      frameRate: 14,
      repeat: -1,
    });

    anim.create({
      key: 'batoman-shoot',
      frames: anim.generateFrameNumbers('batoman', { start: 16, end: 19 }),
      frameRate: 14,
      repeat: 0,
    });

    anim.create({
      key: 'batoman-charge',
      frames: anim.generateFrameNumbers('batoman', { start: 20, end: 23 }),
      frameRate: 8,
      repeat: -1,
    });

    anim.create({
      key: 'batoman-jump',
      frames: anim.generateFrameNumbers('batoman', { start: 24, end: 25 }),
      frameRate: 8,
      repeat: 0,
    });

    anim.create({
      key: 'batoman-fall',
      frames: anim.generateFrameNumbers('batoman', { start: 26, end: 27 }),
      frameRate: 8,
      repeat: 0,
    });

    anim.create({
      key: 'batoman-hurt',
      frames: anim.generateFrameNumbers('batoman', { start: 28, end: 29 }),
      frameRate: 12,
      repeat: 0,
    });

    anim.create({
      key: 'batoman-death',
      frames: anim.generateFrameNumbers('batoman', { start: 30, end: 31 }),
      frameRate: 8,
      repeat: 0,
    });
  }

  // ─── Placeholder Textures ────────────────────────────────────────────────

  private createPlaceholderTextures() {
    if (!this.textures.exists('enemy-placeholder')) {
      const gfx = this.make.graphics({ x: 0, y: 0 }, false);
      gfx.fillStyle(0xff2244);
      gfx.fillRect(0, 0, 32, 32);
      gfx.generateTexture('enemy-placeholder', 32, 32);
      gfx.destroy();
    }
  }

  // ─── Background ───────────────────────────────────────────────────────────

  private createBackground() {
    // All layers use TileSprite so they tile infinitely horizontally.
    // setScrollFactor(0) pins them to the camera — we manually drive
    // tilePositionX in updateParallax() to create the depth illusion.
    //
    // Scroll rates:  far=0.05  mid=0.25  near=0.6
    // (lower = further away / slower)

    // Layer 1 — far background (sky / city horizon)
    this.bgFar = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'level-1-background')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0);

    // Layer 2 — midground (city structures)
    this.bgMid = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'level-1-midground')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1);

    // Layer 3 — near foreground (close elements, mist, pipes)
    this.bgNear = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'level-1-foreground')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2);
  }

  private updateParallax() {
    const scrollX = this.cameras.main.scrollX;
    this.bgFar.tilePositionX  = scrollX * 0.05;
    this.bgMid.tilePositionX  = scrollX * 0.25;
    this.bgNear.tilePositionX = scrollX * 0.6;
  }

  // ─── Platforms ────────────────────────────────────────────────────────────

  private createPlatforms() {
    this.platforms = this.physics.add.staticGroup();

    // Ground — full width of world, bright enough to see against dark backgrounds
    const groundGlow = this.add.rectangle(
      this.WORLD_WIDTH / 2,
      this.WORLD_HEIGHT - 24,
      this.WORLD_WIDTH,
      52,
      0x00eeff,
      0.15
    );
    groundGlow.setDepth(3);
    const ground = this.add.rectangle(
      this.WORLD_WIDTH / 2,
      this.WORLD_HEIGHT - 24,
      this.WORLD_WIDTH,
      48,
      0x1a3a4a
    );
    ground.setDepth(4);
    // Bright top edge for ground
    const groundEdge = this.add.rectangle(
      this.WORLD_WIDTH / 2,
      this.WORLD_HEIGHT - 48,
      this.WORLD_WIDTH,
      2,
      0x00eeff
    );
    groundEdge.setDepth(4);
    this.physics.add.existing(ground, true);
    this.platforms.add(ground);

    // Floating platforms (placeholder layout — replace with Tiled tilemap)
    const platformData = [
      { x: 300, y: 580, w: 160, h: 20 },
      { x: 550, y: 500, w: 160, h: 20 },
      { x: 800, y: 430, w: 200, h: 20 },
      { x: 1100, y: 520, w: 160, h: 20 },
      { x: 1350, y: 440, w: 200, h: 20 },
      { x: 1650, y: 560, w: 160, h: 20 },
      { x: 1900, y: 480, w: 200, h: 20 },
    ];

    for (const p of platformData) {
      // Glow behind platform
      const glow = this.add.rectangle(p.x, p.y, p.w + 8, p.h + 8, 0x00eeff, 0.2);
      glow.setDepth(3);
      // Main platform body
      const plat = this.add.rectangle(p.x, p.y, p.w, p.h, 0x00eeff);
      plat.setDepth(4);
      // Dark inner fill for contrast
      const inner = this.add.rectangle(p.x, p.y, p.w - 4, p.h - 4, 0x0a2a3a);
      inner.setDepth(4);
      this.physics.add.existing(plat, true);
      this.platforms.add(plat);
    }
  }

  // ─── Player ───────────────────────────────────────────────────────────────

  private createPlayer() {
    this.player = new Player(this, 100, this.WORLD_HEIGHT - 100);

    // Pass HUD update callbacks (UIScene picks these up via events)
    this.player.setOnHealthChange((health) => {
      this.events.emit('health-changed', health);
    });
    this.player.setOnScoreChange((score) => {
      this.events.emit('score-changed', score);
    });

    this.player.on('died', () => this.onPlayerDied());
  }

  private onPlayerDied() {
    this.scene.stop('UIScene');
    // TODO: transition to game over scene
    this.time.delayedCall(500, () => {
      this.scene.start('MenuScene');
    });
  }

  // ─── Enemies ──────────────────────────────────────────────────────────────

  private createEnemies() {
    this.enemies = this.physics.add.group({ classType: Enemy });

    // Placeholder patrol enemies — replace with tilemap object layer
    const enemySpawns = [
      { x: 600, y: this.WORLD_HEIGHT - 80 },
      { x: 1200, y: this.WORLD_HEIGHT - 80 },
      { x: 1800, y: this.WORLD_HEIGHT - 80 },
    ];

    for (const spawn of enemySpawns) {
      // Use a placeholder rectangle until enemy sprites are ready
      const enemy = new Enemy(this, spawn.x, spawn.y, 'enemy-placeholder', {
        health: 2,
        speed: 70,
        scoreValue: 100,
        patrolDistance: 120,
      });
      enemy.on('enemy-died', (e: Enemy) => {
        this.player.addScore(e.scoreValue);
      });
      this.enemies.add(enemy);
    }
  }

  // ─── Projectiles ──────────────────────────────────────────────────────────

  private createProjectiles() {
    this.projectiles = this.physics.add.group({
      allowGravity: false,
    });
    this.player.setProjectileGroup(this.projectiles);
  }

  private cleanupProjectiles() {
    const cam = this.cameras.main;
    this.projectiles.getChildren().forEach((p) => {
      const proj = p as Phaser.Physics.Arcade.Image;
      // Destroy if outside camera view + buffer
      if (
        proj.x < cam.scrollX - 100 ||
        proj.x > cam.scrollX + GAME_WIDTH + 100
      ) {
        proj.destroy();
      }
    });
  }

  // ─── Collisions ───────────────────────────────────────────────────────────

  private setupCollisions() {
    // Player ↔ platforms
    this.physics.add.collider(this.player, this.platforms);

    // Enemies ↔ platforms
    this.physics.add.collider(this.enemies, this.platforms);

    // Projectiles ↔ platforms
    this.physics.add.collider(
      this.projectiles,
      this.platforms,
      (proj) => { (proj as Phaser.Physics.Arcade.Image).destroy(); }
    );

    // Projectiles ↔ enemies
    this.physics.add.overlap(
      this.projectiles,
      this.enemies,
      (proj, enemy) => {
        const damage = (proj as Phaser.Physics.Arcade.Image).getData('type') === 'nova' ? 3 : 1;
        (proj as Phaser.Physics.Arcade.Image).destroy();
        (enemy as Enemy).takeDamage(damage);
      }
    );

    // Player ↔ enemies (contact damage)
    this.physics.add.overlap(
      this.player,
      this.enemies,
      () => { this.player.takeDamage(1); }
    );
  }

  // ─── Camera ───────────────────────────────────────────────────────────────

  private setupCamera() {
    this.cameras.main.setBounds(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
  }

  // ─── Music ────────────────────────────────────────────────────────────────

  private startMusic() {
    // Stop any existing instance (e.g. if scene restarts)
    if (this.bgm) this.bgm.stop();

    this.bgm = this.sound.add('bgm-level1', { loop: true, volume: 0.6 });
    this.bgm.play();

    // Clean up when scene shuts down (back to menu, game over, etc.)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bgm?.stop();
    });
  }

  // ─── Public accessors (for UIScene) ───────────────────────────────────────

  getPlayer(): Player {
    return this.player;
  }
}
