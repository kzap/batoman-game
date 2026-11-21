import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  // One browser at a time. Software WebGL is easy to stall, and the perf project measures a single renderer.
  workers: 1,
  // Retries hide timing flakes. The gate is lockstep, so a failure should surface on the first attempt.
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    // Software WebGL so the renderer works on headless CI runners.
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: `npm run preview`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    // PR gate: every spec except the frame-budget measurement.
    { name: 'gate', grepInvert: /@perf/, use: { ...devices['Desktop Chrome'] } },
    // Wall-clock fps / ticks report. Not part of `npm run ci`; CI runs it as a non-blocking job.
    { name: 'perf', grep: /@perf/, use: { ...devices['Desktop Chrome'] } },
  ],
  outputDir: 'test-results',
});
