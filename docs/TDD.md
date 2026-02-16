# BatoMan — Technical Design Document

**Version:** 0.1
**Engine:** Phaser 3.90.0
**Language:** TypeScript 5.4 (strict)
**Bundler:** Vite 5
**Physics:** Arcade

---

## 1. Tech Stack & Project Setup

### 1.1 Core Dependencies

| Package | Version | Role |
|---------|---------|------|
| `phaser` | 3.90.0 | Game engine (renderer, physics, scenes, input, audio) |
| `typescript` | ^5.4.5 | Type safety, strict null checks |
| `vite` | ^5.4.0 | Dev server (HMR on :5173), production bundler |

### 1.2 Build Commands

```bash
npm run dev       # Vite dev server — http://localhost:5173
npm run build     # tsc type-check + Vite production build → dist/
npm run preview   # Serve dist/ locally for production testing
```

### 1.3 TypeScript Config

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 1.4 Phaser Game Config

```typescript
// src/config/gameConfig.ts
export const GAME_WIDTH  = 1408;   // canvas logical width  (px)
export const GAME_HEIGHT = 768;    // canvas logical height (px)
export const WORLD_WIDTH_MULTIPLIER = 3;  // world = 4224px per level

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0a0a14',
  pixelArt: true,                   // nearest-neighbour scaling — no blur on sprites
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 800 }, debug: false },
  },
  scene: [BootScene, PreloadScene, MenuScene, GameScene, UIScene],
};
```

> **Why Arcade Physics (not Matter)?**
> Arcade uses axis-aligned bounding boxes (AABB) and runs in O(n²) with broad-phase optimization. For a ~20-enemy / ~50-projectile platformer it costs 1–2 ms/frame vs. 4–6 ms for Matter. Matter is reserved for games needing polygon collisions, joints, or ragdolls — none of which BatoMan requires.

---

## 2. Project Structure

```
src/
├── main.ts                     Entry — instantiates Phaser.Game
├── config/
│   └── gameConfig.ts           GAME_WIDTH, GAME_HEIGHT, Phaser config object
├── scenes/
│   ├── BootScene.ts            Minimal init → PreloadScene
│   ├── PreloadScene.ts         Asset loading with progress bar → MenuScene
│   ├── MenuScene.ts            Title, controls hint, ENTER/SPACE to start
│   ├── GameScene.ts            Core gameplay loop
│   └── UIScene.ts              HUD overlay (hearts, score, boss bar, powerup timer)
├── objects/
│   ├── Player.ts               Player sprite, input, physics, animation FSM
│   ├── Enemy.ts                Enemy base class — patrol AI, damage, death
│   ├── enemies/
│   │   ├── PatrolEnemy.ts      Walk-back-and-forth variant
│   │   ├── RangedEnemy.ts      Shoots projectile at interval
│   │   ├── FlyingEnemy.ts      Airborne patrol, dives on detect
│   │   ├── StealthEnemy.ts     Cloaked until proximity
│   │   └── BossEnemy.ts        Multi-phase ASWANG base class
│   ├── Projectile.ts           Poolable projectile (burst + nova variants)
│   ├── Powerup.ts              Collectible pickup (permanent + timed)
│   └── obstacles/
│       ├── MovingPlatform.ts   Lerps between two points
│       ├── CrumblingPlatform.ts Collapses 1 s after player contact
│       ├── SpikeTrap.ts        Deals 1 HP on overlap
│       └── Piston.ts           Timed instant-death hazard
├── systems/
│   ├── ObjectPool.ts           Generic reusable pool<T>
│   ├── StateMachine.ts         Typed FSM used by Player and Enemy
│   ├── CheckpointSystem.ts     Tracks last activated checkpoint per level
│   ├── LevelLoader.ts          Reads Tiled JSON, builds world, spawns objects
│   └── AudioManager.ts         Wraps Phaser.Sound.WebAudioSoundManager
├── data/
│   ├── levels.ts               Level config array (tilemap key, music, enemies)
│   └── animations.ts           Central animation definition registry
└── types/
    └── index.d.ts              Shared interfaces: EnemyConfig, PowerupType, etc.

public/assets/
├── batoman-sprites.png         8×4 spritesheet, 176×184 px/frame
├── level-1-background.png      Parallax far layer
├── level-1.png                 Parallax mid layer
├── level-1-foreground.png      Parallax near layer
├── level-1-tileset.png         32×32 Tiled tileset
├── level-1-music.mp3
└── tilemaps/
    └── level-1.json            Tiled export (Base64, no compression)
```

---

## 3. Scene Architecture

### 3.1 Scene Flow

```
BootScene
  └─► PreloadScene  (loads assets, shows progress bar)
        └─► MenuScene
              └─► GameScene  (launches UIScene as parallel overlay)
                    │
                    ├─ GameOverScene  (all lives lost)
                    │     └─► MenuScene
                    │
                    └─ LevelTransitionScene  (boss defeated)
                          └─► GameScene { level: next }
```

### 3.2 Scene Communication Pattern

Scenes must not hold direct references to each other's private state. Use two approved channels:

