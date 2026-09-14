import type { Policy } from './harness';
import { dashJump, dropThrough, fire, jump, ride, route, run, type Step, waitMover, waitUntil } from './route';

/**
 * Scripted routes used to record fixtures. They read the live world, so they
 * are not deterministic scripts themselves; the recorded inputs are. Each
 * route is a list of steps (tests/replay/route.ts) written against the level
 * geometry in src/content/levels; a geometry change usually means a step here
 * moves too. Steps keep state, so a route is a factory.
 */
export const ROUTES: Readonly<Record<string, () => Step[]>> = {
  /** Tondo docks: pit jump, one-way drop, block hop, spikes, mover ride, plateau, two dash gaps, an edge jump. */
  'level-1': () => [
    run(1, 400),
    fire(),
    run(1, 1122),
    jump(1), // pit A (96)
    run(1, 1540),
    jump(1), // onto the one-way at 1600
    run(1, 1690),
    dropThrough(),
    run(1, 1920),
    jump(1), // block at 1984
    run(1, 2165),
    jump(1), // spikes at 2208
    run(1, 2340),
    waitMover(0, { x: 2400 }),
    run(1, 2430), // step down onto the mover
    ride(1, 2560),
    jump(1), // up onto the far floor
    run(1, 2860),
    jump(1), // plateau at 2912
    run(1, 3470),
    fire(),
    dashJump(1), // dash gap 3520..3648
    run(1, 4100),
    jump(1), // block 4160
    run(1, 4292),
    jump(1), // block 4352
    run(1, 4500),
    jump(1), // spikes 4544
    run(1, 4770),
    jump(1), // pit C (96)
    run(1, 5150),
    jump(1), // block row 5216
    run(1, 5550),
    dashJump(1), // dash gap 5600..5728
    run(1, 6400),
  ],

  /** Quiapo chapel: drop to the nave, stepping stones over the water, trap pillar, spikes, one-way ladder up the shaft, gallery. */
  'level-3': () => [
    run(1, 470),
    waitUntil('landed in the nave', (c) => c.grounded && c.y === 448),
    run(1, 994),
    jump(1), // stone 1
    run(1, 1150),
    jump(1), // stone 2
    run(1, 1310),
    jump(1), // stone 3
    run(1, 1470),
    jump(1), // far floor
    run(1, 1700),
    jump(1), // crusher pillar at 1760
    run(1, 1936),
    jump(1), // spikes at 1984
    run(1, 2150),
    jump(1),
    jump(1),
    jump(1),
    jump(1),
    jump(1), // one-way ladder to the gallery (top 768)
    run(1, 2500),
    jump(1), // low pillar at 2560
    run(1, 2830),
    jump(1), // spikes at 2880
    run(1, 3584),
  ],

  /** Rooftop garden: hop up, dash gap, vent, vertical lift, planter, spikes, drop, planter steps, spikes, exit. */
  'level-6': () => [
    run(1, 612),
    jump(1), // roof 2 (+32 over a 64 gap)
    run(1, 860),
    jump(1), // planter at 900
    run(1, 1210),
    dashJump(1), // dash gap 1248..1376
    run(1, 1650),
    jump(1), // vent at 1700
    run(1, 2000),
    waitMover(0, { y: 208 }),
    run(1, 2080), // onto the lift
    waitUntil('lift at the top', (c) => (c.snap.movingSolids[0]?.y ?? 0) >= 430),
    run(1, 2200), // onto roof 4
    run(1, 2350),
    jump(1), // planter at 2400
    run(1, 2570),
    jump(1), // spikes at 2624
    run(1, 2790),
    jump(1), // drop to roof 5 over the 128 gap
    run(1, 3340),
    jump(1), // one-way step 1
    run(1, 3470),
    jump(1), // one-way step 2
    run(1, 3600),
    jump(1), // roof 6
    run(1, 3950),
    jump(1), // spikes at 4000
    run(1, 4480),
  ],
};

/** A fresh policy for a level's route (steps carry state, so never share one across recordings). */
export const clearRoute = (level: string): Policy => {
  const steps = ROUTES[level];
  if (!steps) throw new Error(`no route for ${level}`);
  return route(steps());
};
