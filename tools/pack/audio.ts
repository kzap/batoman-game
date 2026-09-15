import { execFile } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * `art-source/audio/music.json`: which source recordings become served tracks.
 * Track ids are what `src/app/audio` asks for; sources stay out of the served tree.
 */
export interface MusicSpec {
  /** Opus target bitrate. 80 kbps keeps a 3-minute loop near 2 MB with no audible loss for game music. */
  readonly bitrateKbps: number;
  readonly tracks: Readonly<Record<string, { readonly source: string; readonly title: string }>>;
}

export interface WrittenTrack {
  readonly id: string;
  readonly path: string;
  readonly bytes: number;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;

export function parseMusicSpec(raw: unknown, path: string): MusicSpec {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${path}: not an object`);
  const o = raw as Record<string, unknown>;
  if (typeof o['bitrateKbps'] !== 'number' || o['bitrateKbps'] < 32 || o['bitrateKbps'] > 256) throw new Error(`${path}: bitrateKbps must be 32..256`);
  if (typeof o['tracks'] !== 'object' || o['tracks'] === null) throw new Error(`${path}: tracks missing`);
  for (const [id, t] of Object.entries(o['tracks'] as Record<string, unknown>)) {
    if (!ID.test(id)) throw new Error(`${path}: bad track id "${id}"`);
    const tt = t as Record<string, unknown>;
    if (typeof tt['source'] !== 'string' || typeof tt['title'] !== 'string') throw new Error(`${path}: track "${id}" needs source and title`);
  }
  return raw as MusicSpec;
}

/** The ffmpeg binary: `ffmpeg-static` ships one per platform so CI needs no system install. */
async function ffmpegPath(): Promise<string> {
  const mod = (await import('ffmpeg-static')) as unknown as { default: string | null };
  if (!mod.default) throw new Error('ffmpeg-static has no binary for this platform');
  return mod.default;
}

/** Transcode every track to Opus in an Ogg container; the browser streams it through an <audio> element. */
export async function buildMusic(specPath: string, sourceDir: string, outDir: string): Promise<WrittenTrack[]> {
  const spec = parseMusicSpec(JSON.parse(await readFile(specPath, 'utf8')), specPath);
  const ffmpeg = await ffmpegPath();
  await mkdir(outDir, { recursive: true });
  const out: WrittenTrack[] = [];
  for (const [id, t] of Object.entries(spec.tracks)) {
    const src = join(sourceDir, t.source);
    const dest = join(outDir, `${id}.ogg`);
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vn', '-c:a', 'libopus', '-b:a', `${spec.bitrateKbps}k`, '-vbr', 'on', '-metadata', `title=${t.title}`, dest]);
    out.push({ id, path: dest, bytes: (await stat(dest)).size });
  }
  return out;
}