**Channel 1 — Scene Events (runtime updates)**
```typescript
// Emitter (GameScene)
this.events.emit('health-changed', this.player.health);

// Listener (UIScene, registered in init())
this.gameScene.events.on('health-changed', (hp: number) => {
  this.refreshHearts(hp);
});

// Cleanup on shutdown
this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
  this.gameScene.events.off('health-changed');
});
```

**Channel 2 — Phaser Registry (persistent cross-scene data)**
```typescript
// Write (GameScene on level complete)
this.registry.set('score', this.player.score);
this.registry.set('currentLevel', this.levelIndex);
this.registry.set('lives', this.player.lives);

// Read (anywhere)
const level = this.registry.get('currentLevel') as number;
```

### 3.3 Scene Lifecycle Hooks

| Hook | Runs | Use for |
|------|------|---------|
| `init(data)` | Once, before preload | Receive data from previous scene, set instance vars |
| `preload()` | Once | Load scene-specific assets |
| `create()` | Once | Build game objects, set up colliders, start music |
| `update(time, delta)` | Every frame (~60/s) | Delegate to objects; keep this thin |
| `shutdown` event | On scene stop | Remove listeners, stop audio, destroy pools |

> **Rule:** `update()` should contain no logic — only calls to `player.update(delta)`, `enemyManager.update(delta)`, `updateParallax()`.

---

## 4. Level Data & Loading

### 4.1 Level Config

```typescript
// src/data/levels.ts
export interface LevelConfig {
  index: number;
  name: string;
  tilemapKey: string;
  tilesetKey: string;
  tilesetImageKey: string;
  bgKeys: { far: string; mid: string; near: string };
  musicKey: string;
  bossType?: string;
}

export const LEVELS: LevelConfig[] = [
  {
    index: 1,
    name: 'Tondo Sublevel Docks',
    tilemapKey: 'level1',
    tilesetKey: 'level-1-tileset-tiles',   // name inside Tiled
    tilesetImageKey: 'level-1-tileset',
    bgKeys: { far: 'level-1-background', mid: 'level-1-midground', near: 'level-1-foreground' },
    musicKey: 'bgm-level1',
    bossType: undefined,
  },
  // … levels 2-10
];
```

### 4.2 Tiled Map Conventions

All level maps are created in **Tiled Map Editor** and exported as JSON (File → Export As → JSON, Base64 encoding, no compression).

**Required layers (exact names, order bottom → top):**

| Layer Name | Type | Notes |
|-----------|------|-------|
| `background-deco` | Tile | Non-colliding decorative tiles |
| `platforms` | Tile | Set `collides: true` property on tiles that block |
| `hazards` | Tile | Spikes and instant-death tiles; set `damage: 1` or `instant-death: true` |
| `foreground-deco` | Tile | Rendered above player (depth 50) |
| `spawns` | Object | Enemy, powerup, checkpoint, boss trigger spawn points |

**Required Tiled object properties (`spawns` layer):**

| Object Type | Required Properties |
|-------------|-------------------|
| `enemy` | `enemyType: string`, `patrolDistance?: number` |
| `powerup` | `powerupType: string` |
| `checkpoint` | `id: number` |
| `boss-trigger` | `bossType: string` |
| `death-zone` | — (any overlap = instant death) |

### 4.3 LevelLoader System

```typescript
// src/systems/LevelLoader.ts
export class LevelLoader {
  constructor(private scene: GameScene) {}

  load(config: LevelConfig): LoadedLevel {
    const map = this.scene.make.tilemap({ key: config.tilemapKey });
    const tileset = map.addTilesetImage(config.tilesetKey, config.tilesetImageKey)!;

    const bgDecoLayer = map.createLayer('background-deco', tileset)!.setDepth(3);
    const platformLayer = map.createLayer('platforms', tileset)!.setDepth(4);
    const hazardLayer  = map.createLayer('hazards', tileset)!.setDepth(4);
    const fgDecoLayer  = map.createLayer('foreground-deco', tileset)!.setDepth(50);

    platformLayer.setCollisionByProperty({ collides: true });
    hazardLayer.setCollisionByProperty({ damage: true });
    hazardLayer.setCollisionByProperty({ 'instant-death': true });

    const spawnObjects = this.parseSpawns(map.getObjectLayer('spawns')!);
    const worldWidth = map.widthInPixels;

    return { platformLayer, hazardLayer, spawnObjects, worldWidth };
  }

  private parseSpawns(layer: Phaser.Tilemaps.ObjectLayer): SpawnData[] {
    return layer.objects.map(obj => ({
      type: obj.type as SpawnType,
      x: obj.x ?? 0,
      y: obj.y ?? 0,
      properties: this.mapProperties(obj.properties ?? []),
    }));
  }

  private mapProperties(props: Phaser.Types.Tilemaps.TiledObject[]): Record<string, unknown> {
    return Object.fromEntries(props.map(p => [p.name, p.value]));
  }
}
```

---

## 5. Physics

### 5.1 Layer Assignments

