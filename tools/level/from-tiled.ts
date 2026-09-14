import { readFile, writeFile } from 'node:fs/promises';
import { levelProblems, type CheckpointJson, type EnemySpawnJson, type EnemyType, type LevelJson, type Rect } from '../../src/content/level';

/**
 * Convert a Tiled JSON map (v1 format: a `platforms` tile layer plus a `spawns`
 * object layer) into the sim's level JSON. Tiled is Y-down in pixels; the sim
 * is Y-up, so every rectangle is flipped about the map height.
 *
 *   tsx tools/level/from-tiled.ts <map.json> <out.json> --id level-1 --name "Tondo Sublevel Docks"
 *
 * Tiles are merged greedily into rectangles: maximal horizontal runs per row,
 * then identical runs stacked vertically. The result is hand-tuned afterwards;
 * this only saves typing 378 rectangles.
 */

interface TiledLayer {
  readonly type: 'tilelayer' | 'objectgroup';
  readonly name: string;
  readonly data?: readonly number[];
  readonly objects?: readonly TiledObject[];
}

interface TiledObject {
  readonly type?: string;
  readonly class?: string;
  readonly name?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly properties?: readonly { name: string; value: unknown }[];
}

interface TiledMap {
  readonly width: number;
  readonly height: number;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly layers: readonly TiledLayer[];
}

/** Merge a tile occupancy grid into non-overlapping rectangles (tile units, Y-down rows). */
export function mergeTiles(grid: readonly boolean[], cols: number, rows: number): Rect[] {
  const used = new Uint8Array(cols * rows);
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!grid[i] || used[i]) continue;
      let w = 1;
      while (c + w < cols && grid[i + w] && !used[i + w]) w++;
      let h = 1;
      outer: while (r + h < rows) {
        for (let k = 0; k < w; k++) {
          const j = (r + h) * cols + c + k;
          if (!grid[j] || used[j]) break outer;
        }
        // Extend downward while the full run is present; tiles the run below
        // has beyond ours are picked up by later rectangles.
        h++;
      }
      for (let rr = 0; rr < h; rr++) for (let k = 0; k < w; k++) used[(r + rr) * cols + c + k] = 1;
      out.push({ x: c, y: r, w, h });
    }
  }
  return out;
}

function prop<T>(o: TiledObject, name: string, fallback: T): T {
  const p = o.properties?.find((q) => q.name === name);
  return p ? (p.value as T) : fallback;
}

export function convertTiled(map: TiledMap, id: string, name: string): LevelJson {
  const ts = map.tilewidth;
  if (map.tileheight !== ts) throw new Error('non-square tiles are not supported');
  const width = map.width * ts;
  const height = map.height * ts;
  const flipRect = (x: number, yDown: number, w: number, h: number): Rect => ({ x: Math.round(x), y: Math.round(height - yDown - h), w: Math.round(w), h: Math.round(h) });

  const platforms = map.layers.find((l) => l.type === 'tilelayer' && l.name === 'platforms');
  if (!platforms?.data) throw new Error('no "platforms" tile layer');
  const grid = platforms.data.map((g) => g !== 0);
  const solids = mergeTiles(grid, map.width, map.height).map((t) => flipRect(t.x * ts, t.y * ts, t.w * ts, t.h * ts));

  const spawns = map.layers.find((l) => l.type === 'objectgroup' && l.name === 'spawns')?.objects ?? [];
  const kind = (o: TiledObject): string => o.type ?? o.class ?? o.name ?? '';
  const enemies: EnemySpawnJson[] = spawns
    .filter((o) => kind(o) === 'enemy')
    .map((o) => ({
      type: prop<EnemyType>(o, 'enemyType', 'patroller'),
      // Tiled marks the object's top-left; v1 treated y as the floor surface.
      x: Math.round(o.x),
      y: Math.round(height - o.y),
      patrolDistance: prop(o, 'patrolDistance', 120),
    }));
  const checkpoints: CheckpointJson[] = spawns.filter((o) => kind(o) === 'checkpoint').map((o) => ({ id: prop(o, 'id', 0), ...flipRect(o.x, o.y, o.width, o.height) }));
  // v1 placed the river below the map; zones outside the bounds are dropped
  // because the sim already kills anything that falls below y = 0.
  const inBounds = (r: Rect): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height;
  const deathZones = spawns
    .filter((o) => kind(o) === 'death-zone')
    .map((o) => flipRect(o.x, o.y, o.width, o.height))
    .filter(inBounds);

  return {
    version: 1,
    id,
    name,
    width,
    height,
    tileSize: ts,
    spawn: { x: 100, y: 0 },
    exit: { x: width - 2 * ts, y: 0, w: 2 * ts, h: height },
    solids,
    oneWay: [],
    movingSolids: [],
    hazards: [],
    deathZones,
    checkpoints,
    enemies,
  };
}

/** Put the spawn's feet on the first solid below `x` from the top. */
export function dropToGround(level: LevelJson, x: number): number {
  let best = 0;
  for (const s of level.solids) if (x >= s.x && x < s.x + s.w) best = Math.max(best, s.y + s.h);
  return best;
}

const isMain = process.argv[1]?.endsWith('from-tiled.ts') ?? false;
if (isMain) {
  const [src, out] = process.argv.slice(2);
  const idIdx = process.argv.indexOf('--id');
  const nameIdx = process.argv.indexOf('--name');
  if (!src || !out || idIdx < 0 || nameIdx < 0) {
    console.error('usage: tsx tools/level/from-tiled.ts <map.json> <out.json> --id <id> --name <name>');
    process.exit(2);
  }
  const map = JSON.parse(await readFile(src, 'utf8')) as TiledMap;
  const converted = convertTiled(map, process.argv[idIdx + 1]!, process.argv[nameIdx + 1]!);
  const level: LevelJson = { ...converted, spawn: { x: 100, y: dropToGround(converted, 100) } };
  const problems = levelProblems(level);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  await writeFile(out, JSON.stringify(level, null, 2) + '\n');
  console.info(`${out}: ${level.solids.length} solids, ${level.enemies.length} enemies, ${level.checkpoints.length} checkpoints, ${level.deathZones.length} death zones`);
}
