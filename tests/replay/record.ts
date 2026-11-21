import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYER } from '@game/tuning';
import type { WorldSnapshot } from '@game/world';
import { clearRoute, collectHpUp, lyingPathRoute } from './bots';
import { FIXTURE_DIR, loadLevel, record, toFixture, type Policy } from './harness';

/**
 * Re-record replay fixtures from the scripted policies:
 *   npx tsx tests/replay/record.ts
 *   npx tsx tests/replay/record.ts level-1-hp-up
 * Commit the resulting diff together with the tuning or level change that caused it.
 * An argument is a fixture name; with no argument every fixture is re-recorded.
 */
interface Run {
  readonly name: string;
  readonly level: string;
  readonly seed: number;
  readonly policy: () => Policy;
  readonly maxTicks: number;
  /** Stop before the next tick once this holds. The satisfying tick is kept. */
  readonly done?: (snap: WorldSnapshot) => boolean;
}

const runs: Run[] = [
  ...['level-1', 'level-3', 'level-4', 'level-6'].map((level) => ({
    name: `${level}-clear`,
    level,
    seed: 1,
    policy: () => clearRoute(level),
    maxTicks: 9000,
  })),
  {
    name: 'level-6-lying-path',
    level: 'level-6',
    seed: 1,
    policy: lyingPathRoute,
    maxTicks: 5000,
    done: (snap) => snap.player.hp <= 0,
  },
  {
    name: 'level-1-hp-up',
    level: 'level-1',
    seed: 1,
    policy: collectHpUp,
    maxTicks: 120,
    done: (snap) => snap.player.maxHp > PLAYER.maxHp,
  },
];

const only = process.argv.slice(2);
mkdirSync(FIXTURE_DIR, { recursive: true });
for (const r of runs) {
  if (only.length > 0 && !only.includes(r.name)) continue;
  const rec = record(loadLevel(r.level), r.seed, r.policy(), r.maxTicks, r.done);
  const fx = toFixture(r.level, r.seed, rec);
  const written = r.name === 'level-1-hp-up'
    ? { ...fx, expect: { status: fx.expect.status, ticks: fx.expect.ticks, lives: fx.expect.lives, hp: fx.expect.hp, maxHp: rec.final.player.maxHp, x: fx.expect.x } }
    : fx;
  writeFileSync(join(FIXTURE_DIR, `${r.name}.json`), JSON.stringify(written) + '\n');
  console.info(`${r.name}: ${written.expect.status} in ${written.expect.ticks} ticks, hp ${written.expect.hp}, max ${rec.final.player.maxHp}, lives ${written.expect.lives}, x ${written.expect.x} (${written.inputs.length} runs)`);
  if (r.name.endsWith('-clear') && written.expect.status !== 'complete') process.exitCode = 1;
  if (r.name === 'level-1-hp-up' && rec.final.player.maxHp === PLAYER.maxHp) process.exitCode = 1;
  if (r.name === 'level-6-lying-path' && (written.expect.hp !== 0 || written.expect.x < 1200 || written.expect.x > 1400)) process.exitCode = 1;
}
