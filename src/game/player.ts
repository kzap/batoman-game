import { approach } from '@core/math/vec2';
import { SIM_DT } from '@core/sim/clock';
import { Body, type CollisionWorld } from '@core/sim/collision';
import { inputAxis, type InputEdges } from '@core/sim/input';
import { PLAYER } from './tuning';

export type PlayerPose = 'idle' | 'run' | 'jump' | 'fall' | 'wallslide' | 'dash' | 'crouch' | 'slide' | 'hurt' | 'dead';

/** What the player did this tick that other systems care about. */
export interface PlayerActions {
  jumped: boolean;
  wallJumped: boolean;
  dashed: boolean;
  landed: boolean;
  fired: boolean;
}

/**
 * Player movement controller. Owns the body and velocity; the World feeds it
 * input and the collision world once per tick and reads its pose for the
 * snapshot. All timers are in ticks so behaviour is identical under replay.
 */
export class Player {
  readonly body: Body;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;

  grounded = false;
  /** -1/1 when touching a wall on that side while airborne. */
  wallDir: -1 | 0 | 1 = 0;
  crouching = false;
  sliding = false;

  private coyote = 0;
  private jumpBuffer = 0;
  private jumpHeld = false;
  /** Set when a jump was released early; gravity is stronger until the next landing or jump. */
  private jumpCut = false;
  private wallCoyote = 0;
  private wallCoyoteDir: -1 | 1 = 1;
  private wallLock = 0;
  private dashTicks = 0;
  private dashDir: -1 | 1 = 1;
  private dashCooldown = 0;
  private canDash = true;
  private fireCooldown = 0;
  /** Ticks the shooting pose is still shown after a shot. Presentation only; never gates input. */
  private shootTicks = 0;
  /** Ticks left of falling through a one-way platform after down + jump. */
  private dropTicks = 0;

  /** Set by the World's damage system; blocks input while positive. */
  hurtStun = 0;
  dead = false;

  constructor(x: number, y: number) {
    this.body = new Body(x, y, PLAYER.width, PLAYER.height);
  }

  get dashing(): boolean {
    return this.dashTicks > 0;
  }

  /** Dash grants i-frames; the health system also adds its own after a hit. */
  get invulnerable(): boolean {
    return this.dashing;
  }

  /** True briefly after each shot so the renderer can show the firing arm. */
  get shooting(): boolean {
    return this.shootTicks > 0;
  }

  get pose(): PlayerPose {
    if (this.dead) return 'dead';
    if (this.hurtStun > 0) return 'hurt';
    if (this.dashing) return 'dash';
    if (this.wallDir !== 0 && !this.grounded && this.vy < 0) return 'wallslide';
    if (this.grounded) {
      if (this.sliding) return 'slide';
      if (this.crouching) return 'crouch';
      return Math.abs(this.vx) > PLAYER.stillSpeed ? 'run' : 'idle';
    }
    return this.vy > 0 ? 'jump' : 'fall';
  }

  /** Death freezes the body; the World decides when to `respawn`. */
  kill(): void {
    this.dead = true;
    this.vx = 0;
    this.vy = 0;
    this.dashTicks = 0;
  }

  /** Fresh state at a checkpoint: every timer and flag cleared, standing, facing right. */
  respawn(x: number, y: number): void {
    this.body.h = PLAYER.height;
    this.body.place(x, y);
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.grounded = false;
    this.wallDir = 0;
    this.crouching = false;
    this.sliding = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpHeld = false;
    this.jumpCut = false;
    this.wallCoyote = 0;
    this.wallLock = 0;
    this.dashTicks = 0;
    this.dashCooldown = 0;
    this.canDash = true;
    this.fireCooldown = 0;
    this.shootTicks = 0;
    this.dropTicks = 0;
    this.hurtStun = 0;
    this.dead = false;
  }

  /** Knockback from a hit; direction is away from the source (-1 left, 1 right). Stays crouched under a ledge. */
  knockback(dir: -1 | 1, cw: CollisionWorld): void {
    this.vx = dir * PLAYER.knockbackX;
    this.vy = PLAYER.knockbackY;
    this.hurtStun = PLAYER.hurtStunTicks;
    this.dashTicks = 0;
    if (this.hasHeadroom(cw)) this.standUp();
  }

