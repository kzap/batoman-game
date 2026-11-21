/**
 * Movement and combat tuning. Units: pixels, seconds, and sim ticks (120 Hz).
 * One object so the whole feel can be diffed in a PR; the renderer never reads
 * these. Numbers are for a 24 x 48 player against 32 px tiles.
 */
/**
 * Pickups. The hitbox is the rect in the level file (like a hazard); the
 * numbers here are the effect. A timed pickup (invincibility) would add its
 * duration beside `hpUp` and a kind in `applyPickup`, not a new loop.
 */
export const PICKUP = {
  hpUp: {
    /** Added to both max HP and current HP. Current is clamped to the new max. */
    hearts: 1,
  },
} as const;

export const PLAYER = {
  width: 24,
  height: 48,
  crouchHeight: 24,

  runSpeed: 200,
  crouchSpeed: 90,
  groundAccel: 1800,
  groundDecel: 2200,
  airAccel: 1400,
  airDecel: 500,
  /** Above runSpeed (after a dash or wall kick) speed bleeds off at this rate. */
  overspeedDecel: 900,

  gravity: 1800,
  maxFall: 640,
  /** Gravity multiplier near the apex while jump is held; makes the arc floaty at the top. */
  apexGravityScale: 0.55,
  apexThreshold: 60,
  /** Gravity multiplier when the jump is released before the apex (short hop). */
  fastFallScale: 1.6,

  jumpSpeed: 540,
  /** Releasing jump early clamps upward speed to this, cutting the arc short. */
  jumpReleaseSpeed: 160,
  coyoteTicks: 12,
  jumpBufferTicks: 10,
  ceilingCorrection: 4,

  wallSlideSpeed: 140,
  wallJumpX: 280,
  wallJumpY: 500,
  /** Horizontal input is ignored this long after a wall kick so the kick has effect. */
  wallJumpLockTicks: 14,
  /** Ticks after leaving a wall during which a wall jump is still accepted. */
  wallCoyoteTicks: 6,

  dashSpeed: 520,
  dashTicks: 14,
  dashCooldownTicks: 24,
  dashEndSpeed: 240,

  /** Crouch-slide: entered with down + horizontal speed; friction is low. */
  slideMinSpeed: 120,
  slideDecel: 350,
  /** Below this horizontal speed the player counts as standing still (pose, slide end). */
  stillSpeed: 10,
  /** Down + jump on a one-way platform: ticks the platform is ignored, and the initial fall speed. */
  dropThroughTicks: 4,
  dropThroughSpeed: 120,

  fireCooldownTicks: 10,
  /** How long the shooting pose lingers after a shot (renderer hint; no gameplay effect). */
  shootPoseTicks: 36,

  maxHp: 3,
  invulnTicks: 72,
  hurtStunTicks: 18,
  knockbackX: 200,
  knockbackY: 260,
  /** Ticks between death and respawn at the checkpoint. */
  respawnTicks: 90,
  lives: 3,
} as const;

export const PROJECTILE = {
  width: 12,
  height: 6,
  speed: 720,
  /** Pixels travelled before despawning. Speed / 120 must stay below `width` so the single overlap probe per tick cannot skip a solid. */
  range: 480,
  damage: 1,
  /** Where the shot leaves the body, relative to the player's feet. */
  muzzleY: 30,
} as const;

/**
 * Charged shot (hold fire). Tapping fires plasma at once; holding past
 * `chargeTicks` and releasing fires a nova that pierces enemies.
 */
export const NOVA = {
  chargeTicks: 96,
  width: 28,
  height: 20,
  speed: 480,
  range: 640,
  damage: 3,
} as const;

/** Shots fired by enemies; the shape is shared, speeds differ per enemy. */
export const ENEMY_SHOT = {
  width: 20,
  height: 10,
  range: 560,
  damage: 1,
} as const;

/**
 * Enemy behaviour, in sim pixels, px/s and ticks. Numbers are Phase 6 first
 * pass: a standing player kills a patroller in three plasma taps before its
 * first shot lands when engaging at sight range; a drone dives to chest
 * height so it can be shot from the ground.
 */
