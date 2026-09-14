import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, forbiddenServedPathReason } from '../config';
import { validateAssets } from './assets';
import { Report, walk } from './lib';

/**
 * Validate repository content before build:
 *  - public/ contains nothing that must not ship (raw art, images that bypassed the pipeline)
 *  - the content manifest parses
 *  - every recipe/backdrop spec has pipeline output and each atlas JSON matches its image (assets.ts)
 *  - later phases add level schema checks here
 */
export function validateContent(root = '.'): Report {
  const report = new Report();

  const pub = walk(join(root, PATHS.public));
  for (const f of pub) {
    const reason = forbiddenServedPathReason(f.rel);
    if (reason) report.error(`public/${f.rel}: ${reason}; raw sources belong in ${PATHS.artSource}/`);
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
  const content = validateContent().print('content validation');
  const assets = await validateAssets().catch((e: unknown) => {
    const r = new Report();
    r.error(`asset validation crashed: ${(e as Error).message}`);
    return r;
  });
  process.exit(content || assets.print('asset pipeline outputs'));
}
