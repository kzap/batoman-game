/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to `1` only by `npm run build:e2e`. Absent from `npm run build` and Pages. */
  readonly VITE_E2E_LOCKSTEP?: string;
  /** `false` or `0` locks level select to the save. Unset stays on for the playtest build. */
  readonly VITE_UNLOCK_ALL_LEVELS?: string;
}

/** Injected by vite.config.ts `define` from package.json version. */
declare const __APP_VERSION__: string;

/** Commit SHA (`dev` outside Actions) and UTC build time, injected by vite.config.ts. */
declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;
