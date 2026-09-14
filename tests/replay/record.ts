import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearRoute } from './bots';
import { FIXTURE_DIR, loadLevel, record, toFixture } from './harness';

/**
 * Re-record replay fixtures from the scripted policies:
 *   npx tsx tests/replay/record.ts
 * Commit the resulting diff together with the tuning change that caused it.
 */
const runs = ['level-1', 'level-3', 'level-6'].map((level) => ({ name: `${level}-clear`, level, seed: 1 }));

mkdirSync(FIXTURE_DIR, { recursive: true });
for (const r of runs) {
  const rec = record(loadLevel(r.level), r.seed, clearRoute(r.level), 6000);
  const fx = toFixture(r.level, r.seed, rec);
  writeFileSync(join(FIXTURE_DIR, `${r.name}.json`), JSON.stringify(fx) + '\n');
  console.info(`${r.name}: ${fx.expect.status} in ${fx.expect.ticks} ticks, hp ${fx.expect.hp}, lives ${fx.expect.lives}, x ${fx.expect.x} (${fx.inputs.length} runs)`);
  if (fx.expect.status !== 'complete') process.exitCode = 1;
}
