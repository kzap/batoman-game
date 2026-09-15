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
      const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as { levels?: unknown; titleMusic?: unknown };
      const tracks = musicTrackIds(root);
      if (typeof m.titleMusic !== 'string' || !tracks.includes(m.titleMusic)) report.error(`manifest.titleMusic must name a track in ${PATHS.audioSource}/music.json (${tracks.join(', ')})`);
      if (!Array.isArray(m.levels)) report.error('manifest.levels must be an array');
      else {
        report.note(`manifest: ${m.levels.length} levels`);
        for (const entry of m.levels) checkLevelEntry(entry, root, tracks, report);
      }
    } catch (e) {
      report.error(`manifest.json is not valid JSON: ${(e as Error).message}`);
    }
  }

  return report;
}

/** Track ids the music spec will build; an empty list when the spec is missing or broken (reported separately by the pack step). */
function musicTrackIds(root: string): string[] {
  try {
    const spec = JSON.parse(readFileSync(join(root, PATHS.audioSource, 'music.json'), 'utf8')) as { tracks?: Record<string, unknown> };
    return Object.keys(spec.tracks ?? {});
  } catch {
    return [];
  }
}

/** A manifest entry must point at a level file that passes `levelProblems`, whose id matches, and name a real music track. */
function checkLevelEntry(entry: unknown, root: string, tracks: readonly string[], report: Report): void {
  if (typeof entry !== 'object' || entry === null) return report.error('manifest.levels entries must be objects');
  const { id, file, name, music } = entry as { id?: unknown; file?: unknown; name?: unknown; music?: unknown };
  if (typeof id !== 'string' || typeof file !== 'string') return report.error('manifest.levels entries need string id and file');
  if (typeof name !== 'string' || !name) report.error(`manifest level ${id}: needs a display name`);
  if (typeof music !== 'string' || !tracks.includes(music)) report.error(`manifest level ${id}: music "${String(music)}" is not a track in ${PATHS.audioSource}/music.json`);
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
