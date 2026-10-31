/** Hosts one run: Phaser stage, joystick and every in-run screen layer. */
import { useEffect, useRef, useState } from 'react';
import type { GameSession } from '../game/session';
import { createGame } from '../game/createGame';
import { useHud } from '../game/store';
import { DraftScreen } from './DraftScreen';
import { Hud } from './Hud';
import { Joystick } from './Joystick';
import { PauseScreen, usePauseFlow } from './PauseScreen';
import { PrepScreen } from './PrepScreen';
import { ResultsScreen } from './ResultsScreen';

export function GameScreen({ session, onQuit }: { session: GameSession; onQuit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [topSlot, setTopSlot] = useState<HTMLElement | null>(null);
  const phase = useHud(session.hud, (s) => s.phase);
  const drafting = useHud(session.hud, (s) => s.draft !== null);
  const blocked = useHud(session.hud, (s) => s.paused || s.draft !== null || s.phase === 'ended');
  const level = useHud(session.hud, (s) => s.level);
  const flow = usePauseFlow(session, onQuit);
  const flowRef = useRef(flow);
  useEffect(() => { flowRef.current = flow; });

  useEffect(() => {
    if (!host.current) return;
    const game = createGame(host.current, session);
    // Exposed for e2e and the QA balance bot (read-only use).
    (window as unknown as { __them?: unknown }).__them = { session, game };
    return () => {
      game.destroy(true);
      delete (window as unknown as { __them?: unknown }).__them;
    };
  }, [session]);

  // React owns Esc / P (captured before Phaser sees them): close the topmost layer, else pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'p' && e.key !== 'P') return;
      e.stopPropagation();
      if (e.repeat || session.hud.get().phase === 'ended') return;
      const f = flowRef.current;
      if (session.hud.get().paused) { f.back(); return; }
      if (e.key === 'Escape' && session.hud.get().selectedBuilding !== null) { session.selectBuilding(null); return; }
      session.command({ pause: true });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [session]);

  // Losing the window mid-wave pauses the run.
  useEffect(() => {
    const auto = () => {
      const s = session.hud.get();
      if (s.phase === 'wave' && !s.paused) session.command({ pause: true });
    };
    const onVis = () => { if (document.hidden) auto(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', auto);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', auto); };
  }, [session]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={host} className="absolute inset-0 z-stage" data-testid="stage" />
      <div className="pointer-events-none absolute inset-0" data-testid="overlay">
        <Joystick input={session.input} enabled={!blocked} onTap={(x, y) => session.tapAt(x, y)} />
        <Hud session={session} slotRef={setTopSlot} />
        {phase === 'prep' && <PrepScreen session={session} topSlot={topSlot} />}
        {drafting && <DraftScreen key={level} session={session} />}
        {phase === 'ended' && <ResultsScreen session={session} onMenu={onQuit} />}
        {phase !== 'ended' && <PauseScreen session={session} flow={flow} />}
      </div>
    </div>
  );
}
