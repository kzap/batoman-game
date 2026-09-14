/**
 * Hit points with invulnerability frames. Shared by the player and, later,
 * enemies. Ticks, not seconds, so replays stay exact.
 */
export class Health {
  hp: number;
  /** Ticks of invulnerability left after a hit. */
  invuln = 0;

  constructor(
    readonly max: number,
    readonly invulnTicks: number,
  ) {
    this.hp = max;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get invulnerable(): boolean {
    return this.invuln > 0;
  }

  tick(): void {
    if (this.invuln > 0) this.invuln--;
  }

  /** Apply damage unless invulnerable. Returns true when it landed. */
  hit(damage: number): boolean {
    if (!this.alive || this.invulnerable || damage <= 0) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.invuln = this.invulnTicks;
    return true;
  }

  /** Instant death ignores i-frames (pits, crushers). */
  kill(): void {
    this.hp = 0;
    this.invuln = 0;
  }

  reset(): void {
    this.hp = this.max;
    this.invuln = 0;
  }
}
