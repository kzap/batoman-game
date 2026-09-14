import type { WorldSnapshot } from '@game/world';

export interface FrameStats {
  frameMs: number;
  droppedFrames: number;
  entities: number;
}

/**
 * Backtick-toggled overlay: tick rate, frame time, entity count, player and
 * camera state, from the current snapshot. Plain DOM text in `#debug`.
 */
export class DebugOverlay {
  private readonly el: HTMLElement;
  private visible = false;
  private framesSinceSample = 0;
  private lastTick = 0;
  private lastSampleAt = -1;
  private ticksPerSecond = 0;
  private fps = 0;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Backquote') this.toggle();
  };

  constructor(el: HTMLElement) {
    this.el = el;
  }

  attach(): void {
    window.addEventListener('keydown', this.onKey);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKey);
  }

  get enabled(): boolean {
    return this.visible;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
    this.onToggle?.(this.visible);
  }

  onToggle: ((on: boolean) => void) | null = null;

  /** Call once per rendered frame. `now` is performance.now() in ms. */
  update(now: number, snap: WorldSnapshot, stats: FrameStats): void {
    if (this.lastSampleAt < 0) {
      this.lastSampleAt = now;
      this.lastTick = snap.tick;
    }
    this.framesSinceSample++;
    if (now - this.lastSampleAt >= 500) {
      const dt = (now - this.lastSampleAt) / 1000;
      this.fps = this.framesSinceSample / dt;
      this.ticksPerSecond = (snap.tick - this.lastTick) / dt;
      this.framesSinceSample = 0;
      this.lastTick = snap.tick;
      this.lastSampleAt = now;
    }
    if (!this.visible) return;
    const p = snap.player;
    const c = snap.camera;
    this.el.textContent = [
      `fps ${this.fps.toFixed(0)}  ticks/s ${this.ticksPerSecond.toFixed(0)}  frame ${stats.frameMs.toFixed(1)} ms  dropped ${stats.droppedFrames}`,
      `tick ${snap.tick}  entities ${stats.entities}  status ${snap.status}  lives ${snap.lives}`,
      `player ${p.x.toFixed(1)}, ${p.y.toFixed(1)}  ${p.w}x${p.h}  ${p.pose}  facing ${p.facing > 0 ? 'R' : 'L'}  hp ${p.hp}${p.invulnerable ? '  inv' : ''}`,
      `camera ${c.x.toFixed(1)}, ${c.y.toFixed(1)}  shake ${c.shakeX.toFixed(1)}, ${c.shakeY.toFixed(1)}`,
    ].join('\n');
  }
}
