import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@them/i18n';
import { GameSession } from './game/session';
import { CampScreen } from './ui/camp/CampScreen';
import { GameScreen } from './ui/GameScreen';
import { MenuScreen } from './ui/MenuScreen';
import { SettingsPage } from './ui/PauseScreen';

/** Seed from the URL (?seed=123) for reproducible play/e2e; otherwise from the clock (app layer only). */
function initialSeed(): number {
  const s = new URLSearchParams(window.location.search).get('seed');
  return s !== null && /^\d+$/.test(s) ? Number(s) >>> 0 : (Date.now() >>> 0);
}

/** menu → run (prep ⇄ wave, draft, pause) → results → menu. Settings opens from the menu or from pause. */
export function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [settings, setSettings] = useState(false);
  const [camp, setCamp] = useState(false);

  return (
    <I18nextProvider i18n={i18n}>
      <div className="relative h-full w-full overflow-hidden">
        {session ? (
          <GameScreen session={session} onQuit={() => setSession(null)} />
        ) : settings ? (
          <SettingsPage onBack={() => setSettings(false)} />
        ) : camp ? (
          <CampScreen onBack={() => setCamp(false)} />
        ) : (
          <MenuScreen onStart={() => setSession(new GameSession(initialSeed()))} onSettings={() => setSettings(true)} onCamp={() => setCamp(true)} />
        )}
      </div>
    </I18nextProvider>
  );
}
