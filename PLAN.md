# Batoman Game — Project Plan

## Stack
- **Phaser 3.90.0** ("Tsugumi") — last stable v3 release
- **Vite** — bundler with hot-reload (localhost:5173)
- **TypeScript** — type safety
- **Arcade Physics** — lightweight, ideal for 2D platformers
- **Tiled Map Editor** — level design (exports to JSON for Phaser)

---

## Project Structure

```
batoman-game/
├── public/
│   └── assets/
│       ├── images/       # sprites, tilesets, backgrounds
│       ├── tilemaps/     # Tiled JSON map files
│       └── audio/        # sfx, music
├── src/
│   ├── main.ts               # Phaser.Game config entry point
│   ├── scenes/
│   │   ├── BootScene.ts      # preloads minimal assets (loading bar)
│   │   ├── PreloadScene.ts   # loads all game assets
│   │   ├── MenuScene.ts      # main menu
│   │   ├── GameScene.ts      # core gameplay loop
│   │   └── UIScene.ts        # HUD overlay (health, score) — runs in parallel
│   ├── objects/
│   │   ├── Player.ts         # player sprite + input + physics
│   │   └── Enemy.ts          # base enemy class
│   ├── config/
│   │   └── gameConfig.ts     # Phaser.Types.Core.GameConfig
│   └── types/
│       └── index.d.ts        # shared type definitions
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Scene Flow

```
BootScene → PreloadScene → MenuScene → GameScene (+ UIScene overlay)
```

---

## Implementation Steps

1. **Setup** — Scaffold with official `phaserjs/template-vite-ts`, upgrade to `[email protected]`
2. **BootScene** — minimal loading bar while boot assets load
3. **PreloadScene** — load spritesheets, tilemap JSON, audio
4. **GameScene** — tilemap level, Arcade Physics world, camera follow player
5. **Player** — WASD/arrow movement, jump with coyote-time, animations (idle/run/jump/fall)
6. **Parallax backgrounds** — 2–3 TileSprite layers scrolling at different rates
7. **UIScene** — health bar + score, runs as a parallel scene on top of GameScene
8. **Enemy** — base enemy class with simple patrol AI
9. **MenuScene** — start screen with basic UI

---

## Physics Approach

- **Arcade Physics** with world gravity
- `StaticGroup` for ground and platforms (immovable)
- Dynamic body for Player and Enemies
- **Coyote-time** jump: ~100ms grace window after walking off platform edge
- **Variable jump height**: cut vertical velocity on button release for responsive feel

---

## Parallax Background Strategy

Use `TileSprite` for each background layer and update `tilePositionX` in `update()`:

```ts
// Slower layers = further away
bg1.tilePositionX = camera.scrollX * 0.1;  // far background
bg2.tilePositionX = camera.scrollX * 0.4;  // mid layer
bg3.tilePositionX = camera.scrollX * 0.7;  // near layer
```

---

## Tools to Download / Install

### Required
| Tool | Purpose | Link |
|------|---------|------|
| **Node.js** (v18+) | Runtime for Vite + npm | https://nodejs.org |
| **Tiled Map Editor** | Level design → exports JSON | https://www.mapeditor.org |

### Assets (free, no attribution required)
| Source | What to get |
|--------|------------|
| **Kenney.nl** | Platformer tileset pack, character sprites — all CC0 public domain |
| **itch.io** (free filter) | Pixel art side-scroller packs (16x16 or 32x32) |
| **OpenGameArt.org** | Background layers, parallax art |

### Recommended Kenney Packs
- [Pixel Platformer](https://kenney.nl/assets/pixel-platformer) — tiles + characters
- [Background Elements](https://kenney.nl/assets/background-elements) — parallax layers

---

## Key Phaser 3.90 Notes

- Install: `npm install phaser@3.90.0`
- CDN (minified): `https://cdn.jsdelivr.net/npm/[email protected]/dist/phaser.min.js`
- This is the **last planned Phaser v3 release** — all future work goes to Phaser v4
- Arcade Physics collision via `Collider` object (set once in `create`, not in `update`)
- Static tilemap layer format must be **Base64 (uncompressed)** when exporting from Tiled
- Tileset must have **"Embed in map"** enabled in Tiled

---

## Scaffold Command

```bash
npx degit phaserjs/template-vite-ts batoman-game
cd batoman-game
npm install
npm install phaser@3.90.0
npm run dev
```
