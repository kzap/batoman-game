import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

(window as any).game = new Phaser.Game(gameConfig);
