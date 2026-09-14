/**
 * Movement and combat tuning. Units: pixels, seconds, and sim ticks (120 Hz).
 * One object so the whole feel can be diffed in a PR; the renderer never reads
 * these. Numbers are for a 24 x 48 player against 32 px tiles.
 */
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
