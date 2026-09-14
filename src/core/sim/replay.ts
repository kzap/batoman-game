import { unpackInput, type InputFrame } from './input';

/** One run of identical packed frames: `[bits, count]`. */
export type InputRun = readonly [bits: number, count: number];

/** The part of a replay fixture the sim needs: seed plus run-length encoded inputs. */
export interface ReplayInputs {
  readonly seed: number;
  readonly inputs: readonly InputRun[];
}

/** Expand runs into one InputFrame per tick. */
export function* decodeInputs(runs: readonly InputRun[]): Generator<InputFrame> {
  for (const [bits, count] of runs) {
    const f = unpackInput(bits);
    for (let i = 0; i < count; i++) yield f;
  }
}
