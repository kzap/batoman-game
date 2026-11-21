import type { EnemySpawnJson } from '@content/level';
import { ENEMY } from '../tuning';
import { Boss } from './boss';
import { Drone } from './drone';
import type { Enemy } from './enemy';
import { Patroller } from './patroller';
import { Sigbin } from './sigbin';
import { Stealth } from './stealth';
import { Tikbalang } from './tikbalang';
import { TikbalangX } from './tikbalang-x';

export type { BossTell } from './boss-kit';
export type { Enemy, EnemyCtx, EnemyPose, EnemySnapshot, ShotRequest } from './enemy';
export { BossUnit } from './boss-kit';
export { Boss } from './boss';
export { Drone } from './drone';
export { Patroller } from './patroller';
export { Sigbin } from './sigbin';
export { Stealth } from './stealth';
export { Tikbalang } from './tikbalang';
export { TikbalangX } from './tikbalang-x';

/** Build an enemy from its level entry. */
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
    case 'sigbin':
      return new Sigbin(id, spec.x, spec.y);
    case 'tikbalang':
      return new Tikbalang(id, spec.x, spec.y, patrol);
    case 'tikbalang-x':
      return new TikbalangX(id, spec.x, spec.y);
  }
}
