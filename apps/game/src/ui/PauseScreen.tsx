/** Pause + settings (docs/design/screens/pause-settings.md). Settings apply immediately and persist. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { currentLocale, type Locale } from '@them/i18n';
import type { GameSession } from '../game/session';
import { useHud } from '../game/store';
import { Button, ConfirmDialog, Segmented, mmss, useDesktop, useFmt, useFocusTrap } from './kit';
import { applyLocale } from './lang';
import { updateSettings, useSettings, type Settings } from './settings';

export type Layer = 'actions' | 'settings' | 'confirm-restart' | 'confirm-quit';

/** Pause UI state lives with the screen host so Esc can close "the topmost layer only". */
export function usePauseFlow(session: GameSession, onQuit: () => void) {
  const paused = useHud(session.hud, (s) => s.paused);
  const [layer, setLayer] = useState<Layer>('actions');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [prevPaused, setPrevPaused] = useState(paused);
  if (prevPaused !== paused) {
    setPrevPaused(paused);
    setLayer('actions');
    setCountdown(null);
  }

  useEffect(() => {
    if (countdown === null) return;
    const id = window.setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        if (session.hud.get().paused) session.command({ pause: true });
      } else setCountdown(countdown - 1);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [countdown, session]);

  const startResume = () => setCountdown(3);
  /** Esc / P while paused. */
  const back = () => {
    if (countdown !== null) setCountdown(null);
    else if (layer !== 'actions') setLayer('actions');
    else startResume();
  };
  const confirm = () => {
    if (layer === 'confirm-restart') { session.restart(); } else onQuit();
  };
  return { paused, layer, setLayer, countdown, startResume, back, confirm };
}
export type PauseFlow = ReturnType<typeof usePauseFlow>;

