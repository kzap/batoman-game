import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUDGET, PATHS } from '../config';
import { Report, walk } from './lib';

/**
 * Validate repository content before build:
 *  - public/ contains no raw art (it would ship to players)
 *  - the content manifest parses
 *  - later phases add atlas + level schema checks here
 */
export function validateContent(root = '.'): Report {
  const report = new Report();

  const pub = walk(join(root, PATHS.public));
  for (const f of pub) {
    for (const pat of BUDGET.forbiddenPathPatterns) {
      if (pat.test(f.rel)) {
        report.error(`public/${f.rel} matches ${pat}; move it to ${PATHS.artSource}/`);
        break;
      }
    }
  }
  report.note(`public/: ${pub.length} files`);

  const manifestPath = join(root, PATHS.content, 'manifest.json');
  if (!existsSync(manifestPath)) {
    report.error(`missing ${manifestPath}`);
  } else {
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as { levels?: unknown };
      if (!Array.isArray(m.levels)) report.error('manifest.levels must be an array');
      else report.note(`manifest: ${m.levels.length} levels`);
    } catch (e) {
      report.error(`manifest.json is not valid JSON: ${(e as Error).message}`);
    }
  }

  return report;
}

const isMain = process.argv[1]?.endsWith('validate/index.ts') ?? false;
if (isMain) {
  process.exit(validateContent().print('content validation'));
}
