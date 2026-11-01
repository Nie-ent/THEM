/**
 * Floating virtual joystick (readability §9): appears where the thumb lands in the lower 45% of
 * the screen, base 128 px, knob 56 px, dead zone 12%. Touch only; mouse uses the keyboard.
 *
 * The zone sits over the stage, so it only takes pointer events while the player is using touch.
 * Otherwise it is click-through: with a mouse it would swallow every click in the lower 45% of the
 * screen, e.g. placing a building below the Core on desktop.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { tokens } from '@them/ui-tokens';
import { JOYSTICK_SIZES, useSettings } from './settings';
import type { InputState } from '../game/input';

const KNOB = 56;
const DEAD = 0.12;

/** A press that barely moves and ends fast is a tap: forwarded to `onTap` (mobile build slot picking). */
const TAP_MOVE = 10;
const TAP_MS = 400;

/**
 * True while touch is the active input: from the start on touch-first devices (no hover), then
 * switched by the type of each press, so a touch laptop works with both finger and mouse.
 */
function useTouchInput(): boolean {
  const [touch, setTouch] = useState(() => {
    try {
      return window.matchMedia('(hover: none)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const onDown = (e: globalThis.PointerEvent) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') setTouch(true);
      else if (e.pointerType === 'mouse') setTouch(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);
  return touch;
}

export function Joystick({ input, enabled, onTap }: { input: InputState; enabled: boolean; onTap?: (x: number, y: number) => void }) {
  const settings = useSettings();
  const touch = useTouchInput();
  const BASE = JOYSTICK_SIZES[settings.joystickSize];
  const tapStart = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  const [stick, setStick] = useState<{ x: number; y: number; kx: number; ky: number } | null>(null);
  const pid = useRef<number | null>(null);

  const update = (cx: number, cy: number, px: number, py: number) => {
    const max = BASE / 2;
    let dx = px - cx, dy = py - cy;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    const m = Math.min(1, len / max);
    if (m < DEAD) { input.stickX = 0; input.stickY = 0; }
    else { const s = (m - DEAD) / (1 - DEAD) / (len || 1); input.stickX = (px - cx) * s; input.stickY = (py - cy) * s; }
    const l2 = Math.hypot(input.stickX, input.stickY);
    if (l2 > 1) { input.stickX /= l2; input.stickY /= l2; }
    setStick({ x: cx, y: cy, kx: dx, ky: dy });
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    tapStart.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    if (e.pointerType === 'mouse' || pid.current !== null) return;
    pid.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    input.stickActive = true;
    update(e.clientX, e.clientY, e.clientX, e.clientY);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pid.current || !stick) return;
    update(stick.x, stick.y, e.clientX, e.clientY);
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const t = tapStart.current;
    if (t && t.id === e.pointerId) {
      tapStart.current = null;
      if (onTap && Math.hypot(e.clientX - t.x, e.clientY - t.y) < TAP_MOVE && performance.now() - t.t < TAP_MS) onTap(e.clientX, e.clientY);
    }
    if (e.pointerId !== pid.current) return;
    pid.current = null;
    input.stickActive = false;
    input.stickX = input.stickY = 0;
    setStick(null);
  };

  return (
    <div
      data-testid="joystick-zone"
      className={`absolute bottom-0 h-[45%] touch-none ${settings.joystickSide === 'left' ? 'left-0 w-1/2' : settings.joystickSide === 'right' ? 'right-0 w-1/2' : 'inset-x-0'}`}
      style={{ zIndex: tokens.z.joystick, pointerEvents: enabled && touch ? 'auto' : 'none' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {stick && (
        <div
          data-testid="joystick"
          className="pointer-events-none fixed rounded-full border-2 border-border-strong bg-hud-plate"
          style={{ left: stick.x - BASE / 2, top: stick.y - BASE / 2, width: BASE, height: BASE }}
        >
          <div
            className="absolute rounded-full bg-text-muted"
            style={{ width: KNOB, height: KNOB, left: BASE / 2 - KNOB / 2 + stick.kx, top: BASE / 2 - KNOB / 2 + stick.ky }}
          />
        </div>
      )}
    </div>
  );
}