| Layer | Arcade Group Type | Gravity | Collides With |
|-------|-------------------|---------|---------------|
| Player | Dynamic body | World (800) | platforms, enemies, powerups, hazards |
| Enemies | Dynamic body | World (800) | platforms, world-bounds |
| Projectiles | Dynamic body | None (overridden to 0) | platforms, enemies |
| Platforms | Static body | — | player, enemies |
| Powerups | Static body | — | player |

### 5.2 Collision & Overlap Registration

```typescript
// GameScene.create()
private setupCollisions() {
  const { player, platforms, enemies, projectiles, powerups } = this;

  // Solid collisions
  this.physics.add.collider(player, platforms);
  this.physics.add.collider(enemies, platforms);

  // Triggers (overlap = no physics response, just callback)
  this.physics.add.overlap(projectiles, platforms, this.onProjectileHitWorld, undefined, this);
  this.physics.add.overlap(projectiles, enemies,   this.onProjectileHitEnemy,  undefined, this);
  this.physics.add.overlap(player,      enemies,   this.onPlayerHitEnemy,      undefined, this);
  this.physics.add.overlap(player,      powerups,  this.onPlayerPickupPowerup, undefined, this);

  // Tilemap hazard layers
  this.physics.add.overlap(player, this.hazardLayer!, this.onPlayerHitHazard, undefined, this);
}
```

### 5.3 Player Body Config

```
Sprite frame:   176 × 184 px
Physics body:    60 × 100 px
Body offset:     (58, 60) — centers hitbox within frame
Display scale:   2×  → visual size 352 × 368 px
Max velocity:   (280, 800) px/s
```

The physics body is ~34% of sprite width — standard Mega Man-style forgiveness margin.

---

## 6. Player System

### 6.1 State Machine

The Player uses an explicit finite state machine (see `src/systems/StateMachine.ts`).

```
                    ┌──────────────────────────────────────────┐
             input  │                                          │
   idle ◄──────────► moving                                   │
     │                  │                                      │
     │  jump             │  jump                               │
     ▼                  ▼                                      │
   jumping ──fall──► falling                                   │
     │                  │                                      │
     │  land             │  land                               │
     ▼                  ▼                                      │
   idle / moving ◄───────┘                                    │
                                                               │
   (any grounded/air state) ──Z tap──► shooting               │
   (any grounded/air state) ──Z hold─► charging ──release──►  │
                                                               │
   (any state except dead) ──take damage──► hurt ──recover──► │
                                                               │
   (hurt, health = 0) ──────────────────────────► dying ──────┘
                                                     │
                                                     ▼
                                                   dead
```

**States and their constraints:**

| State | Can move? | Can jump? | Can fire? | Animation |
|-------|-----------|-----------|-----------|-----------|
| `idle` | yes | yes | yes | `batoman-idle` |
| `moving` | yes | yes | yes | `batoman-walk` / `batoman-run` |
| `jumping` | yes (air) | no (variable cut) | yes | `batoman-jump` |
| `falling` | yes (air) | coyote only | yes | `batoman-fall` |
| `shooting` | yes | yes | no (cooldown) | `batoman-shoot` (locks 1 cycle) |
| `charging` | yes | yes | no | `batoman-charge` |
| `hurt` | no (0.3 s stun) | no | no | `batoman-hurt` |
| `dying` | no | no | no | `batoman-death` |
| `dead` | no | no | no | — |

### 6.2 Movement Constants

```typescript
const WALK_SPEED       = 150;   // px/s — slow walk
const RUN_SPEED        = 220;   // px/s — full run
const DECEL_FACTOR     = 0.75;  // multiply velocity when no input (per frame at 60fps)
const STOP_THRESHOLD   = 5;     // px/s — below this, snap to 0
const JUMP_VELOCITY    = -580;  // px/s upward impulse
const JUMP_CUT_VEL     = -200;  // px/s — clamp to this on early jump release
const COYOTE_LIMIT_MS  = 100;   // ms grace window after walking off edge
const CHARGE_THRESHOLD = 800;   // ms hold duration for Nova Blast
const FIRE_RATE_MS     = 200;   // ms minimum between Plasma Bursts
const HURT_STUN_MS     = 300;   // ms player cannot move after taking damage
```

### 6.3 Coyote Time & Variable Jump

```typescript
// Coyote time: track last time player was grounded
private lastOnGroundTime = 0;

update(time: number, delta: number) {
  const body = this.body as Phaser.Physics.Arcade.Body;
  if (body.blocked.down) {
    this.lastOnGroundTime = time;
  }

  const canJump = (time - this.lastOnGroundTime) <= COYOTE_LIMIT_MS;

  if (this.jumpPressed && canJump) {
    this.setVelocityY(JUMP_VELOCITY);
    this.lastOnGroundTime = 0;   // consume coyote window
  }

  // Variable jump height: early release cuts upward velocity
  if (!this.jumpHeld && body.velocity.y < JUMP_CUT_VEL) {
    this.setVelocityY(JUMP_CUT_VEL);
  }
}
```

### 6.4 Wall Kick

