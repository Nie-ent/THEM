/**
 * Merges movement sources (keyboard, virtual joystick) into one analog vector, and queues
 * one-shot commands (build, card pick, pause …) so each is delivered to exactly one sim step.
 */
import type { InputFrame } from '@them/core';

export type Command = Omit<InputFrame, 'moveX' | 'moveY'>;

export class InputState {
  /** Keyboard axis, each component -1..1. */
  keyX = 0;
  keyY = 0;
  /** Joystick vector, magnitude 0..1 after dead zone. */
  stickX = 0;
  stickY = 0;
  stickActive = false;
  private readonly queue: Command[] = [];

  move(): { x: number; y: number } {
    if (this.stickActive) return { x: this.stickX, y: this.stickY };
    const len = Math.hypot(this.keyX, this.keyY);
    return len > 1 ? { x: this.keyX / len, y: this.keyY / len } : { x: this.keyX, y: this.keyY };
  }

  push(cmd: Command): void {
    this.queue.push(cmd);
  }

  /** Next one-shot command for this step, if any. */
  take(): Command | undefined {
    return this.queue.shift();
  }

  clear(): void {
    this.queue.length = 0;
    this.keyX = this.keyY = this.stickX = this.stickY = 0;
    this.stickActive = false;
  }
}
