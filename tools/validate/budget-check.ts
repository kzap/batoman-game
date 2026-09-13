import { BUDGET, forbiddenServedPathReason, type Budget } from '../config';
import { AUDIO_EXT, CODE_EXT, IMAGE_EXT, Report, SOURCEMAP_EXT, fmtBytes, type FileEntry } from './lib';

/**
 * Check a built `dist/` listing against the payload budgets.
 * Pure function over a file list so it can be unit-tested without a real build.
 */
export function checkBudget(files: FileEntry[], budget: Budget = BUDGET): Report {
  const report = new Report();
  const served = files.filter((f) => !SOURCEMAP_EXT.test(f.rel));

  const total = served.reduce((n, f) => n + f.size, 0);
  const code = served.filter((f) => CODE_EXT.test(f.rel)).reduce((n, f) => n + f.size, 0);
  report.note(`served total ${fmtBytes(total)} / ${fmtBytes(budget.totalServed)}`);
  report.note(`code ${fmtBytes(code)} / ${fmtBytes(budget.code)}`);

  if (total > budget.totalServed) {
    report.error(`served payload ${fmtBytes(total)} exceeds budget ${fmtBytes(budget.totalServed)}`);
  }
  if (code > budget.code) {
    report.error(`code payload ${fmtBytes(code)} exceeds budget ${fmtBytes(budget.code)}`);
  }

  for (const f of served) {
    if (IMAGE_EXT.test(f.rel) && f.size > budget.singleImage) {
      report.error(`${f.rel} is ${fmtBytes(f.size)}; image limit is ${fmtBytes(budget.singleImage)}`);
    }
    if (AUDIO_EXT.test(f.rel) && f.size > budget.singleAudio) {
      report.error(`${f.rel} is ${fmtBytes(f.size)}; audio limit is ${fmtBytes(budget.singleAudio)}`);
    }
    const reason = forbiddenServedPathReason(f.rel);
    if (reason) report.error(`${f.rel}: ${reason}`);
  }

  return report;
}
