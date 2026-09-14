/** Type guards shared by the content validators; JSON in, narrowed values out. */
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isInt = (v: unknown): v is number => Number.isInteger(v);
/** Lower-case identifier used for atlas, prop, layer, and backdrop names across the pipeline. */
export const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
