/** Title / main menu (docs/design/screens/menu.md): the title is the one loud thing. */
import { useTranslation } from 'react-i18next';
import { currentLocale, type Locale } from '@them/i18n';
import pkg from '../../package.json' with { type: 'json' };
import { BlotIcon, Button, Segmented, Wrap, useDesktop, useFmt } from './kit';
import { applyLocale } from './lang';
import { readBest } from './ResultsScreen';
import { useProfile } from '../game/profile';
import { SaveNotice } from './SaveNotice';

export function MenuScreen({ onStart, onSettings, onCamp }: { onStart: () => void; onSettings: () => void; onCamp: () => void }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const desktop = useDesktop();
  const best = readBest();
  const profile = useProfile();

  const toggle = (
    <Segmented<Locale>
      testid="lang"
      label={t('ui.menu.language')}
      value={currentLocale()}
      onChange={(l) => void applyLocale(l)}
      options={[{ value: 'th', label: t('ui.menu.langTh') }, { value: 'en', label: t('ui.menu.langEn') }]}
    />
  );
  const world = (
    <section className="flex flex-col gap-1 border-t border-border pt-6 md:max-w-120">
      <p className="text-md text-text-muted">{t('ui.menu.worldLabel')}</p>
      <h2 className="font-display text-2xl font-semibold leading-display"><Wrap text={t('world.garroth.name')} /></h2>
      <p className="text-md leading-body text-text-muted"><Wrap text={t('ui.menu.worldThreat')} /></p>
      {best.grade && <p data-testid="menu-best" className="pt-2 text-md font-semibold tabular-nums text-reward">{t('ui.menu.best', { grade: best.grade, score: int(best.score) })}</p>}
    </section>
  );
  const title = (
    <header className="flex flex-col gap-2">
      <h1 className="anim-wipe h-[1.3em] font-display text-5xl font-extrabold leading-display md:text-6xl">{t('app.title')}</h1>
      <p className="font-hand text-xl leading-display text-annotation"><Wrap text={t('ui.menu.epigraph')} /></p>
    </header>
  );
  const actions = (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
      <Button data-testid="menu-start" variant="primary" autoFocus className="min-h-14 md:min-h-12 md:min-w-50" onClick={onStart}>{t('ui.menu.start')}</Button>
      <Button data-testid="menu-camp" className="min-h-12 md:min-w-40" disabled={!profile} onClick={onCamp}>
        {profile ? t('ui.menu.camp', { level: int(profile.level) }) : t('ui.menu.campOff')}
      </Button>
      <Button data-testid="menu-settings" variant="text" className="min-h-12" onClick={onSettings}>{t('ui.menu.settings')}</Button>
    </div>
  );
  const version = <span className="text-xs text-text-subtle">{t('ui.menu.version', { version: pkg.version })}</span>;

  if (desktop) {
    return (
      <main data-testid="menu" className="absolute inset-0 z-modal flex bg-bg">
        <aside className="flex w-50 shrink-0 flex-col justify-between border-r border-border px-4 py-10">
          <div>{toggle}</div>
          <div className="flex flex-col gap-4"><BlotIcon size={32} />{version}</div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-8 pl-16 pr-8">
          {title}
          {world}
          <SaveNotice />
          {actions}
        </div>
      </main>
    );
  }
  return (
    <main data-testid="menu" className="absolute inset-0 z-modal flex flex-col bg-bg pb-[max(var(--them-space-6),env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">{toggle}<BlotIcon size={24} /></div>
      <div className="them-scroll-y flex flex-1 flex-col gap-8 px-6 pt-8">
        {title}
        {world}
        <SaveNotice />
      </div>
      <div className="flex shrink-0 flex-col gap-2 px-6 pt-4">
        {actions}
        <div className="pt-2">{version}</div>
      </div>
    </main>
  );
}
