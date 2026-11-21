/**
 * Runtime cutscene registry: Vite emits each script JSON as a static asset
 * (`?url&no-inline`) so dialog text does not count against the code budget.
 */

import { parseCutscene, type CutsceneScript } from './cutscene';

const files = import.meta.glob<string>('./cutscenes/*.json', { query: '?url&no-inline', import: 'default', eager: true });

/** Level ids that have a bundled intro script. */
export function cutsceneIds(): readonly string[] {
  return Object.keys(files)
    .map((path) => path.match(/\/([^/]+)\.json$/)?.[1])
    .filter((id): id is string => typeof id === 'string');
}

export function hasCutscene(id: string): boolean {
  return `./cutscenes/${id}.json` in files;
}

export async function loadCutsceneById(id: string): Promise<CutsceneScript> {
  const url = files[`./cutscenes/${id}.json`];
  if (!url) throw new Error(`cutscene ${id}: not bundled`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cutscene ${id}: HTTP ${res.status}`);
  return parseCutscene(await res.json(), id);
}