  update(input: InputEdges, cw: CollisionWorld): PlayerActions {
    const actions: PlayerActions = { jumped: false, wallJumped: false, dashed: false, landed: false, fired: false };
    if (this.dead) return actions;
    const dt = SIM_DT;
    const b = this.body;

    // Timers.
    if (this.coyote > 0) this.coyote--;
    if (this.jumpBuffer > 0) this.jumpBuffer--;
    if (this.wallCoyote > 0) this.wallCoyote--;
    if (this.wallLock > 0) this.wallLock--;
    if (this.dashCooldown > 0) this.dashCooldown--;
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.shootTicks > 0) this.shootTicks--;
    if (this.hurtStun > 0) this.hurtStun--;

    // Sense the surroundings before deciding anything.
    const wasGrounded = this.grounded;
    this.grounded = this.vy <= 0 && cw.groundUnder(b) !== null;
    if (this.grounded) {
      this.coyote = PLAYER.coyoteTicks;
      this.canDash = true;
      this.jumpCut = false;
      if (!wasGrounded) actions.landed = true;
    }
    const controllable = this.hurtStun === 0;
    const axis = controllable ? inputAxis(input.frame) : 0;
    const leftWall = cw.wallBeside(b, -1) !== null;
    const rightWall = cw.wallBeside(b, 1) !== null;
    this.wallDir = !this.grounded && ((axis < 0 && leftWall) || (axis > 0 && rightWall)) ? (axis as -1 | 1) : 0;
    if (this.wallDir !== 0) {
      this.wallCoyote = PLAYER.wallCoyoteTicks;
      this.wallCoyoteDir = this.wallDir;
    }

    if (controllable && input.pressed('jump')) this.jumpBuffer = PLAYER.jumpBufferTicks;
    if (controllable && axis !== 0 && !this.dashing) this.facing = axis as 1 | -1;

    // Dash: fixed speed, no gravity, cancels everything else.
    if (controllable && input.pressed('dash') && this.canDash && this.dashCooldown === 0 && !this.dashing && this.hasHeadroom(cw)) {
      this.dashTicks = PLAYER.dashTicks;
      this.dashDir = axis !== 0 ? (axis as 1 | -1) : this.facing;
      this.facing = this.dashDir;
      this.canDash = false;
      this.standUp();
      actions.dashed = true;
    }
    if (this.dashing) {
      this.dashTicks--;
      this.vx = this.dashDir * PLAYER.dashSpeed;
      this.vy = 0;
      if (this.dashTicks === 0) {
        this.dashCooldown = PLAYER.dashCooldownTicks;
        this.vx = this.dashDir * PLAYER.dashEndSpeed;
      }
    } else {
      this.updateCrouch(input.frame.down && controllable, cw);
      this.updateHorizontal(axis, dt);
      this.updateJump(input, cw, actions);
      this.applyGravity(input.held('jump') && controllable, dt);
    }

    // Fire on press, not on hold; cooldown limits the rate.
    if (controllable && input.pressed('fire') && this.fireCooldown === 0 && !this.sliding) {
      this.fireCooldown = PLAYER.fireCooldownTicks;
      this.shootTicks = PLAYER.shootPoseTicks;
      actions.fired = true;
    }

