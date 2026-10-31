/**
 * Typed event bridge: sim events (drained once per step by the session) fan out to any listener —
 * React screens, the Phaser scene (VFX), audio. Listeners get the narrowed event type.
 *
 *   const off = bridge.on('levelUp', (ev) => ev.level);
 */
import type { SimEvent, SimEventType } from '@them/core';

export type EventOf<T extends SimEventType> = Extract<SimEvent, { type: T }>;
type Listener<T extends SimEventType> = (ev: EventOf<T>) => void;
type AnyListener = (ev: SimEvent) => void;

export class EventBridge {
  private readonly listeners = new Map<SimEventType, Set<AnyListener>>();
  private readonly any = new Set<AnyListener>();

  on<T extends SimEventType>(type: T, fn: Listener<T>): () => void {
    let set = this.listeners.get(type);
    if (!set) { set = new Set(); this.listeners.set(type, set); }
    set.add(fn as AnyListener);
    return () => { set.delete(fn as AnyListener); };
  }

  onAny(fn: AnyListener): () => void {
    this.any.add(fn);
    return () => { this.any.delete(fn); };
  }

  emit(ev: SimEvent): void {
    const set = this.listeners.get(ev.type);
    if (set) for (const fn of set) fn(ev);
    for (const fn of this.any) fn(ev);
  }

  clear(): void {
    this.listeners.clear();
    this.any.clear();
  }
}