```typescript
private handleWallKick() {
  const body = this.body as Phaser.Physics.Arcade.Body;
  const touchingLeft  = body.blocked.left;
  const touchingRight = body.blocked.right;
  const airborne      = !body.blocked.down;

  if (this.jumpPressed && airborne && (touchingLeft || touchingRight)) {
    const kickDir = touchingLeft ? 1 : -1;
    this.setVelocityX(RUN_SPEED * kickDir);
    this.setVelocityY(JUMP_VELOCITY * 0.9);   // slightly weaker than normal jump
    this.setFlipX(kickDir < 0);
  }
}
```

### 6.5 Salakot Dash

```typescript
private handleDash() {
  const body = this.body as Phaser.Physics.Arcade.Body;
  const isDashing = this.downHeld && (this.leftHeld || this.rightHeld) && body.blocked.down;

  if (isDashing) {
    const dir = this.leftHeld ? -1 : 1;
    this.setVelocityX(RUN_SPEED * 1.5 * dir);
    body.setSize(60, 60);            // crouch hitbox — shorter
    body.setOffset(58, 100);         // slide under obstacles

    if (this.hasDashUpgrade) {
      // Dash upgrade: leave damaging plasma trail
      this.spawnDashTrail();
    }
  } else {
    body.setSize(60, 100);           // restore full hitbox
    body.setOffset(58, 60);
  }
}
```

### 6.6 Projectile System

Two projectile types share the same `Projectile` class, differentiated by `ProjectileConfig`:

```typescript
interface ProjectileConfig {
  texture: string;
  velocityX: number;     // signed — positive = right
  damage: number;
  scale: number;
  gravity: number;       // 0 for both types
  lifetime: number;      // ms before auto-return to pool
}

const PLASMA_BURST_CONFIG: ProjectileConfig = {
  texture: 'plasma-burst',
  velocityX: 600,
  damage: 1,
  scale: 1.0,
  gravity: 0,
  lifetime: 1500,
};

const NOVA_BLAST_CONFIG: ProjectileConfig = {
  texture: 'nova-blast',
  velocityX: 380,
  damage: 3,
  scale: 1.5,
  gravity: 0,
  lifetime: 2000,
};
```

Projectiles are **pooled** (see Section 8). The `Player` does not create them directly — it calls `this.scene.projectilePool.acquire()`.

### 6.7 Player Stats

```typescript
interface PlayerStats {
  health: number;        // current HP (default 3)
  maxHealth: number;     // max HP — increased by HP Up pickup
  lives: number;         // remaining continues (default 3)
  score: number;         // accumulated score
  hasPlasmaUpgrade: boolean;   // 3-way spread unlock
  hasDashUpgrade: boolean;     // dash trail unlock
  hasArmorShard: boolean;      // next hit blocked
}
```

Stats persist across level transitions via `this.registry`.

---

## 7. Enemy System

### 7.1 Base Class

```typescript
// src/objects/Enemy.ts
abstract class Enemy extends Phaser.Physics.Arcade.Sprite {
  protected health: number;
  protected scoreValue: number;
  protected fsm: StateMachine<EnemyState>;

  abstract onEnterState(state: EnemyState): void;
  abstract updateState(delta: number, player: Player): void;

  takeDamage(amount: number): boolean {
    this.health -= amount;
    this.flashHurt();
    if (this.health <= 0) {
      this.onDeath();
      return true;
    }
    return false;
  }

  protected onDeath() {
    this.scene.events.emit('enemy-died', this.scoreValue, this.x, this.y);
    this.returnToPool();   // sets active=false, visible=false
  }
}
```

### 7.2 Standard Enemy Types

| Class | File | Behavior | Sprite |
|-------|------|----------|--------|
| `PatrolEnemy` | `enemies/PatrolEnemy.ts` | Walk between two X bounds; flip on edge or wall | `enemy-patrol` |
| `RangedEnemy` | `enemies/RangedEnemy.ts` | Stationary or slow patrol; fire projectile every N seconds | `enemy-ranged` |
| `FlyingEnemy` | `enemies/FlyingEnemy.ts` | Sine-wave air patrol; dive at player when in range | `enemy-flying` |
| `StealthEnemy` | `enemies/StealthEnemy.ts` | Alpha=0 until player within 150 px; ambush lunge | `enemy-stealth` |
| `ChaserEnemy` | `enemies/ChaserEnemy.ts` | Run toward player when in detection range | `enemy-chaser` |

### 7.3 Enemy State Machine (Standard)

```
patrol ◄──out of range──► chase ──in attack range──► attack
  │                                                      │
  └──────── take damage ──────────────────────► hurt ───┘
                                                  │
                                            health = 0
                                                  │
                                                dead
```

### 7.4 Boss Enemy Base Class

