import Phaser from 'phaser';
import { Player } from '../objects/Player';
import { Enemy } from '../objects/Enemy';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;

  // Parallax background layers
  private bgFar!: Phaser.GameObjects.Image;

  // World dimensions (expand as levels grow)
  private readonly WORLD_WIDTH = GAME_WIDTH * 3;
  private readonly WORLD_HEIGHT = GAME_HEIGHT;

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // Set world bounds
    this.physics.world.setBounds(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT);

    this.createBackground();
    this.createPlatforms();
    this.createPlayer();
    this.createEnemies();
    this.createProjectiles();
    this.setupCollisions();
    this.setupCamera();

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

  // ─── Background ───────────────────────────────────────────────────────────

  private createBackground() {
    // Static far background — scrolls at 0 (fixed to camera via setScrollFactor)
    this.bgFar = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'level-1-background')
      .setScrollFactor(0)
      .setDepth(0);

    // Scale to fill viewport
    this.bgFar.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
  }

  private updateParallax() {
    // When additional parallax layers are added, update tilePositionX here:
    // this.bgMid.tilePositionX = this.cameras.main.scrollX * 0.4;
  }

  // ─── Platforms ────────────────────────────────────────────────────────────

  private createPlatforms() {
    this.platforms = this.physics.add.staticGroup();

    // Ground — full width of world
    const ground = this.add.rectangle(
      this.WORLD_WIDTH / 2,
      this.WORLD_HEIGHT - 24,
      this.WORLD_WIDTH,
      48,
      0x223344
    );
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
      const plat = this.add.rectangle(p.x, p.y, p.w, p.h, 0x00eeff, 0.8);
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

  // ─── Public accessors (for UIScene) ───────────────────────────────────────

  getPlayer(): Player {
    return this.player;
  }
}
