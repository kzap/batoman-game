---
name: phaser-dev
description: Expert Phaser 3.90 game development skill for the BatoMan side-scrolling platformer. Use this skill when writing any game code, scenes, game objects, physics, animations, tilemaps, or Phaser configuration.
---

# Phaser 3.90 Game Dev — BatoMan Project

## Project Stack
- **Phaser 3.90.0** with TypeScript
- **Vite** bundler (dev: `npm run dev`, build: `npm run build`)
- **Arcade Physics** — the only physics engine used in this project
- Assets live in `public/assets/` (images, tilemaps, audio)
- Source in `src/`

## Project Architecture

```
src/
├── main.ts               # Phaser.Game entry point, imports gameConfig
├── config/gameConfig.ts  # Phaser.Types.Core.GameConfig object
├── scenes/
│   ├── BootScene.ts      # First scene: minimal load, then → PreloadScene
│   ├── PreloadScene.ts   # Load all assets, then → MenuScene
│   ├── MenuScene.ts      # Main menu UI
│   ├── GameScene.ts      # Core gameplay loop
│   └── UIScene.ts        # HUD overlay (runs PARALLEL to GameScene)
├── objects/
│   ├── Player.ts         # Player class extending Phaser.Physics.Arcade.Sprite
│   └── Enemy.ts          # Base enemy class
└── types/index.d.ts      # Shared TypeScript types
```

## Scene Conventions

### Scene lifecycle order
```
BootScene → PreloadScene → MenuScene → GameScene (+ UIScene in parallel)
```

### Scene template
```ts
export class MyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MyScene' });
  }
  preload() {}
  create() {}
  update(time: number, delta: number) {}
}
```

### Launching parallel UIScene from GameScene
```ts
// In GameScene.create()
this.scene.launch('UIScene', { gameScene: this });
```

### Scene transitions
```ts
this.scene.start('NextScene');        // stop current, start next
this.scene.stop('UIScene');           // stop a parallel scene
```

## Physics Conventions

Always use **Arcade Physics**. Never use Matter or Impact.

```ts
// Static group for platforms/ground (immovable terrain)
const platforms = this.physics.add.staticGroup();

// Dynamic sprite for player
const player = this.physics.add.sprite(x, y, 'player');

// Collider (set ONCE in create, not in update)
this.physics.add.collider(player, platforms);

// Overlap (for pickups, damage zones)
this.physics.add.overlap(player, coins, this.collectCoin, undefined, this);
```

### World gravity
Set in `gameConfig.ts`:
```ts
physics: {
  default: 'arcade',
  arcade: { gravity: { x: 0, y: 800 }, debug: false }
}
```

## Player Class Pattern

```ts
export class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: Record<string, Phaser.Input.Keyboard.Key>;
  private canJump = true;
  private coyoteTime = 0;
  private readonly COYOTE_LIMIT = 100; // ms

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: scene.input.keyboard!.addKey('W'),
      left: scene.input.keyboard!.addKey('A'),
      right: scene.input.keyboard!.addKey('D'),
    };
  }

  update(delta: number) {
    this.handleMovement(delta);
  }
}
```

### Coyote time pattern
```ts
const onGround = (this.body as Phaser.Physics.Arcade.Body).blocked.down;
if (onGround) {
  this.coyoteTime = this.COYOTE_LIMIT;
} else {
  this.coyoteTime -= delta;
}
const canJump = this.coyoteTime > 0;
```

### Variable jump height (cut velocity on release)
```ts
if (jumpKeyJustReleased && this.body.velocity.y < -200) {
  this.setVelocityY(-200);
}
```

## Plasma Buster / Charge Shot Pattern

```ts
private chargeTime = 0;
private readonly CHARGE_THRESHOLD = 800; // ms for nova blast

update(delta: number) {
  if (Phaser.Input.Keyboard.JustDown(fireKey)) {
    this.chargeTime = 0;
  }
  if (fireKey.isDown) {
    this.chargeTime += delta;
    // show charge VFX when approaching threshold
  }
  if (Phaser.Input.Keyboard.JustUp(fireKey)) {
    if (this.chargeTime >= this.CHARGE_THRESHOLD) {
      this.fireNovaBlast();
    } else {
      this.firePlasmaBurst();
    }
    this.chargeTime = 0;
  }
}
```