```typescript
// src/objects/enemies/BossEnemy.ts
abstract class BossEnemy extends Enemy {
  protected phase = 1;
  protected maxPhases = 1;

  // Called when a phase's HP threshold is crossed
  abstract onPhaseTransition(nextPhase: number): void;

  protected checkPhaseTransition() {
    const hpPercent = this.health / this.maxHealth;

    if (this.maxPhases >= 2 && this.phase === 1 && hpPercent <= 0.5) {
      this.phase = 2;
      this.onPhaseTransition(2);
      this.scene.cameras.main.shake(500, 0.015);
    }

    if (this.maxPhases >= 3 && this.phase === 2 && hpPercent <= 0.25) {
      this.phase = 3;
      this.onPhaseTransition(3);
    }
  }

  onDeath() {
    this.scene.events.emit('boss-defeated');
    super.onDeath();
  }
}
```

### 7.5 ASWANG Boss Implementations

| Class | Boss | Phases | Key Mechanic |
|-------|------|--------|-------------|
| `SigbinBoss` | Sigbin Unit | 2 | Alpha camo; must be hit in sequence (back → front → core) |
| `TikbalangBoss` | Tikbalang-X | 2 | Afterimage decoys; hit real body during stumble |
| `KapreBoss` | Kapre-9 | 3 | Smoke screen; expose chest core after debris throw |
| `ManananggalBoss` | Manananggal-7 | 2 | Phase 1: full body. Phase 2: upper body flies, lower half gets blade legs |
| `BakunawaBoss` | Bakunawa-Prime | 3 | Phase 1: head only. Phase 2: coils arena. Phase 3: full body |

---

## 8. Object Pooling

All frequently created/destroyed objects use a typed generic pool.

### 8.1 Generic ObjectPool

```typescript
// src/systems/ObjectPool.ts
export class ObjectPool<T extends { setActive(v: boolean): T; setVisible(v: boolean): T }> {
  private available: T[] = [];

  constructor(
    private readonly factory: () => T,
    private readonly reset: (obj: T) => void,
    initialSize: number,
  ) {
    for (let i = 0; i < initialSize; i++) {
      this.available.push(factory());
    }
  }

  acquire(): T {
    const obj = this.available.pop() ?? this.factory();
    return obj.setActive(true).setVisible(true);
  }

  release(obj: T): void {
    this.reset(obj);
    obj.setActive(false).setVisible(false);
    this.available.push(obj);
  }

  get size() { return this.available.length; }
}
```

### 8.2 Pool Sizes & Targets

| Pool | Initial Size | Max Expected Active |
|------|-------------|---------------------|
| `projectilePool` | 30 | ~15 (rapid fire bursts) |
| `enemyPool` | 20 | ~12 (per screen) |
| `powerupPool` | 10 | ~5 |
| `particleEmitters` | 8 | ~4 simultaneous |

### 8.3 Projectile Lifecycle

```
Player fires
    │
    ▼
projectilePool.acquire()
    │
    ▼
Set position, velocity, damage, lifetime
    │
    ├── Hits enemy   ──► onProjectileHitEnemy() → pool.release()
    ├── Hits platform ──► onProjectileHitWorld() → pool.release()
    └── Lifetime expires ──► Projectile.update() → pool.release()
```

---

## 9. Obstacle System

### 9.1 Moving Platform

```typescript
class MovingPlatform extends Phaser.Physics.Arcade.Image {
  constructor(scene, x, y, endX, endY, duration = 2000) {
    super(scene, x, y, 'platform-moving');
    scene.physics.add.existing(this, false);
    (this.body as Phaser.Physics.Arcade.Body).setImmovable(true).setAllowGravity(false);

    scene.tweens.add({
      targets: this,
      x: endX, y: endY,
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
```

> Moving platforms require `setImmovable(true)` **and** `setAllowGravity(false)`. Without `immovable`, the player's weight pushes the platform down. Without `allowGravity(false)`, the platform falls immediately.

### 9.2 Crumbling Platform

```typescript
class CrumblingPlatform extends Phaser.Physics.Arcade.Image {
  private triggered = false;

  onPlayerLand() {
    if (this.triggered) return;
    this.triggered = true;

    // Shake then fall
    this.scene.tweens.add({
      targets: this,
      x: this.x + 3,
      duration: 80,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.scene.time.delayedCall(400, () => {
          (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
          this.scene.time.delayedCall(1500, () => this.destroy());
        });
      },
    });
  }
}
```

### 9.3 Obstacle Summary

| Class | Death? | Trigger | Reset on Respawn |
|-------|--------|---------|-----------------|
| `MovingPlatform` | No | Always moving | Yes |
| `CrumblingPlatform` | No | Player lands | Yes |
| `SpikeTrap` | No (1 HP) | Overlap | — |
| `DeathZone` | Yes (instant) | Overlap (bottom void, river) | — |
| `Piston` | Yes (instant) | Timed activation, overlap during extend | Yes |
| `RisingWater` | Yes (drowning, 3 s) | Overlap; `drowning` timer starts | — |
| `DestroyableBlock` | No | Nova Blast hit | No |
| `Forcefield` | No | Blocks until switch activated | Yes |

---

## 10. Powerup System

### 10.1 Powerup Types