/* ---------------------------------------------------------------------------------------- */
/* Settings                                                                                 */
/* ---------------------------------------------------------------------------------------- */

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-2">
      <span className="min-w-0 text-md leading-ui">{label}</span>
      <div className="ml-auto max-w-full overflow-x-auto">{children}</div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="pb-1 pt-4 font-display text-lg font-semibold leading-display text-text-muted">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsPanel() {
  const { t } = useTranslation();
  const s = useSettings();
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => updateSettings({ [k]: v } as Partial<Settings>);
  const onOff = [{ value: 'on', label: t('ui.settings.on') }, { value: 'off', label: t('ui.settings.off') }];
  return (
    <div className="flex flex-col pb-4">
      <Group title={t('ui.settings.groupLanguage')}>
        <SettingRow label={t('ui.settings.language')}>
          <Segmented<Locale>
            testid="setting-language"
            label={t('ui.settings.language')}
            value={currentLocale()}
            onChange={(l) => void applyLocale(l)}
            options={[{ value: 'th', label: t('ui.menu.langTh') }, { value: 'en', label: t('ui.menu.langEn') }]}
          />
        </SettingRow>
      </Group>
      <Group title={t('ui.settings.groupDisplay')}>
        <SettingRow label={t('ui.settings.damageNumbers')}>
          <Segmented<Settings['damageNumbers']> testid="setting-damageNumbers" label={t('ui.settings.damageNumbers')} value={s.damageNumbers} onChange={set('damageNumbers')}
            options={[{ value: 'all', label: t('ui.settings.damageAll') }, { value: 'important', label: t('ui.settings.damageImportant') }, { value: 'off', label: t('ui.settings.damageOff') }]} />
        </SettingRow>
        <SettingRow label={t('ui.settings.screenShake')}>
          <Segmented<'on' | 'off'> testid="setting-screenShake" label={t('ui.settings.screenShake')} value={s.screenShake ? 'on' : 'off'} onChange={(v) => updateSettings({ screenShake: v === 'on' })} options={onOff as { value: 'on' | 'off'; label: string }[]} />
        </SettingRow>
        <SettingRow label={t('ui.settings.reduceMotion')}>
          <Segmented<Settings['reduceMotion']> testid="setting-reduceMotion" label={t('ui.settings.reduceMotion')} value={s.reduceMotion} onChange={set('reduceMotion')}
            options={[{ value: 'system', label: t('ui.settings.motionSystem') }, { value: 'on', label: t('ui.settings.on') }, { value: 'off', label: t('ui.settings.off') }]} />
        </SettingRow>
        <SettingRow label={t('ui.settings.outline')}>
          <Segmented<Settings['outline']> testid="setting-outline" label={t('ui.settings.outline')} value={s.outline} onChange={set('outline')}
            options={[{ value: 'normal', label: t('ui.settings.outlineNormal') }, { value: 'thick', label: t('ui.settings.outlineThick') }]} />
        </SettingRow>
      </Group>
      <Group title={t('ui.settings.groupControls')}>
        <SettingRow label={t('ui.settings.joystickSide')}>
          <Segmented<Settings['joystickSide']> testid="setting-joystickSide" label={t('ui.settings.joystickSide')} value={s.joystickSide} onChange={set('joystickSide')}
            options={[{ value: 'floating', label: t('ui.settings.sideFloating') }, { value: 'left', label: t('ui.settings.sideLeft') }, { value: 'right', label: t('ui.settings.sideRight') }]} />
        </SettingRow>
        <SettingRow label={t('ui.settings.joystickSize')}>
          <Segmented<Settings['joystickSize']> testid="setting-joystickSize" label={t('ui.settings.joystickSize')} value={s.joystickSize} onChange={set('joystickSize')}
            options={[{ value: 'S', label: t('ui.settings.sizeS') }, { value: 'M', label: t('ui.settings.sizeM') }, { value: 'L', label: t('ui.settings.sizeL') }]} />
        </SettingRow>
      </Group>
      <Group title={t('ui.settings.groupAudio')}>
        {(['master', 'sfx'] as const).map((k) => (
          <SettingRow key={k} label={t(`ui.settings.${k}`)}>
            <label className="pointer-events-auto flex items-center gap-3">
              <input
                data-testid={`setting-${k}`}
                type="range"
                min={0}
                max={100}
                step={10}
                value={s[k]}
                aria-label={t(`ui.settings.${k}`)}
                onChange={(e) => updateSettings({ [k]: Number(e.target.value) } as Partial<Settings>)}
                className="w-40"
              />
              <span className="w-10 text-right text-md tabular-nums">{s[k]}</span>
            </label>
          </SettingRow>
        ))}
      </Group>
    </div>
  );
}