export const ENEMY = {
  /** Pixels between the body and a ledge edge at which a ground enemy turns round. */
  ledgeProbe: 4,
  /** Damage from touching any live enemy body. */
  contactDamage: 1,
  /** Patrol half-width when a spawn omits `patrolDistance`. */
  defaultPatrol: 120,
  /** Per-tick multiplier on the knockback slide while hurt. */
  knockbackDecay: 0.85,
  /** Ground enemies fall like the player does; kept separate so player retuning cannot change enemy footing. */
  gravity: 1800,
  maxFall: 640,
  patroller: {
    width: 40,
    height: 60,
    hp: 3,
    speed: 60,
    /** Sees the player within this horizontal distance, in the facing direction, at roughly its own height. */
    sightRange: 320,
    sightHeight: 96,
    shotCooldownTicks: 150,
    /** Ticks into the shoot pose at which the shot leaves (the sheet's fourth frame). */
    shotWindupTicks: 36,
    shotSpeed: 300,
    muzzleY: 34,
    hurtTicks: 20,
    knockback: 120,
    deathTicks: 96,
  },
  drone: {
    width: 48,
    height: 28,
    hp: 2,
    speed: 90,
    /** Centre height above the spawn's ground reference while patrolling. */
    hoverHeight: 88,
    bobAmplitude: 6,
    bobPeriodTicks: 120,
    sightRange: 300,
    /**
     * Vertical band (centre to centre) within which a player is noticed or kept in sight: a
     * hovering drone sees the floor it patrols above and one jump higher or lower, not a
     * player several storeys away in a vertical level.
     */
    sightHeight: 128,
    /** Gives up the chase beyond this distance and goes back to hovering. */
    loseRange: 450,
    /** Centre height above the player's feet while chasing: chest height, so a grounded shot connects. */
    chaseHeight: 40,
    /** Horizontal stand-off kept from the player while chasing. */
    chaseStandoff: 120,
    shotCooldownTicks: 120,
    shotWindupTicks: 30,
    shotSpeed: 260,
    hurtTicks: 16,
    knockback: 90,
    deathTicks: 135,
  },
  stealth: {
    width: 40,
    height: 60,
    hp: 3,
    speed: 110,
    /** Player distance that breaks the cloak. */
    ambushRange: 200,
    /** Feet-to-feet vertical band for noticing and keeping the player; a storey above or below is not an ambush. */
    sightHeight: 128,
    decloakTicks: 40,
    cloakedAlpha: 0.15,
    /** Gives up the chase beyond this distance and re-cloaks. */
    chaseRange: 420,
    /** Stops closing in at this centre distance, so contact damage is the player's choice. */
    standoff: 80,
    shotCooldownTicks: 120,
    shotWindupTicks: 36,
    shotSpeed: 340,
    muzzleY: 34,
    hurtTicks: 16,
    knockback: 80,
    deathTicks: 96,
  },
  /**
   * Tikbalang scout (not the Tikbalang-X boss). Patrols in short bursts, then
   * runs in and stomps: a rear, then a low lunge a jump can clear. The burst
   * rhythm is the tick counter, not a random draw.
   */
  tikbalang: {
    width: 64,
    height: 44,
    hp: 4,
    /** Trot during a patrol burst. The chase is `burstSpeed`. */
    speed: 80,
    /** Gallop this many ticks, then stand, while patrolling. */
    burstTicks: 36,
    pauseTicks: 24,
    /** Centre distance at which it notices the player, in either direction. */
    sightRange: 500,
    /** Feet-to-feet band; another storey is not a target. */
    sightHeight: 128,
    /** Gives up the chase past this centre distance, or off the storey. */
    loseRange: 640,
    burstSpeed: 480,
    /** Edge gap it holds before stomping, so the approach itself is not the hit. */
    standoff: 48,
    /** Rear (the stomp clip) before the lunge. Long enough to leave the ground. */
    windupTicks: 24,
    /** Ticks the lunge spends closing that gap. */
    lungeTicks: 18,
    lungeSpeed: 420,
    /** Collider height during the lunge: a jump clears it. */
    lungeHeight: 22,
    /** After a stomp, waits this long at the standoff before the next one. */
    recoverTicks: 90,
    hurtTicks: 16,
    knockback: 140,
    deathTicks: 96,
  },
} as const;

/**
 * Level 1 boss: the ASWANG prototype, a heavy patroller. Three phases by hp
 * thirds: walk and shoot; add rushes that end stunned against a wall with the
 * weak point exposed; add drone summons and faster fire.
 */
