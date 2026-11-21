import type { DecorJson, DecorLayer } from '@content/level-art';
import { DECOR_LAYERS } from '@content/level-art';

/**
 * One draw of every copy of a prop that shares a layer, a flip, and a
 * screen-sized chunk. The chunk keeps the instance list's bounds near the
 * camera so frustum culling can drop the rest of a long level. Flip is part
 * of the key because a mirrored quad needs its own UVs: an instance matrix
 * with a negative scale would be back-face culled inside a batch of unflipped
 * copies (Three flips the winding per object, not per instance).
 */
export interface DecorInstance {
  /** Index in the level's decor array, so a batch can be drawn in content order. */
  readonly order: number;
  readonly x: number;
  readonly y: number;
  readonly flip: boolean;
  readonly w?: number;
  readonly h?: number;
}

export interface DecorBatch {
  readonly layer: DecorLayer;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly prop: string;
  readonly flip: boolean;
  readonly instances: readonly DecorInstance[];
}

export function decorBatches(decor: readonly DecorJson[], chunkW: number, chunkH: number): DecorBatch[] {
  if (chunkW <= 0 || chunkH <= 0) throw new Error('decor chunk size must be positive');
  const groups = new Map<string, { batch: Omit<DecorBatch, 'instances'>; instances: DecorInstance[] }>();
  decor.forEach((d, order) => {
    const layer = d.layer ?? 'prop';
    const flip = d.flip ?? false;
    const chunkX = Math.floor(d.x / chunkW);
    const chunkY = Math.floor(d.y / chunkH);
    const key = `${layer}|${chunkX}|${chunkY}|${d.prop}|${flip ? 1 : 0}`;
    let group = groups.get(key);
    if (!group) {
      group = { batch: { layer, chunkX, chunkY, prop: d.prop, flip }, instances: [] };
      groups.set(key, group);
    }
    const instance: DecorInstance = { order, x: d.x, y: d.y, flip };
    const sized: { w?: number; h?: number } = {};
    if (d.w !== undefined) sized.w = d.w;
    if (d.h !== undefined) sized.h = d.h;
    group.instances.push({ ...instance, ...sized });
  });
  return [...groups.values()]
    .map((g) => ({ ...g.batch, instances: g.instances }))
    .sort((a, b) => {
      const layer = DECOR_LAYERS.indexOf(a.layer) - DECOR_LAYERS.indexOf(b.layer);
      if (layer !== 0) return layer;
      return (a.instances[0]?.order ?? 0) - (b.instances[0]?.order ?? 0);
    });
}
