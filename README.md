# BatoMan

> A Filipino-inspired cyberpunk side-scrolling platformer — Neo-Maynila, 2147.

![Level 1 — Tondo Sublevel Docks](public/assets/level-1/concept-art-mockup.png)

Play as **BatoMan**, a Tondo street kid with a plasma-buster prosthetic arm, fighting through NSA-controlled districts to dismantle Project ASWANG and confront Dr. Epal. Think Mega Man meets cyberpunk Manila.

---

## Controls

| Action | Keys |
|--------|------|
| Move | Arrow keys or A / D |
| Jump | Up / W / Space |
| Wall kick | Jump while against a wall |
| Salakot dash | Down + move direction |
| Plasma burst | Z (tap) |
| Nova blast | Z (hold 0.8 s, then release) |
| Debug hitboxes | `` ` `` (backtick) |

---

## Running Locally

**Requirements:** Node.js 18+ and npm.

```bash
# 1. Clone the repo
git clone <repo-url>
cd batoman-game

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Open **http://localhost:5173** in your browser. The dev server supports hot-module replacement — changes to TypeScript files reload instantly.

### Other commands

```bash
npm run build     # Type-check + production build → dist/
npm run preview   # Serve the production build locally
```

---

## Project Structure

```
src/
├── config/         # Phaser game config (canvas size, physics gravity)
├── data/           # Level definitions (startX/Y, tilemap/tileset keys)
├── objects/        # Game objects — Player, Enemy
├── scenes/         # Phaser scenes — MenuScene, PreloadScene, GameScene, UIScene
├── systems/        # LevelLoader (tilemap + spawn parsing), CheckpointSystem
└── types/          # Shared TypeScript interfaces

public/assets/
├── characters/     # Sprite sheets (batoman, patroller, drone, tikbalang)
├── level-1/        # Tilemap JSON, tileset PNG, background layers
└── …               # Additional levels (2–4 placeholder art)

docs/
├── PRD.md          # Product requirements
├── TDD.md          # Technical design document
├── ART.md          # Art direction guide
└── STORY.md        # Narrative and lore
```

---

## Contributing

Pull requests are welcome. Please read through the relevant doc in `docs/` before making structural changes.

### Prerequisites

- Node.js 18+
- Familiarity with [Phaser 3](https://phaser.io/phaser3) Arcade Physics
- TypeScript strict mode is enforced — all new code must type-check cleanly

### Dev workflow

```bash
npm run dev          # Start dev server with HMR
# …make changes…
npm run build        # Confirm no type errors before opening a PR
```

### Key conventions

| Area | Convention |
|------|-----------|
| Physics bodies | `setSize` in **texture pixels**; `setOffset` in **world/display pixels** |
| Tile layers | Do **not** use `setScale` on `TilemapLayer` — tile physics bodies ignore visual scale |
| Enemy spawning | Spawn y from Tiled is the floor surface; offset up by `displayHeight / 2` before passing to `new Enemy()` |
| Animations | Skip frame 0 on enemy idle loops — frame 0 has inconsistent positioning after background removal |
| Sprite backgrounds | Run `python3 fix_sprites.py` after editing any sprite sheet to strip the background |

### Adding a new enemy type

1. Add the spritesheet to `public/assets/characters/` and register it in `PreloadScene.ts`
2. Add a background-strip call in `fix_sprites.py`, re-run it
3. Extend `EnemyType` in `src/objects/Enemy.ts` and add the texture key to `ENEMY_TEXTURES`
4. Create idle/attack animation keys in `GameScene.createAnimations()`
5. Add spawn objects to the Tiled map with the `enemyType` property set

### Adding a new level

1. Create the Tiled map (`.json`) and export the tileset image to `public/assets/level-N/`
2. Add a `LevelConfig` entry to `src/data/levels.ts`
3. Register the tilemap and tileset in `PreloadScene.ts` under the `level-N` key
4. Add a level select thumbnail to `public/assets/` and reference it in `MenuScene.ts`

### Sprite sheets

Enemy sprites are processed by `fix_sprites.py` (PIL/Pillow required):

```bash
pip install pillow
python3 fix_sprites.py
```

Tolerances are tuned per sheet — lower values (15) for enemy sheets, slightly higher (20) for BatoMan's white background. Adjust if edge pixels are over-erased.

---

## Tech Stack

| | |
|---|---|
| Engine | Phaser 3.90.0 |
| Language | TypeScript 5.4 (strict) |
| Bundler | Vite 5 |
| Physics | Arcade |
| Levels | Tiled map editor (`.json` export) |
