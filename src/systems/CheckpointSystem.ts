export class CheckpointSystem {
  private lastCheckpoint: { x: number; y: number } | null = null;

  activate(x: number, y: number) {
    this.lastCheckpoint = { x, y };
  }

  getSpawnPoint(levelStartX: number, levelStartY: number): { x: number; y: number } {
    return this.lastCheckpoint ?? { x: levelStartX, y: levelStartY };
  }

  reset() {
    this.lastCheckpoint = null;
  }
}
