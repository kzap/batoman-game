import type { EnemySpawnJson } from '@content/level';
import { ENEMY } from '../tuning';
import { Boss } from './boss';
import { Drone } from './drone';
import type { Enemy } from './enemy';
import { Patroller } from './patroller';
import { Stealth } from './stealth';

export type { Enemy, EnemyCtx, EnemyPose, EnemySnapshot, ShotRequest } from './enemy';
export { Boss } from './boss';
export { Drone } from './drone';
export { Patroller } from './patroller';
export { Stealth } from './stealth';

/** Build an enemy from its level entry. Types without behaviour yet (tikbalang) return null and stay spawn data. */
export function spawnEnemy(id: number, spec: EnemySpawnJson): Enemy | null {
  const patrol = spec.patrolDistance ?? ENEMY.defaultPatrol;
  switch (spec.type) {
    case 'patroller':
      return new Patroller(id, spec.x, spec.y, patrol);
    case 'drone':
      return new Drone(id, spec.x, spec.y, patrol);
    case 'stealth':
      return new Stealth(id, spec.x, spec.y);
    case 'aswang':
      return new Boss(id, spec.x, spec.y);
    case 'tikbalang':
      return null;
  }
}