export const BOSS = {
  width: 64,
  height: 96,
  hp: 24,
  /** Dormant until the player is this close; the HUD bar appears at the same moment. */
  engageRange: 560,
  /** Hp at which phases 2 and 3 begin. */
  phaseHp: [16, 8] as readonly number[],
  walkSpeed: 50,
  /** Keeps at least this distance while walking and shooting. */
  standoff: 200,
  shotCooldownTicks: [120, 100, 70] as readonly number[],
  burstShots: 3,
  burstSpacingTicks: 12,
  shotWindupTicks: 30,
  shotSpeed: 320,
  /** Shots leave at standing-body height so they must be jumped. */
  muzzleY: 30,
  rushEveryTicks: 360,
  rushWindupTicks: 40,
  rushSpeed: 420,
  /** The boss drops low while rushing: the collider shrinks to this height so a well-timed jump clears it. */
  rushHeight: 56,
  /** A rush that has not hit a wall ends after this many ticks. */
  rushMaxTicks: 90,
  stunTicks: 100,
  /** Weak point (magenta core) relative to the feet; hits there do double while stunned. */
  weakPoint: { y: 56, h: 24 },
  weakPointMultiplier: 2,
  hurtTicks: 8,
  /** Invulnerable pause between phases. */
  phaseShiftTicks: 72,
  /** Phase 3: drones per summon (never past `summonMaxAlive` in total), interval, and where they appear beside the boss. */
  summonCount: 2,
  summonEveryTicks: 480,
  summonMaxAlive: 2,
  summonOffset: 104,
  deathTicks: 180,
  /** HUD label. Kept here so the bar and the e2e check share one string. */
  label: 'ASWANG PROTOTYPE',
} as const;

/**
 * Level 3 boss: the Sigbin Unit. Half the 378 px camera tall. It stalks
 * backward, lunges, then drops its core into the standing shot line. Damage
 * lands only on that core while the recovery window is open. Numbers are ticks
 * at 120 Hz. Each phase is the same pattern, faster.
 */
export const SIGBIN = {
  width: 192,
  /** 188 / 378 is half the camera, within a pixel. ART.md's 64×48 is retired. */
  height: 188,
  hp: 18,
  /** HUD label. */
  label: 'SIGBIN UNIT',
  /** Dormant until the player is this close, on the same storey. */
  engageRange: 420,
  /** Feet-to-feet band for the engage check. The nave below the gallery is not the fight. */
  sightHeight: 160,
  /** Hp at which phases 2 and 3 begin. One nova-or-three-plasma punish per phase. */
  phaseHp: [12, 6] as readonly number[],
  /** Invulnerable pause between phases. The next phase backs off, then telegraphs; it does not lunge from where the last one stopped. */
  phaseShiftTicks: 72,
  /** Walk speed while cloaked, per phase (px/s). */
  stalkSpeed: [80, 110, 140] as readonly number[],
  /** Gives up a stalk that has not reached the rear pocket and telegraphs anyway. */
  stalkMaxTicks: [200, 160, 130] as readonly number[],
  /** How far past the leading foot counts as a ledge, so a stalk does not walk off the gallery. */
  stalkProbe: 8,
  /** Pocket on the boss's side of the player. The 98 px lunge alone stops short of someone standing here. */
  rearOffset: 280,
  /** Close enough to that pocket to start the telegraph. */
  rearSlack: 12,
  /**
   * During the telegraph the boss walks toward the player at this speed and
   * stops at `strikeRange`. 250 px/s × 48 ticks (the shortest telegraph) is
   * 100 px, which is exactly `rearOffset - strikeRange`.
   */
  approachSpeed: 250,
  /**
   * Centre distance where the approach holds. The 98 px lunge then finishes
   * 82 px away: inside the 108 px of half-bodies, so a player who stood still
   * is hit, and one who ran away during the tell is not.
   */
  strikeRange: 180,
  /** Decloak. Alpha ramps to solid while it closes. Per phase. */
  telegraphTicks: [72, 56, 48] as readonly number[],
  lungeSpeed: 420,
  /** 420 px/s × 28 ticks is 98 px: a short pounce, not a screen-wide charge. */
  lungeTicks: 28,
  /** Punish window, including the ticks the core spends dropping into reach. Per phase. */
  exposedTicks: [180, 160, 140] as readonly number[],
  /** Spine, above a standing shot. Chest-wide, not the whole torso. */
  weakPointRaised: { y: 128, h: 24, w: 64 },
  /**
   * Where the core rests during the punish: feet+26, 16 px tall, 64 px wide
   * and centred. A standing plasma (muzzle at 30, 6 px tall) crosses the
   * height; a shot through the flank misses the chest.
   */
  weakPoint: { y: 26, h: 16, w: 64 },
  /** Ticks for the core to travel from the spine down to `weakPoint`. */
  coreSettleTicks: 40,
  /** Core hits during the window deal this times the shot. Everything else deals 0. */
  weakPointMultiplier: 2,
  /** Cloak shimmer bounds. The low end is a hint, not a silhouette. */
  cloakedAlpha: 0.08,
  shimmerAlpha: 0.28,
  shimmerPeriod: 40,
  /** A print every this many cloaked steps. */
  footprintEvery: 16,
  footprintLife: 96,
  footprintCap: 5,
  hurtTicks: 8,
  deathTicks: 180,
} as const;

