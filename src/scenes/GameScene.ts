import Phaser from 'phaser';
import { Player } from '../objects/Player';
import { Enemy, EnemyType } from '../objects/Enemy';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';
import { LevelLoader, LoadedLevel, SpawnData } from '../systems/LevelLoader';
import { CheckpointSystem } from '../systems/CheckpointSystem';
import { LEVELS, LevelConfig } from '../data/levels';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.Physics.Arcade.Group;

  // Parallax layers
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgMid!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;

  // Level data
  private levelCfg!: LevelConfig;
  private loadedLevel!: LoadedLevel;

  // Systems
  private checkpoints!: CheckpointSystem;

  // Music
  private bgm!: Phaser.Sound.BaseSound;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data?: { level?: number }) {
    const levelIndex = data?.level ?? 1;
    this.levelCfg = LEVELS.find(l => l.index === levelIndex) ?? LEVELS[0];
  }

  create() {
    this.checkpoints = new CheckpointSystem();

    this.createAnimations();
    this.createBackground();
    this.loadLevel();        // builds tilemap layers + enemies group; no player deps yet
    this.createPlayer();     // player must exist before spawnObjects registers overlaps
    this.spawnObjects(this.loadedLevel.spawns);
    this.createProjectiles();
    this.setupCollisions();
    this.setupCamera();
    this.startMusic();

    this.scene.launch('UIScene', { gameScene: this });
  }

  update(_time: number, delta: number) {
    this.player.update(delta);

    this.enemies.getChildren().forEach(e => {
      (e as Enemy).update(delta);
    });

    this.cleanupProjectiles();
    this.updateParallax();
  }

  // ─── Animations ───────────────────────────────────────────────────────────

  private createAnimations() {
    // Guard: animations are global; skip if already created (e.g. scene restart)
    if (this.anims.exists('batoman-idle')) return;

    const anim = this.anims;

    // Player
    anim.create({ key: 'batoman-idle',   frames: anim.generateFrameNumbers('batoman', { start: 0,  end: 3  }), frameRate: 6,  repeat: -1 });
    anim.create({ key: 'batoman-walk',   frames: anim.generateFrameNumbers('batoman', { start: 4,  end: 7  }), frameRate: 10, repeat: -1 });
    anim.create({ key: 'batoman-run',    frames: anim.generateFrameNumbers('batoman', { start: 8,  end: 15 }), frameRate: 14, repeat: -1 });
    anim.create({ key: 'batoman-shoot',  frames: anim.generateFrameNumbers('batoman', { start: 16, end: 19 }), frameRate: 14, repeat: 0  });
    anim.create({ key: 'batoman-charge', frames: anim.generateFrameNumbers('batoman', { start: 20, end: 23 }), frameRate: 8,  repeat: -1 });
    anim.create({ key: 'batoman-jump',   frames: anim.generateFrameNumbers('batoman', { start: 24, end: 25 }), frameRate: 8,  repeat: 0  });
    anim.create({ key: 'batoman-fall',   frames: anim.generateFrameNumbers('batoman', { start: 26, end: 27 }), frameRate: 8,  repeat: 0  });
    anim.create({ key: 'batoman-hurt',   frames: anim.generateFrameNumbers('batoman', { start: 28, end: 29 }), frameRate: 12, repeat: 0  });
    anim.create({ key: 'batoman-death',  frames: anim.generateFrameNumbers('batoman', { start: 30, end: 31 }), frameRate: 8,  repeat: 0  });

    // Enemies — using first 4 frames of row 0 for idle loop
    anim.create({ key: 'patroller-idle', frames: anim.generateFrameNumbers('patroller', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    anim.create({ key: 'drone-idle',     frames: anim.generateFrameNumbers('drone',     { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
  }

  // ─── Background ───────────────────────────────────────────────────────────

  private createBackground() {
    const cfg = this.levelCfg;
    this.bgFar = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, cfg.bgKeys.far)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(0);
    this.bgMid = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, cfg.bgKeys.mid)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1);
    this.bgNear = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, cfg.bgKeys.near)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(2);
  }

  private updateParallax() {
    const sx = this.cameras.main.scrollX;
    this.bgFar.tilePositionX  = sx * 0.05;
    this.bgMid.tilePositionX  = sx * 0.25;
    this.bgNear.tilePositionX = sx * 0.60;
  }

  // ─── Level ────────────────────────────────────────────────────────────────

  private loadLevel() {
    const loader = new LevelLoader(this);
    this.loadedLevel = loader.load(this.levelCfg);

    this.physics.world.setBounds(0, 0, this.loadedLevel.worldWidth, this.loadedLevel.worldHeight);

    // Enemies group created here; spawnObjects() called separately after createPlayer()
    this.enemies = this.physics.add.group({ classType: Enemy });
  }

  private spawnObjects(spawns: SpawnData[]) {
    for (const spawn of spawns) {
      switch (spawn.type) {
        case 'enemy':
          this.spawnEnemy(spawn);
          break;
        case 'checkpoint':
          this.spawnCheckpoint(spawn);
          break;
        case 'death-zone':
          this.spawnDeathZone(spawn);
          break;
      }
    }
  }

  private spawnEnemy(spawn: SpawnData) {
    const enemyType = (spawn.properties['enemyType'] as EnemyType) ?? 'patroller';
    const patrolDist = (spawn.properties['patrolDistance'] as number) ?? 120;
    const enemy = new Enemy(this, spawn.x, spawn.y, {
      type:           enemyType,
      health:         2,
      speed:          70,
      scoreValue:     100,
      patrolDistance: patrolDist,
    });
    enemy.on('enemy-died', (e: Enemy) => {
      this.player.addScore(e.scoreValue);
    });
    this.enemies.add(enemy);
  }

  private spawnCheckpoint(spawn: SpawnData) {
    const marker = this.add.image(spawn.x, spawn.y, 'checkpoint')
      .setDepth(5)
      .setScrollFactor(1);

    // Simple overlap zone
    const zone = this.add.zone(spawn.x, spawn.y, spawn.width, spawn.height);
    this.physics.world.enable(zone);
    (zone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    this.physics.add.overlap(this.player, zone, () => {
      if (this.checkpoints.getSpawnPoint(0, 0).x !== spawn.x) {
        this.checkpoints.activate(spawn.x, this.levelCfg.startY);
        // Flash the marker green
        this.tweens.add({ targets: marker, alpha: 0.5, duration: 200, yoyo: true, repeat: 2 });
        this.events.emit('checkpoint-activated');
      }
    });
  }

  private spawnDeathZone(spawn: SpawnData) {
    const zone = this.add.zone(spawn.x + spawn.width / 2, spawn.y + spawn.height / 2, spawn.width, spawn.height);
    this.physics.world.enable(zone);
    (zone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    this.physics.add.overlap(this.player, zone, () => {
      // Instant kill — bypass hurt stun
      this.player.takeDamage(99);
    });
  }

  // ─── Player ───────────────────────────────────────────────────────────────

  private createPlayer() {
    const { startX, startY } = this.levelCfg;
    this.player = new Player(this, startX, startY);

    this.player.setOnHealthChange(hp  => this.events.emit('health-changed', hp));
    this.player.setOnScoreChange(sc   => this.events.emit('score-changed', sc));
    this.player.setOnLivesChange(lv   => this.events.emit('lives-changed', lv));

    this.player.on('died', () => this.onPlayerDied());
  }

  private onPlayerDied() {
    if (this.player.lives > 0) {
      // Respawn after a short delay
      this.time.delayedCall(1500, () => {
        const pt = this.checkpoints.getSpawnPoint(this.levelCfg.startX, this.levelCfg.startY);
        this.player.respawn(pt.x, pt.y);
        this.events.emit('health-changed', this.player.health);
        this.events.emit('lives-changed', this.player.lives);
      });
    } else {
      // Game over
      this.time.delayedCall(800, () => {
        this.scene.stop('UIScene');
        this.scene.start('MenuScene');
      });
    }
  }

  // ─── Projectiles ──────────────────────────────────────────────────────────

  private createProjectiles() {
    this.projectiles = this.physics.add.group({ allowGravity: false });
    this.player.setProjectileGroup(this.projectiles);
  }

  private cleanupProjectiles() {
    const cam = this.cameras.main;
    this.projectiles.getChildren().forEach(p => {
      const proj = p as Phaser.Physics.Arcade.Image;
      if (proj.x < cam.scrollX - 100 || proj.x > cam.scrollX + GAME_WIDTH + 100) {
        proj.destroy();
      }
    });
  }

  // ─── Collisions ───────────────────────────────────────────────────────────

  private setupCollisions() {
    const { platformLayer, hazardLayer } = this.loadedLevel;

    this.physics.add.collider(this.player, platformLayer);
    this.physics.add.collider(this.enemies, platformLayer);

    if (hazardLayer) {
      this.physics.add.overlap(this.player, hazardLayer, () => {
        this.player.takeDamage(1);
      });
    }

    this.physics.add.collider(this.projectiles, platformLayer, proj => {
      (proj as Phaser.Physics.Arcade.Image).destroy();
    });

    this.physics.add.overlap(this.projectiles, this.enemies, (proj, enemy) => {
      const damage = (proj as Phaser.Physics.Arcade.Image).getData('type') === 'nova' ? 3 : 1;
      (proj as Phaser.Physics.Arcade.Image).destroy();
      (enemy as Enemy).takeDamage(damage);
    });

    this.physics.add.overlap(this.player, this.enemies, () => {
      this.player.takeDamage(1);
    });
  }

  // ─── Camera ───────────────────────────────────────────────────────────────

  private setupCamera() {
    const { worldWidth, worldHeight } = this.loadedLevel;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(80, 40);
  }

  // ─── Music ────────────────────────────────────────────────────────────────

  private startMusic() {
    if (this.bgm) this.bgm.stop();
    this.bgm = this.sound.add(this.levelCfg.musicKey, { loop: true, volume: 0.6 });
    this.bgm.play();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bgm?.stop();
    });
  }

  // ─── Public accessors (for UIScene) ───────────────────────────────────────

  getPlayer(): Player { return this.player; }
}
