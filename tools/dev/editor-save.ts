import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatLevel } from '../../src/content/format';
import { levelProblems, type LevelJson } from '../../src/content/level';
import { PATHS } from '../config';
import { levelArtReferences } from '../validate/level-refs';

/**
 * Editor save endpoint logic, kept free of HTTP so it can be unit-tested.
 * A level is written only when it would pass `npm run validate`: schema,
 * geometry rules, and art references against the built atlases/backdrops.
 */

export interface SaveResult {
  readonly status: 200 | 400 | 404 | 422;
  /** `path` and `text` are set on success: what was written and where (the plugin uses them to recognise its own file change). */
  readonly body: { readonly ok: boolean; readonly problems?: readonly string[]; readonly path?: string; readonly text?: string };
}

export interface SaveIo {
  readonly root: string;
  readonly manifestIds: () => readonly string[];
  readonly write: (path: string, text: string) => void;
  readonly artReferences: (level: LevelJson) => readonly string[];
}

export function defaultIo(root: string): SaveIo {
  return {
    root,
    manifestIds: () => {
      const m = JSON.parse(readFileSync(join(root, PATHS.content, 'manifest.json'), 'utf8')) as { levels: { id: string }[] };
      return m.levels.map((l) => l.id);
    },
    write: (path, text) => writeFileSync(path, text),
    artReferences: (level) => levelArtReferences(level, root),
  };
}

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export function saveLevel(id: string, bodyText: string, io: SaveIo): SaveResult {
  if (!ID_RE.test(id)) return { status: 400, body: { ok: false, problems: [`bad level id "${id}"`] } };
  if (!io.manifestIds().includes(id)) {
    return { status: 404, body: { ok: false, problems: [`level "${id}" is not in ${PATHS.content}/manifest.json; add it there first`] } };
  }
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch (e) {
    return { status: 400, body: { ok: false, problems: [`body is not JSON: ${(e as Error).message}`] } };
  }
  const problems = levelProblems(json);
  if (problems.length === 0 && (json as LevelJson).id !== id) problems.push(`level id "${(json as LevelJson).id}" does not match URL id "${id}"`);
  if (problems.length === 0) problems.push(...io.artReferences(json as LevelJson));
  if (problems.length) return { status: 422, body: { ok: false, problems } };
  const text = formatLevel(json);
  const path = join(io.root, PATHS.content, 'levels', `${id}.json`);
  io.write(path, text);
  return { status: 200, body: { ok: true, path, text } };
}