```typescript
type PermanentPowerup = 'hp-up' | 'plasma-upgrade' | 'dash-upgrade' | 'armor-shard';
type TemporaryPowerup = 'speed-boost' | 'invincibility' | 'nova-overcharge' | 'double-jump';

interface PowerupConfig {
  type: PermanentPowerup | TemporaryPowerup;
  duration?: number;   // ms — omit for permanent
  texture: string;
}
```

### 10.2 Collection & Application

```typescript
// GameScene
private onPlayerPickupPowerup(player: Player, powerup: Powerup) {
  const config = powerup.config;

  if (config.duration === undefined) {
    this.applyPermanentPowerup(player, config.type as PermanentPowerup);
  } else {
    this.applyTemporaryPowerup(player, config.type as TemporaryPowerup, config.duration);
  }

  this.powerupPool.release(powerup);
  this.events.emit('powerup-collected', config);
}

private applyTemporaryPowerup(player: Player, type: TemporaryPowerup, duration: number) {
  player.activatePowerup(type);
  this.events.emit('powerup-timer-start', type, duration);

  this.time.delayedCall(duration, () => {
    player.deactivatePowerup(type);
    this.events.emit('powerup-timer-end', type);
  });
}
```

---

## 11. Checkpoint & Lives System

### 11.1 Flow

```
Player HP = 0
    │
    ▼
lives -= 1
    │
    ├── lives > 0 ──► respawn at last checkpoint (1.5 s delay)
    │                  restore 3 HP
    │                  keep score + powerups
    │
    └── lives = 0 ──► emit 'game-over'
                       GameOverScene
                       registry.set lives=3, score=0
                       restart level from beginning
```

### 11.2 CheckpointSystem

```typescript
// src/systems/CheckpointSystem.ts
export class CheckpointSystem {
  private lastCheckpoint: { x: number; y: number } | null = null;

  activate(x: number, y: number) {
    this.lastCheckpoint = { x, y };
    // Play activation VFX, emit event for UIScene flash
  }

  getSpawnPoint(levelStartX: number, levelStartY: number): { x: number; y: number } {
    return this.lastCheckpoint ?? { x: levelStartX, y: levelStartY };
  }

  reset() {
    this.lastCheckpoint = null;
  }
}
```

---

## 12. HUD (UIScene)

UIScene runs as a **parallel scene** alongside GameScene. It is never paused, allowing HUD updates during game-pause state.

### 12.1 Elements & Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ♥ ♥ ♥                                    SCORE  000000      │  ← y=20
│                                                              │
│                                                              │
│                                                              │
│                                                              │
│                                                              │
│ [powerup timer bar]       [══════ BOSS HP ══════]            │  ← y=748
└─────────────────────────────────────────────────────────────┘
```

### 12.2 Event Subscriptions

| Event | Source | UIScene action |
|-------|--------|---------------|
| `health-changed` | GameScene | Re-render hearts |
| `score-changed` | GameScene | Update score text (zero-padded, 6 digits) |
| `boss-hp-changed` | GameScene | Update boss bar width; show/hide bar |
| `powerup-timer-start` | GameScene | Show timer bar, start countdown tween |
| `powerup-timer-end` | GameScene | Hide timer bar |
| `lives-changed` | GameScene | Update lives display |

### 12.3 Boss HP Bar

```typescript
private showBossBar(bossName: string, maxHp: number) {
  this.bossBarContainer.setVisible(true);
  this.bossNameText.setText(bossName);
  this.bossBarFill.setScale(1, 1);    // full width

  this.tweens.add({
    targets: this.bossBarContainer,
    y: GAME_HEIGHT - 40,              // slide up from off-screen
    duration: 400,
    ease: 'Back.easeOut',
  });
}

private updateBossBar(currentHp: number, maxHp: number) {
  const pct = Math.max(0, currentHp / maxHp);
  this.tweens.add({
    targets: this.bossBarFill,
    scaleX: pct,
    duration: 150,
    ease: 'Linear',
  });
}
```

---

## 13. Audio Architecture

### 13.1 AudioManager

```typescript
// src/systems/AudioManager.ts
export class AudioManager {
  private bgm: Phaser.Sound.WebAudioSound | null = null;
  private sfxEnabled = true;
  private bgmEnabled = true;

  playBGM(scene: Phaser.Scene, key: string, volume = 0.6) {
    this.bgm?.stop();
    if (!this.bgmEnabled) return;
    this.bgm = scene.sound.add(key, { loop: true, volume }) as Phaser.Sound.WebAudioSound;
    this.bgm.play();
  }

  playSFX(scene: Phaser.Scene, key: string, volume = 1.0) {
    if (!this.sfxEnabled) return;
    scene.sound.play(key, { volume });
  }

  stopBGM() { this.bgm?.stop(); }
}

