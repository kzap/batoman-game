import type { Policy } from './harness';
import { bossFight, dashJump, dropThrough, fight, jump, ride, route, run, type Step, waitMover, waitMoverSettling, waitUntil, wallClimb } from './route';

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
    run(1, 380),
    fight(900), // patroller at 700
    run(1, 1122),
    jump(1), // pit A (96)
    run(1, 1300),
    fight(1700), // drone at 1500 dives to chest height
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
    run(1, 3180),
    fight(3520), // patroller at 3400
    run(1, 3470),
    dashJump(1), // dash gap 3520..3648
    run(1, 4100),
    jump(1), // block 4160
    fight(4600), // drone at 4300, fought from the block top so the block does not eat the shots
    run(1, 4292),
    jump(1), // block 4352
    run(1, 4500),
    jump(1), // spikes 4544
    run(1, 4700),
    fight(5200), // patroller at 5000, shot across pit C so its fire cannot catch us mid-jump
    run(1, 4770),
    jump(1), // pit C (96)
    run(1, 5150),
    jump(1), // block row 5216
    run(1, 5550),
    dashJump(1), // dash gap 5600..5728
    run(1, 5800),
    bossFight(), // ASWANG prototype at 6150
    fight(6400), // its leftover drones
    run(1, 6400),
  ],

  /** Quiapo chapel: drop to the nave, stepping stones over the water, trap pillar, spikes, one-way ladder up the shaft, gallery. */
  'level-3': () => [
    run(1, 470),
    waitUntil('landed in the nave', (c) => c.grounded && c.y === 448),
    run(1, 610),
    fight(1000), // cloaked ambusher at 800
    run(1, 994),
    jump(1), // stone 1
    run(1, 1150),
    jump(1), // stone 2
    run(1, 1310),
    jump(1), // stone 3
    run(1, 1470),
    jump(1), // far floor
    run(1, 1650),
    fight(2100), // drone at 1900
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
    run(1, 2650),
    fight(3300), // patroller at 3100
    run(1, 2830),
    jump(1), // spikes at 2880
    run(1, 3584),
  ],

  /** NSA tower: street fight, spikes, scaffold rungs up the face, balcony, lift, ambusher, wall-kick shaft, upper rungs, roof guard. */
  'level-4': () => [
    fight(600), // patroller patrolling 440..560, shot from spawn before it can see us
    run(1, 565),
    jump(1), // spikes at 608
    run(1, 690),
    jump(1), // rung 1 (704..864, top 128)
    fight(1152), // drone at 960 dives to chest height
    run(1, 830),
    jump(1), // rung 2 (896..1024, top 192)
    run(-1, 930),
    jump(-1), // rung 3 (704..864, top 256)
    run(1, 830),
    jump(1), // rung 4 (896..1024, top 320)
    run(-1, 930),
    jump(-1), // rung 5 (704..864, top 384)
    run(1, 830),
    jump(1), // balcony 1 (864..1152, top 448)
    run(1, 960),
    run(-1, 890), // to the balcony's edge, clear of the lift's path
    waitMoverSettling(0, 432),
    run(-1, 862), // onto the lift, at its balcony-side edge
    waitUntil('lift at the top', (c) => (c.snap.movingSolids[0]?.y ?? 0) >= 812),
    run(1, 900), // off onto balcony 2
    fight(1152), // cloaked ambusher at 1100 decloaks as we arrive
    run(1, 1070), // under the hanging column into the shaft
    wallClimb(1, 1216), // kick between the column and the tower face up to the rung at 1216
    run(-1, 1110),
    jump(-1), // rung at 1280 (896..1024)
    fight(700, -1), // drone at 900 dives on arrival
    run(1, 960),
    jump(1), // rung at 1344 (992..1120)
    run(1, 1090),
    jump(1), // roof (top 1408)
    fight(1600), // roof guard patrolling 1520..1560 in front of the exit
    run(1, 1600),
  ],

  /** Rooftop garden: hop up, dash gap, vent, vertical lift, planter, spikes, drop, planter steps, spikes, exit. */
  'level-6': () => [
    run(1, 612),
    jump(1), // roof 2 (+32 over a 64 gap)
    run(1, 726),
    jump(1), // planter at 760
    run(1, 850),
    fight(1200), // drone at 1000
    run(1, 1210),
    dashJump(1), // dash gap 1248..1376
    run(1, 1650),
    jump(1), // vent at 1700
    run(1, 2000),
    waitMover(0, { y: 208 }),
    run(1, 2080), // onto the lift
    waitUntil('lift at the top', (c) => (c.snap.movingSolids[0]?.y ?? 0) >= 430),
    fight(2400), // patroller at 2300, shot from the lift before stepping off
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
