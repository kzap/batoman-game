import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { levelProblems, type LevelJson } from '../../src/content/level';
import { PATHS, forbiddenServedPathReason } from '../config';
import { validateAssets } from './assets';
import { levelArtReferences } from './level-refs';
import { Report, walk } from './lib';

/**
 * Validate repository content before build:
 *  - public/ contains nothing that must not ship (raw art, images that bypassed the pipeline)
 *  - the content manifest parses
 *  - every recipe/backdrop spec has pipeline output and each atlas JSON matches its image (assets.ts)
 *  - every manifest level exists and passes levelProblems (src/content/level.ts)
 *  - every prop and backdrop a level's art block names exists in the built assets
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
      else {
        report.note(`manifest: ${m.levels.length} levels`);
        for (const entry of m.levels) checkLevelEntry(entry, root, report);
      }
    } catch (e) {
      report.error(`manifest.json is not valid JSON: ${(e as Error).message}`);
    }
  }

  return report;
}

/** A manifest entry must point at a level file that passes `levelProblems` and whose id matches. */
function checkLevelEntry(entry: unknown, root: string, report: Report): void {
  if (typeof entry !== 'object' || entry === null) return report.error('manifest.levels entries must be objects');
  const { id, file } = entry as { id?: unknown; file?: unknown };
  if (typeof id !== 'string' || typeof file !== 'string') return report.error('manifest.levels entries need string id and file');
  const path = join(root, PATHS.content, file);
  if (!existsSync(path)) return report.error(`manifest level ${id}: ${file} does not exist`);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return report.error(`level ${file}: not valid JSON: ${(e as Error).message}`);
  }
  const problems = levelProblems(json);
  for (const p of problems) report.error(`level ${id}: ${p}`);
  if (problems.length === 0 && (json as { id: string }).id !== id) report.error(`level ${file}: id "${(json as { id: string }).id}" does not match manifest id "${id}"`);
  if (problems.length) return;
  const level = json as LevelJson;
  report.note(`level ${id}: ${level.solids.length} solids`);
  if (level.art) for (const p of levelArtReferences(level, root)) report.error(`level ${id}: ${p}`);
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
