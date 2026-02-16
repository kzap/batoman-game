export interface LevelConfig {
  index: number;
  name: string;
  tilemapKey: string;
  tilesetKey: string;       // name of tileset inside Tiled
  tilesetImageKey: string;  // Phaser texture key
  bgKeys: { far: string; mid: string; near: string };
  musicKey: string;
  bossType?: string;
  startX: number;
  startY: number;
}

export const LEVELS: LevelConfig[] = [
  {
    index: 1,
    name: 'Tondo Sublevel Docks',
    tilemapKey: 'level1',
    tilesetKey: 'level-1-tileset',   // must match the name given inside Tiled
    tilesetImageKey: 'level-1-tileset',
    bgKeys: {
      far:  'level-1-background',
      mid:  'level-1-midground',
      near: 'level-1-foreground',
    },
    musicKey: 'bgm-level1',
    bossType: undefined,
    startX: 100,
    startY: 680,
  },
];