/** Settings reached from the menu: same panel on `semantic-bg`, no stage behind it. */
export function SettingsPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);
  return (
    <main data-testid="settings-page" className="them-scroll-y absolute inset-0 z-modal bg-bg px-6 pt-[max(var(--them-space-6),env(safe-area-inset-top))] md:px-16">
      <div className="mx-auto flex max-w-160 flex-col gap-2 pb-8">
        <div className="flex items-center gap-3">
          <Button data-testid="settings-back" variant="secondary" autoFocus onClick={onBack} aria-label={t('ui.pause.back')}>←  {t('ui.pause.back')}</Button>
          <h1 className="font-display text-2xl font-semibold leading-display">{t('ui.settings.title')}</h1>
        </div>
        <SettingsPanel />
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Pause                                                                                    */
/* ---------------------------------------------------------------------------------------- */

export function PauseScreen({ session, flow }: { session: GameSession; flow: PauseFlow }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const desktop = useDesktop();
  const wave = useHud(session.hud, (s) => s.wave);
  const total = useHud(session.hud, (s) => s.waveCount);
  const elapsed = useHud(session.hud, (s) => s.elapsed);
  const score = useHud(session.hud, (s) => s.score);
  const ref = useRef<HTMLDivElement>(null);
  const confirming = flow.layer === 'confirm-restart' || flow.layer === 'confirm-quit';
  useFocusTrap(flow.paused && flow.countdown === null && !confirming, ref, false);

  if (!flow.paused) return null;
  if (flow.countdown !== null) {
    return (
      <div role="status" className="pointer-events-auto absolute inset-0 z-system flex items-center justify-center bg-scrim">
        <span key={flow.countdown} data-testid="pause-countdown" aria-label={t('ui.pause.resuming', { n: flow.countdown })} className="anim-tick font-display text-5xl font-semibold tabular-nums">{flow.countdown}</span>
      </div>
    );
  }

  const summary = t('ui.pause.summary', { wave, total, time: mmss(elapsed), score: int(score) });
  const settingsOpen = flow.layer === 'settings';
  const actions = (
    <nav aria-label={t('ui.pause.title')} className="flex flex-col gap-2">
      <Button data-testid="pause-resume" variant="primary" autoFocus className="min-h-14 md:min-h-12" onClick={flow.startResume}>{t('ui.pause.resume')}</Button>
      <Button data-testid="pause-settings" aria-pressed={settingsOpen} className={`min-h-14 justify-start md:min-h-12 ${settingsOpen ? 'border-focus' : ''}`} onClick={() => flow.setLayer(settingsOpen && desktop ? 'actions' : 'settings')}>
        {t('ui.pause.settings')}{desktop ? '' : '  ›'}
      </Button>
      <Button data-testid="pause-restart" className="min-h-14 justify-start md:min-h-12" onClick={() => flow.setLayer('confirm-restart')}>{t('ui.pause.restart')}</Button>
      <Button data-testid="pause-quit" className="min-h-14 justify-start md:min-h-12" onClick={() => flow.setLayer('confirm-quit')}>{t('ui.pause.quit')}</Button>
    </nav>
  );

  const confirmDialog = confirming && (
    <ConfirmDialog
      title={t('ui.confirm.title')} body={t('ui.confirm.body')} keepLabel={t('ui.confirm.keep')} confirmLabel={t('ui.confirm.quit')}
      keepTestid="confirm-keep" confirmTestid="confirm-quit" onKeep={() => flow.setLayer('actions')} onConfirm={flow.confirm}
    />
  );

  return (
    <div className="pointer-events-auto absolute inset-0 z-system bg-scrim" data-testid="pause">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="pause-title" className={desktop
        ? 'absolute left-1/2 top-1/2 flex h-130 w-160 -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-surface shadow-sheet'
        : 'them-scroll-y absolute inset-0 flex flex-col bg-surface pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]'}>
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-2">
          <h2 id="pause-title" className="font-display text-2xl font-semibold leading-display">{t('ui.pause.title')}</h2>
          {desktop ? <span className="text-md text-text-muted">{summary}</span> : (
            <Button data-testid="pause-close" variant="text" aria-label={t('ui.pause.close')} onClick={flow.startResume}>×</Button>
          )}
        </header>
        {desktop ? (
          <div className="flex min-h-0 flex-1">
            <div className="w-50 shrink-0 border-r border-border p-4">{actions}</div>
            <div className="them-scroll-y min-w-0 flex-1 px-6">
              {settingsOpen ? <SettingsPanel /> : <p className="py-6 text-md leading-body text-text-muted">{summary}</p>}
            </div>
          </div>
        ) : settingsOpen ? (
          <div className="them-scroll-y flex-1 px-6">
            <div className="flex items-center gap-3 pt-3">
              <Button data-testid="pause-back" variant="secondary" autoFocus onClick={() => flow.setLayer('actions')}>←  {t('ui.pause.back')}</Button>
              <h3 className="font-display text-xl font-semibold">{t('ui.settings.title')}</h3>
            </div>
            <SettingsPanel />
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-6">
            <p className="text-md leading-body text-text-muted">{summary}</p>
            {actions}
          </div>
        )}
        {confirmDialog}
      </div>
    </div>
  );
}