export const audioManager = new AudioManager();
```

### 13.2 SFX Events

| Event | Sound Key | Trigger |
|-------|-----------|---------|
| Player jump | `sfx-jump` | Jump state enter |
| Plasma burst | `sfx-shoot` | Projectile fired |
| Nova blast | `sfx-nova` | Nova projectile fired |
| Player hurt | `sfx-hurt` | `takeDamage()` |
| Player death | `sfx-death` | `health = 0` |
| Enemy hit | `sfx-enemy-hit` | Enemy `takeDamage()` |
| Enemy death | `sfx-enemy-death` | Enemy `onDeath()` |
| Powerup collect | `sfx-pickup` | Powerup overlap |
| Checkpoint | `sfx-checkpoint` | Checkpoint activate |
| Boss phase change | `sfx-boss-phase` | `onPhaseTransition()` |

---

## 14. Camera System

### 14.1 Configuration

```typescript
private setupCamera(worldWidth: number) {
  const cam = this.cameras.main;
  cam.setBounds(0, 0, worldWidth, GAME_HEIGHT);
  cam.startFollow(this.player, true, 0.1, 0.1);
  cam.setDeadzone(80, 40);   // player can move 80px left/right before camera pans
}
```

### 14.2 Parallax Update

```typescript
// Called every frame in GameScene.update()
private updateParallax() {
  const sx = this.cameras.main.scrollX;
  this.bgFar.tilePositionX  = sx * 0.05;
  this.bgMid.tilePositionX  = sx * 0.25;
  this.bgNear.tilePositionX = sx * 0.60;
}
```

### 14.3 Camera Effects

```typescript
onExplosion(x: number, y: number, intensity: number) {
  this.cameras.main.shake(250, intensity * 0.01);
}

onBossPhaseTransition() {
  this.cameras.main.flash(300, 255, 255, 255);
  this.cameras.main.shake(500, 0.015);
}

onLevelComplete() {
  this.tweens.add({
    targets: this.cameras.main,
    zoom: 1.3,
    duration: 800,
    ease: 'Power2.easeInOut',
    onComplete: () => this.startTransition(),
  });
}
```

---

## 15. State Machine Utility

```typescript
// src/systems/StateMachine.ts
type StateConfig<S extends string> = {
  [K in S]?: {
    onEnter?: () => void;
    onUpdate?: (delta: number) => void;
    onExit?: () => void;
  };
};

export class StateMachine<S extends string> {
  private current: S;
  private readonly states: StateConfig<S>;

  constructor(initial: S, states: StateConfig<S>) {
    this.current = initial;
    this.states = states;
    this.states[initial]?.onEnter?.();
  }

  transition(next: S) {
    if (this.current === next) return;
    this.states[this.current]?.onExit?.();
    this.current = next;
    this.states[next]?.onEnter?.();
  }

  update(delta: number) {
    this.states[this.current]?.onUpdate?.(delta);
  }

  get state(): S { return this.current; }
  is(s: S): boolean { return this.current === s; }
}
```

Usage in Player:

```typescript
this.fsm = new StateMachine<PlayerState>('idle', {
  idle:    { onEnter: () => this.playAnim('batoman-idle') },
  moving:  { onEnter: () => this.playAnim('batoman-walk') },
  jumping: {
    onEnter:  () => { this.setVelocityY(JUMP_VELOCITY); this.playAnim('batoman-jump'); },
    onUpdate: (delta) => this.handleAirControl(delta),
  },
  hurt: {
    onEnter:  () => { this.playAnim('batoman-hurt'); this.setVelocityX(0); },
    onUpdate: (delta) => { /* stun timer countdown */ },
    onExit:   () => { /* resume normal control */ },
  },
  dead: { onEnter: () => { this.playAnim('batoman-death'); this.emit('died'); } },
});
```

---

## 16. Asset Pipeline

### 16.1 Sprite Atlas Workflow

For production, combine individual sprites into a texture atlas using **TexturePacker** (or the free alternative `Free Texture Packer`):

1. Import all character/enemy frames into TexturePacker
2. Export format: **Phaser 3 (JSON Array)**
3. Output: `atlas.png` + `atlas.json`
4. Load in PreloadScene:
   ```typescript
   this.load.atlas('atlas', 'assets/atlas.png', 'assets/atlas.json');
   ```

Until atlas is built, individual spritesheets per character are acceptable.

### 16.2 Tileset Spec

- Tile size: **32×32 px**
- Sheet layout: single row or grid, no spacing, no margin
- Format: PNG with transparency
- Max sheet size: 2048×2048 (GPU safe on mobile/WebGL)

### 16.3 Audio Formats

| Use | Format | Notes |
|-----|--------|-------|
| Music (looping) | MP3 + OGG | Provide both; Phaser picks supported format |
| Sound effects | WAV or OGG | WAV for short clips; OGG for longer |

```typescript
this.load.audio('bgm-level1', ['assets/level-1-music.ogg', 'assets/level-1-music.mp3']);
```

### 16.4 Asset Manifest Pattern

```typescript
// src/data/assetManifest.ts
export const COMMON_ASSETS = [
  { type: 'spritesheet', key: 'batoman', path: 'assets/batoman-sprites.png',
    meta: { frameWidth: 176, frameHeight: 184 } },
  { type: 'audio', key: 'sfx-jump', path: 'assets/sfx/jump.wav' },
  // ... all shared assets
] as const;

