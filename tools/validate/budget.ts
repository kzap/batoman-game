import { existsSync } from 'node:fs';
import { PATHS } from '../config';
import { checkBudget } from './budget-check';
import { walk } from './lib';

if (!existsSync(PATHS.dist)) {
  console.error(`X  ${PATHS.dist}/ not found; run \`vite build\` first`);
  process.exit(1);
}

process.exit(checkBudget(walk(PATHS.dist)).print('payload budget'));
