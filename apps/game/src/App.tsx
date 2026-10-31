import { useEffect, useRef, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@them/i18n';
import { createGame } from './game/createGame';
import { GameSession } from './game/session';
import { useHud } from './game/store';
import { DebugHud } from './ui/DebugHud';
import { Joystick } from './ui/Joystick';

/** Seed from the URL (?seed=123) for reproducible play/e2e; otherwise from the clock (app layer only). */
function initialSeed(): number {
  const s = new URLSearchParams(window.location.search).get('seed');
  return s !== null && /^\d+$/.test(s) ? Number(s) >>> 0 : (Date.now() >>> 0);
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const [session] = useState(() => new GameSession(initialSeed()));
  const blocked = useHud(session.hud, (s) => s.paused || s.draft !== null || s.phase === 'ended');

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

  return (
    <I18nextProvider i18n={i18n}>
      <div className="relative h-full w-full overflow-hidden">
        <div ref={host} className="absolute inset-0 z-stage" data-testid="stage" />
        <div className="pointer-events-none absolute inset-0" data-testid="overlay">
          <Joystick input={session.input} enabled={!blocked} />
          <DebugHud session={session} />
        </div>
      </div>
    </I18nextProvider>
  );
}