    // Integrate. Collisions zero the velocity on that axis.
    const hitWall = cw.moveX(b, this.vx * dt, () => (this.vx = 0));
    if (hitWall && this.dashing) this.dashTicks = 1; // end the dash next tick
    // Pushing into a wall at sub-pixel speed never triggers a move; report it as stopped anyway.
    if (this.vx !== 0 && cw.wallBeside(b, this.vx > 0 ? 1 : -1) !== null) this.vx = 0;
    if (this.dropTicks > 0) this.dropTicks--;
    cw.moveY(b, this.vy * dt, () => (this.vy = 0), {
      ceilingCorrection: PLAYER.ceilingCorrection,
      ignoreOneWay: this.dropTicks > 0,
    });
    return actions;
  }

  private updateCrouch(down: boolean, cw: CollisionWorld): void {
    const b = this.body;
    if (this.grounded && down) {
      if (!this.crouching) {
        this.crouching = true;
        b.h = PLAYER.crouchHeight;
        this.sliding = Math.abs(this.vx) >= PLAYER.slideMinSpeed;
      }
    } else if (this.crouching && this.hasHeadroom(cw)) {
      // Otherwise stay crouched under the ledge until there is room to stand.
      this.standUp();
    }
    if (this.sliding && Math.abs(this.vx) < PLAYER.stillSpeed) this.sliding = false;
  }

  private hasHeadroom(cw: CollisionWorld): boolean {
    const b = this.body;
    return cw.solidAt({ x: b.x, y: b.y, w: b.w, h: PLAYER.height }) === null;
  }

  private standUp(): void {
    this.crouching = false;
    this.sliding = false;
    this.body.h = PLAYER.height;
  }

  private updateHorizontal(axis: number, dt: number): void {
    const target = axis * PLAYER.runSpeed;
    if (this.sliding) {
      this.vx = approach(this.vx, 0, PLAYER.slideDecel * dt);
      return;
    }
    if (this.crouching) {
      this.vx = approach(this.vx, axis * PLAYER.crouchSpeed, PLAYER.groundDecel * dt);
      return;
    }
    if (this.wallLock > 0) {
      // Keep the kick's momentum; only bleed overspeed.
      if (Math.abs(this.vx) > PLAYER.runSpeed) this.vx = approach(this.vx, Math.sign(this.vx) * PLAYER.runSpeed, PLAYER.overspeedDecel * dt);
      return;
    }
    if (Math.abs(this.vx) > PLAYER.runSpeed && Math.sign(this.vx) === Math.sign(target)) {
      this.vx = approach(this.vx, target, PLAYER.overspeedDecel * dt);
      return;
    }
    const accel = this.grounded ? (axis === 0 ? PLAYER.groundDecel : PLAYER.groundAccel) : axis === 0 ? PLAYER.airDecel : PLAYER.airAccel;
    this.vx = approach(this.vx, target, accel * dt);
  }

  private updateJump(input: InputEdges, cw: CollisionWorld, actions: PlayerActions): void {
    const wantsJump = this.jumpBuffer > 0;
    if (wantsJump && this.grounded && input.frame.down && cw.groundUnder(this.body)?.oneWay) {
      // Down + jump on a one-way platform drops through it instead of jumping.
      this.dropTicks = PLAYER.dropThroughTicks;
      this.vy = -PLAYER.dropThroughSpeed;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      return;
    }
    if (wantsJump && this.coyote > 0 && (!this.crouching || this.hasHeadroom(cw))) {
      this.vy = PLAYER.jumpSpeed;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumpHeld = true;
      this.jumpCut = false;
      this.standUp();
      actions.jumped = true;
    } else if (wantsJump && this.wallCoyote > 0 && !this.grounded) {
      const away = -this.wallCoyoteDir as 1 | -1;
      this.vx = away * PLAYER.wallJumpX;
      this.vy = PLAYER.wallJumpY;
      this.facing = away;
      this.wallLock = PLAYER.wallJumpLockTicks;
      this.wallCoyote = 0;
      this.jumpBuffer = 0;
      this.jumpHeld = true;
      this.jumpCut = false;
      this.canDash = true;
      actions.wallJumped = true;
      actions.jumped = true;
    }
    // Variable height: releasing early cuts the rise short.
    if (this.jumpHeld && input.released('jump') && this.vy > PLAYER.jumpReleaseSpeed) {
      this.vy = PLAYER.jumpReleaseSpeed;
      this.jumpCut = true;
    }
    if (!input.held('jump')) this.jumpHeld = false;
  }

  private applyGravity(jumpHeld: boolean, dt: number): void {
    if (this.grounded && this.vy <= 0) {
      this.vy = 0;
      return;
    }
    let g = PLAYER.gravity;
    if (this.vy > 0 && this.vy < PLAYER.apexThreshold && jumpHeld) g *= PLAYER.apexGravityScale;
    else if (this.vy > 0 && this.jumpCut) g *= PLAYER.fastFallScale;
    this.vy -= g * dt;
    if (this.wallDir !== 0 && this.vy < -PLAYER.wallSlideSpeed) this.vy = -PLAYER.wallSlideSpeed;
    if (this.vy < -PLAYER.maxFall) this.vy = -PLAYER.maxFall;
  }
}
