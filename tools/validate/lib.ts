import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface FileEntry {
  /** Path relative to the walk root, POSIX separators. */
  rel: string;
  size: number;
}

/** Recursively list files under `root`. Returns [] if root does not exist. */
export function walk(root: string): FileEntry[] {
  const out: FileEntry[] = [];
  const visit = (dir: string): void => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const abs = join(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) visit(abs);
      else out.push({ rel: relative(root, abs).split('\\').join('/'), size: st.size });
    }
  };
  visit(root);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

export const IMAGE_EXT = /\.(png|webp|avif|jpe?g|ktx2|basis)$/i;
export const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|opus)$/i;
export const CODE_EXT = /\.(js|mjs|css)$/i;
export const SOURCEMAP_EXT = /\.map$/i;

export const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

export class Report {
  readonly errors: string[] = [];
  readonly notes: string[] = [];

  error(msg: string): void {
    this.errors.push(msg);
  }
  note(msg: string): void {
    this.notes.push(msg);
  }

  get ok(): boolean {
    return this.errors.length === 0;
  }

  /** Print to stdout/stderr and return the process exit code. */
  print(title: string): number {
    console.log(`\n== ${title} ==`);
    for (const n of this.notes) console.log(`   ${n}`);
    for (const e of this.errors) console.error(`X  ${e}`);
    console.log(this.ok ? 'OK' : `FAILED (${this.errors.length} errors)`);
    return this.ok ? 0 : 1;
  }
}