/**
 * Level 6 boss, Tikbalang-X. Not the scout. It runs between two anchors, fires
 * one straight shot, then warps: the afterimage stays and takes no damage, and
 * the body can be hurt only during the stumble, on the core. The run still
 * deals contact while the body is not shot-hittable. Same pattern each phase,
 * faster. Ticks at 120 Hz.
 */
export const TIKBALANG_X = {
  width: 96,
  height: 66,
  hp: 18,
  label: 'TIKBALANG-X',
  /**
   * Dormant until the player is standing on the roof, within this range.
   * The last roof runs from x 3648 to 4480.
   */
  engageRange: 720,
  /** Feet-to-feet. The roof is the fight; the platform a storey below is not. */
  sightHeight: 40,
  /** Hp where phases 2 and 3 begin. One nova on the core (3 × 2) crosses each. */
  phaseHp: [12, 6] as readonly number[],
  phaseShiftTicks: 72,
  /**
   * Feet x of the left landing. The 96 px body then starts at the roof edge, x 3648.
   */
  leftFeet: 3696,
  /**
   * The exit rect is a solid door at this x while the boss is alive. The right
   * landing is derived from it so the whole body sits left of the door.
   */
  doorX: 4416,
  /** Gap between the body's right edge and the door. A run that lands inside the door is blocked and never crosses back. */
  doorMargin: 16,
  /** doorX − doorMargin − width/2. Body covers x 4304–4400, 16 px clear of the door. */
  rightFeet: 4416 - 16 - 96 / 2,
  /** A timed jump clears the 96 px body: the sweep crosses a standing player inside the jump's airborne window. */
  runSpeed: [800, 880, 960] as readonly number[],
  /**
   * Face the next anchor before moving. Phase 3 is 24 ticks: a held jump
   * clears the 66 px body at tick 21, so the run starts after the jump is up.
   */
  runWindupTicks: [28, 22, 24] as readonly number[],
  shotWindupTicks: [36, 28, 22] as readonly number[],
  /** Hold the firing pose after the shot leaves, so the muzzle flash reads. */
  shotHoldTicks: 16,
  shotSpeed: 320,
  /**
   * Shot centre above the feet. The enemy shot is 10 px tall, so the box is
   * y+19..29. A 24 px crouch overlaps it by 5 px. Crouch is not a dodge.
   */
  muzzleY: 24,
  /** The stomp before the warp. The body has not moved yet. */
  warpWindupTicks: [48, 36, 28] as readonly number[],
  /** Ticks the decoy stays up after the body has moved. */
  warpTicks: 20,
  /** Long enough to land, then put three shots into the core, after a jump that opened the window. */
  exposedTicks: [220, 220, 220] as readonly number[],
  /** Chest band a standing plasma (muzzle 30, 6 px tall) and a nova both cross. */
  weakPoint: { y: 18, h: 24 },
  weakPointMultiplier: 2,
  afterimageAlpha: 0.45,
  hurtTicks: 8,
  deathTicks: 180,
} as const;

/**
 * Level 4 boss, Manananggal-7. One health bar, three phases. Phase 1 is the
 * whole body on the roof. Phase 2 plants the lower half on the balcony the
 * climb already passed (`perchDx`/`perchDy` from the spawn feet) and the flyer
 * does not stay dead. Phase 3 is the flyer alone. A hit cannot skip a phase:
 * damage stops on the current threshold until the shift.
 *
 * The perch offsets are Level 4's second balcony relative to a roof spawn at
 * (1280, 1408): (1000, 832). The anchor is the shaft the flyer returns to.
 */