## Tilemap Conventions

- Maps built with **Tiled**, exported as **JSON** (Base64 uncompressed, tileset embedded)
- Place map files in `public/assets/tilemaps/`
- Place tileset images in `public/assets/images/`

```ts
// In PreloadScene
this.load.tilemapTiledJSON('level1', 'assets/tilemaps/level1.json');
this.load.image('tileset', 'assets/images/tileset.png');

// In GameScene.create()
const map = this.make.tilemap({ key: 'level1' });
const tiles = map.addTilesetImage('tileset-name-in-tiled', 'tileset');
const ground = map.createLayer('Ground', tiles!, 0, 0)!;
ground.setCollisionByProperty({ collides: true });
this.physics.add.collider(this.player, ground);
```

## Parallax Background Pattern

Use `TileSprite` layers updated every frame in `update()`:

```ts
// In create()
const bg1 = this.add.tileSprite(0, 0, mapWidth, gameHeight, 'bg-far')
  .setOrigin(0, 0).setScrollFactor(0);
const bg2 = this.add.tileSprite(0, 0, mapWidth, gameHeight, 'bg-mid')
  .setOrigin(0, 0).setScrollFactor(0);

// In update()
bg1.tilePositionX = this.cameras.main.scrollX * 0.1;
bg2.tilePositionX = this.cameras.main.scrollX * 0.4;
```

## Camera Setup

```ts
// Follow player, bound to map
this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
```

## Asset Loading Conventions

```ts
// Spritesheet (frameWidth/frameHeight must match actual sprite dimensions)
this.load.spritesheet('player', 'assets/images/player.png', {
  frameWidth: 32, frameHeight: 32
});

// Static image
this.load.image('bg-far', 'assets/images/bg-far.png');

// Audio
this.load.audio('bgm', 'assets/audio/bgm.mp3');
```

## Animation Conventions

```ts
this.anims.create({
  key: 'player-run',
  frames: this.anims.generateFrameNumbers('player', { start: 0, end: 7 }),
  frameRate: 12,
  repeat: -1
});

// Play with state guard
if (this.anims.currentAnim?.key !== 'player-run') {
  this.play('player-run');
}
```

## Game Config (`src/config/gameConfig.ts`)

```ts
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { MenuScene } from '../scenes/MenuScene';
import { GameScene } from '../scenes/GameScene';
import { UIScene } from '../scenes/UIScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 384,   // 24 tiles * 16px — scale up with CSS
  height: 216,  // 16:9 ratio
  pixelArt: true,
  backgroundColor: '#1a1a2e',
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 800 }, debug: false }
  },
  scene: [BootScene, PreloadScene, MenuScene, GameScene, UIScene]
};
```

## Key Rules

- Always use `delta` in `update()` for frame-rate-independent movement
- Set colliders/overlaps ONCE in `create()`, never in `update()`
- Use `setScrollFactor(0)` for UI elements that should not move with camera
- Use `pixelArt: true` in config to prevent texture filtering on pixel art
- Export all scenes as named classes, never default exports
- Group related game objects with `this.add.group()` or `this.physics.add.group()`
- Destroy projectiles with `projectile.destroy()` on collision or out-of-bounds check

## BatoMan-Specific Notes

- **Player sprite key**: `'batoman'`
- **Plasma burst projectile key**: `'plasma-burst'`
- **Nova blast projectile key**: `'nova-blast'`
- **World theme**: Neo-Maynila (futuristic Manila) — dark neon palette
- **Enemy base class**: always extend `Enemy` in `src/objects/Enemy.ts`
- **Boss enemy keys**: `manananggal`, `tikbalang`, `kapre`, `sigbin`, `bakunawa`
