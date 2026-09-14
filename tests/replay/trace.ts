import { ROUTES } from './bots';
import { loadLevel, record } from './harness';
import { route } from './route';

/**
 * Trace a route step by step while authoring a level or its bot:
 *   npm run replay:trace -- level-3
 * Prints the tick and player position at which each step finished, then the
 * outcome. A route that stalls shows where; a death shows as lost lives/hp.
 */
const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('usage: replay:trace <level-id>...');
  process.exit(2);
}
for (const id of ids) {
  const steps = ROUTES[id];
  if (!steps) {
    console.error(`no route for ${id}; known: ${Object.keys(ROUTES).join(', ')}`);
    process.exitCode = 1;
    continue;
  }
  const rec = record(loadLevel(id), 1, route(steps(), (s, c) => console.info(`  t${c.tick} x${c.x.toFixed(0)} y${c.y.toFixed(0)}: ${s.name}`)), 6000);
  const f = rec.final;
  console.info(`== ${id}: ${f.status} in ${f.tick} ticks, lives ${f.lives}, hp ${f.player.hp}, x ${f.player.x.toFixed(0)}`);
  if (f.status !== 'complete') process.exitCode = 1;
}
