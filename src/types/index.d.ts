export interface GameSceneData {
  level?: number;
}

export interface UISceneData {
  gameScene: Phaser.Scene;
}

export interface PlayerState {
  health: number;
  maxHealth: number;
  score: number;
}
