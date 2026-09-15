import type { EnemyType } from '@content/level';

/** Points per kill, and the bonus for reaching the exit. Presentation-side: the sim knows nothing about score. */
export const SCORE = {
  kill: { patroller: 100, drone: 150, stealth: 200, tikbalang: 500, aswang: 1000 } satisfies Record<EnemyType, number>,
  levelClear: 500,
  /** Per heart still full at the exit. */
  perHeart: 100,
  digits: 6,
} as const;

export const killPoints = (type: EnemyType): number => SCORE.kill[type];

export const clearPoints = (hp: number): number => SCORE.levelClear + hp * SCORE.perHeart;

/** Zero-padded for the HUD (PRD: six digits). */
export const formatScore = (n: number): string => String(Math.min(n, 10 ** SCORE.digits - 1)).padStart(SCORE.digits, '0');
