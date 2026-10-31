import Phaser from 'phaser';
import { tokens } from '@them/ui-tokens';
import type { GameSession } from './session';
import { StageScene } from './StageScene';

/** Boot Phaser into `parent` and start the stage scene for `session`. */
export function createGame(parent: HTMLElement, session: GameSession): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: tokens.color.stage.ground,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 1280, height: parent.clientHeight || 720 },
    fps: { target: 60 },
    input: { activePointers: 3 },
    banner: false,
  });
  game.scene.add('stage', StageScene, true, { session });
  return game;
}
