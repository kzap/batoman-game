/**
 * Fails if the production bundle still contains the lockstep module.
 * `npm run build` must drop it; `npm run build:e2e` must keep it.
 */
import { readdirSync, readFileSync } from 'node:fs';

/** Present only in `lockstepFromQuery` (`q.get('replayTicks')`). */
const MARKER = 'replayTicks';
const files = readdirSync('dist/assets').filter((name) => name.endsWith('.js') && !name.endsWith('.map'));
const hits = files.filter((name) => readFileSync(`dist/assets/${name}`, 'utf8').includes(MARKER));
const expect = process.argv[2] === '--expect';

if (expect && hits.length === 0) {
  console.error(`e2e bundle is missing ${MARKER}; lockstep was tree-shaken out of the test build`);
  process.exit(1);
}
if (!expect && hits.length > 0) {
  console.error(`production bundle still contains lockstep (${hits.join(', ')})`);
  process.exit(1);
}
console.info(expect ? `e2e bundle includes lockstep (${hits.join(', ')})` : 'production bundle has no lockstep');