export const LEVEL_ASSETS: Record<number, AssetEntry[]> = {
  1: [
    { type: 'image',    key: 'level-1-background', path: 'assets/level-1-background.png' },
    { type: 'tilemap',  key: 'level1',             path: 'assets/tilemaps/level-1.json' },
    { type: 'audio',    key: 'bgm-level1',          path: ['assets/level-1-music.ogg', 'assets/level-1-music.mp3'] },
  ],
};
```

---

## 17. Performance Guidelines

### 17.1 Frame Budget (60 fps = 16.67 ms/frame)

| System | Target Budget |
|--------|--------------|
| Arcade Physics | ≤ 2 ms |
| Player + Enemy update | ≤ 2 ms |
| Rendering (WebGL) | ≤ 3 ms |
| Audio | ≤ 0.5 ms |
| Headroom | ≥ 9 ms |

### 17.2 Rules

- **Never call `create()` or `destroy()` per-frame.** Pool all frequently created objects.
- **Keep `update()` logic O(n)** — no nested loops over all enemies for all projectiles. Use Arcade overlap callbacks instead.
- **Disable physics on off-screen enemies.** If an enemy is > 2 × GAME_WIDTH from the camera, `enemy.body.enable = false`.
- **Limit simultaneous tweens to ≤ 20.** Use frame-based animation instead of tweens for repeated motion.
- **Use `StaticGroup` for all non-moving platforms.** Arcade skips static bodies in its integration step.
- **Set `pixelArt: true`** in Phaser config for nearest-neighbour GPU scaling — avoids bilinear filter cost on large pixel sprites.

### 17.3 Profiling Checklist

Before each milestone build:

- [ ] Chrome Performance tab: no frame > 16 ms under normal gameplay
- [ ] Chrome Memory tab: no heap growth over 30 s of play (indicates leak)
- [ ] Phaser debug mode: verify physics body counts stay bounded
- [ ] Network tab: confirm all assets load < 5 s on 3G throttle

---

## 18. Known Issues & Technical Debt (Current State)

| Issue | Severity | Resolution |
|-------|----------|-----------|
| `'plasma-burst'` and `'nova-blast'` textures not defined | **Critical** — firing crashes | Create procedural textures in PreloadScene or add PNG assets |
| No object pooling on projectiles | Medium — GC spikes on rapid fire | Implement `ObjectPool<Projectile>` |
| Enemy spawned manually at hardcoded coords | Medium — not level-driven | Replace with `LevelLoader` + Tiled object layer |
| `pixelArt: false` in config | Low — sprites will blur on scale | Set to `true` |
| No SFX assets loaded | Low — silent game | Add jump/shoot/hit WAV files |
| Lives system not implemented | Medium — death returns to menu | Add lives counter to registry, respawn flow |
| No pause scene | Low | Add `PauseScene` on ESC key |

---

## 19. Development Milestones

### Milestone 1 — Playable Level 1
- [ ] Fix projectile texture crash
- [ ] Build Level 1 in Tiled (tilemap replaces placeholder platforms)
- [ ] LevelLoader reads tilemap + spawns enemies from object layer
- [ ] Implement lives + checkpoint respawn
- [ ] PatrolEnemy with correct sprite
- [ ] Jump SFX + shoot SFX

### Milestone 2 — Enemy Variety & Combat Polish
- [ ] RangedEnemy, FlyingEnemy
- [ ] Object pooling (projectiles, enemies)
- [ ] Player knockback on enemy contact
- [ ] Screen shake on Nova Blast
- [ ] Particle hit effects (Phaser `ParticleEmitterManager`)
- [ ] GameOverScene

### Milestone 3 — Powerups & Obstacles
- [ ] All 8 powerup types
- [ ] MovingPlatform, CrumblingPlatform, SpikeTrap, Piston
- [ ] Forcefield + switch mechanic
- [ ] HUD: powerup timer bar, lives count

### Milestone 4 — Boss Fights
- [ ] Boss trigger zone from Tiled object layer
- [ ] `BossEnemy` base class + boss HP bar
- [ ] Sigbin Unit (Level 3) implementation
- [ ] Tikbalang-X (Level 6)

### Milestone 5 — Full Game
- [ ] All 10 levels
- [ ] All 5 ASWANG bosses
- [ ] LevelTransitionScene (cutscene portraits)
- [ ] Full audio pass (BGM per level, complete SFX set)
- [ ] Credits scene

---

## 20. References

| Resource | URL |
|----------|-----|
| Phaser 3.90 API docs | https://newdocs.phaser.io/docs/3.90.0/ |
| Phaser examples | https://phaser.io/examples |
| Tiled Map Editor | https://www.mapeditor.org |
| TexturePacker | https://www.codeandweb.com/texturepacker |
| digitsensitive/phaser3-typescript (patterns reference) | https://github.com/digitsensitive/phaser3-typescript |
| ourcade/phaser3-typescript-parcel-template | https://github.com/ourcade/phaser3-typescript-parcel-template |
| Phaser Tilemap guide | https://phaser.io/tutorials/making-your-first-phaser-3-game |
| "Game Feel" — Steve Swink | ISBN 978-1430210788 — controls, response, juice |