export const MANANANGGAL = {
  width: 64,
  height: 112,
  flyerHeight: 72,
  baseWidth: 48,
  baseHeight: 64,
  hp: 24,
  /** Hp at which phases 2 and 3 begin. The bar cannot fall through one of these until that phase's shift. */
  phaseHp: [16, 8] as readonly number[],
  engageRange: 420,
  /** Feet within this of the roof. The rung 64 px below the roof does not wake it. */
  storeyBand: 40,
  /** Still on the perch before the first tell, and between sweeps. */
  idleTicks: 24,
  windupTicks: 48,
  /**
   * Last ticks of the sweep tell. Pose `commit` (the shoot clip) so render and
   * audio can mark the jump. A jump on the first wind-up frame lands in the
   * sweep; a jump as this beat starts clears the 44 px body.
   */
  commitTicks: 12,
  /** Same speed family as the ASWANG rush, so a jump 0.2 s before contact clears it. */
  sweepSpeed: 420,
  /** Low enough that a full jump's feet clear it. Standing in the path does not. */
  sweepHeight: 44,
  sweepMaxTicks: 80,
  exposedTicks: 140,
  /** In the standing plasma line (muzzle at 30, shot 6 px tall). */
  core: { y: 24, h: 16, w: 40 },
  coreMultiplier: 2,
  phaseShiftTicks: 72,
  /** Planted half, feet, relative to the spawn feet. Far enough right that a shot from the balcony's left edge is jumpable. */
  perchDx: -280,
  perchDy: -576,
  /**
   * Shaft hover the flyer returns to, feet, relative to the spawn feet.
   * Left of the balcony and the hanging column, so the climb back up is open air.
   */
  anchorDx: -560,
  anchorDy: -408,
  /** First hover after the split: long enough to drop back to the perch before the dive. */
  openingHoverTicks: 640,
  hoverTicks: 30,
  diveWindupTicks: 56,
  diveSpeed: 420,
  diveHeight: 36,
  /**
   * Safety cap, not the dive's length. The dive ends once it has passed the
   * locked target by `divePast`. 420 px/s for 320 ticks is 1120 px, so from the
   * shaft (body x 688) the right edge clears the roof lip at 1600 with margin.
   */
  diveTicks: 320,
  /** How far past the locked player x the dive travels before it ends. */
  divePast: 56,
  returnSpeed: 360,
  returnMaxTicks: 100,
  baseTellTicks: 48,
  baseShotSpeed: 240,
  baseMuzzleY: 28,
  punishTicks: 170,
  /** Conduit on the planted half, also in the standing plasma line. */
  conduit: { y: 22, h: 16, w: 48 },
  hurtTicks: 8,
  deathTicks: 160,
  /** Wing shadow swept across the first shaft while the fight has not started. */
  shadowX0: 640,
  shadowX1: 1040,
  shadowY: 220,
  shadowW: 96,
  shadowH: 28,
  shadowPeriod: 200,
  /** Dropped-cable mark on the perch, shown before the half is planted. */
  perchMarkH: 6,
} as const;

/**
 * Camera, in sim pixels and ticks. The view size is the design viewport at the
 * gameplay plane (16:9 at 32 px per stage unit with the Phase 0 camera); the
 * renderer may show slightly more or less at other aspect ratios.
 */
export const CAMERA = {
  viewW: 672,
  viewH: 378,
  /** Camera centre sits this far above the player's feet when settled. */
  focusAboveFeet: 96,
  /** Extra horizontal target offset in the facing direction while running. */
  lookAhead: 64,
  /** Look-ahead eases in at this fraction of the remaining distance per tick. */
  lookAheadEase: 0.04,
  /** Half-widths of the box the target may roam in before the camera moves. */
  deadzoneX: 24,
  deadzoneY: 32,
  /** While airborne the camera does not follow upward until the target is this far above centre. */
  airDeadzoneUp: 120,
  /** Fraction of the remaining distance covered per tick; fixed so replays are exact. */
  followX: 0.12,
  followY: 0.1,
  /** Shake: initial amplitude decays linearly to zero over `ticks`. */
  hurtShake: { amplitude: 6, ticks: 18 },
  deathShake: { amplitude: 10, ticks: 30 },
} as const;
