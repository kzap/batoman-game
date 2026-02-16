import Phaser from 'phaser';
import { LevelConfig } from '../data/levels';

export type SpawnType = 'enemy' | 'powerup' | 'checkpoint' | 'boss-trigger' | 'death-zone';

export interface SpawnData {
  type: SpawnType;
  x: number;
  y: number;
  width: number;
  height: number;
  properties: Record<string, unknown>;
}

export interface LoadedLevel {
  platformLayer: Phaser.Tilemaps.TilemapLayer;
  hazardLayer: Phaser.Tilemaps.TilemapLayer | null;
  spawns: SpawnData[];
  worldWidth: number;
  worldHeight: number;
}

export class LevelLoader {
  constructor(private scene: Phaser.Scene) {}

  load(config: LevelConfig): LoadedLevel {
    const map = this.scene.make.tilemap({ key: config.tilemapKey });
    const tileset = map.addTilesetImage(config.tilesetKey, config.tilesetImageKey);

    if (!tileset) {
      throw new Error(`Tileset "${config.tilesetKey}" not found in map "${config.tilemapKey}"`);
    }

    // Background decoration — no collision, depth below player
    const bgDecoLayer = map.createLayer('background-deco', tileset);
    bgDecoLayer?.setDepth(3);

    // Solid platforms — collision enabled via custom tile property
    const platformLayer = map.createLayer('platforms', tileset);
    if (!platformLayer) {
      throw new Error(`Layer "platforms" not found in map "${config.tilemapKey}"`);
    }
    platformLayer.setDepth(4);
    platformLayer.setCollisionByProperty({ collides: true });

    // Hazard tiles — spikes, death zones
    const hazardLayer = map.createLayer('hazards', tileset);
    hazardLayer?.setDepth(4);
    if (hazardLayer) {
      hazardLayer.setCollisionByProperty({ damage: true });
      hazardLayer.setCollisionByProperty({ 'instant-death': true });
    }

    // Foreground decoration — renders above player
    const fgDecoLayer = map.createLayer('foreground-deco', tileset);
    fgDecoLayer?.setDepth(50);

    // Parse spawn objects
    const spawnLayer = map.getObjectLayer('spawns');
    const spawns: SpawnData[] = spawnLayer ? this.parseSpawns(spawnLayer) : [];

    return {
      platformLayer,
      hazardLayer: hazardLayer ?? null,
      spawns,
      worldWidth: map.widthInPixels,
      worldHeight: map.heightInPixels,
    };
  }

  private parseSpawns(layer: Phaser.Tilemaps.ObjectLayer): SpawnData[] {
    return layer.objects.map(obj => ({
      type: (obj.type ?? obj.name ?? 'enemy') as SpawnType,
      x: obj.x ?? 0,
      y: obj.y ?? 0,
      width: obj.width ?? 32,
      height: obj.height ?? 32,
      properties: this.mapProperties(
        (obj.properties ?? []) as { name: string; value: unknown }[]
      ),
    }));
  }

  private mapProperties(props: { name: string; value: unknown }[]): Record<string, unknown> {
    return Object.fromEntries(props.map(p => [p.name, p.value]));
  }
}
