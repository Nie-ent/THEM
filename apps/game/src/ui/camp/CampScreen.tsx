/** Camp (docs/design/screens/camp.md): everything the profile owns between runs, in six tabs. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { content } from '@them/content';
import { expToNext } from '@them/meta';
import { useProfile } from '../../game/profile';
import { BlotIcon, Button, useDesktop, useFmt } from '../kit';
import { CharacterTab } from './CharacterTab';
import { Bar, goldName } from './common';
import { GearTab } from './GearTab';
import { HeroesTab } from './HeroesTab';
import { SummonTab } from './SummonTab';
import { TitlesTab } from './TitlesTab';
import { TraitsTab } from './TraitsTab';

const TABS = ['character', 'traits', 'gear', 'heroes', 'summon', 'titles'] as const;
type Tab = (typeof TABS)[number];

export function CampScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const desktop = useDesktop();
  const profile = useProfile();
  const [tab, setTab] = useState<Tab>('character');
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  if (!profile) {
    return (
      <main data-testid="camp" className="absolute inset-0 z-modal flex flex-col items-start gap-4 bg-bg p-8">
        <p className="text-md">{t('ui.camp.loading')}</p>
        <Button data-testid="camp-back" onClick={onBack}>{t('ui.camp.back')}</Button>
      </main>
    );
  }

  const next = expToNext(content, profile.level);
  const badge = (x: Tab) => (x === 'character' ? profile.unspentStatPoints : x === 'traits' ? profile.traits.unspentPoints : 0);
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const dir = (desktop ? { ArrowDown: 1, ArrowUp: -1 } : { ArrowRight: 1, ArrowLeft: -1 })[e.key as 'ArrowDown'];
    if (!dir) return;
    e.preventDefault();
    const i = (TABS.indexOf(tab) + dir + TABS.length) % TABS.length;
    setTab(TABS[i]!);
    tabRefs.current[TABS[i]!]?.focus();
  };
  const tabs = (
    <div role="tablist" aria-label={t('ui.camp.title')} aria-orientation={desktop ? 'vertical' : 'horizontal'}
      className={desktop ? 'flex flex-col gap-1' : 'them-scroll-x flex h-12 shrink-0 gap-1 overflow-x-auto border-b border-border px-2'}>
      {TABS.map((x) => (
        <button
          key={x}
          ref={(el) => { tabRefs.current[x] = el; }}
          type="button"
          role="tab"
          id={`camp-tab-${x}`}
          aria-selected={tab === x}
          aria-controls="camp-panel"
          tabIndex={tab === x ? 0 : -1}
          data-testid={`camp-tab-${x}`}
          onClick={() => setTab(x)}
          onKeyDown={onTabKey}
          className={`flex min-h-11 shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 text-md font-medium leading-ui ${tab === x ? 'bg-surface-raised text-reward' : 'text-text-muted hover:text-text'}`}
        >
          {t(`ui.camp.tabs.${x}`)}
          {badge(x) > 0 && <span className="rounded-sm bg-accent px-1.5 text-xs font-semibold tabular-nums text-text-on-accent" aria-label={t('ui.camp.unspent', { n: badge(x) })}>{int(badge(x))}</span>}
        </button>
      ))}
    </div>
  );
  const level = (
    <div className="flex min-w-0 flex-1 flex-col gap-1 md:max-w-80">
      <div className="flex items-baseline gap-3">
        <span data-testid="camp-level" className="font-display text-2xl font-extrabold leading-display">{t('ui.camp.level', { level: int(profile.level) })}</span>
        <span className="text-sm tabular-nums text-text-muted">{next === null ? t('ui.camp.expMax') : t('ui.camp.exp', { exp: int(profile.exp), next: int(next) })}</span>
      </div>
      {next !== null && <Bar value={profile.exp} max={next} label={t('ui.camp.expLabel')} />}
    </div>
  );
  const gold = <span data-testid="camp-gold" className="whitespace-nowrap text-md font-semibold tabular-nums text-reward">{int(profile.currencies.gold ?? 0)} {goldName(t)}</span>;
  const panel = (
    <div id="camp-panel" role="tabpanel" aria-labelledby={`camp-tab-${tab}`} className="them-scroll-y min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
      <div className="max-w-220">
        {tab === 'character' && <CharacterTab profile={profile} />}
        {tab === 'traits' && <TraitsTab profile={profile} />}
        {tab === 'gear' && <GearTab profile={profile} />}
        {tab === 'heroes' && <HeroesTab profile={profile} />}
        {tab === 'summon' && <SummonTab profile={profile} />}
        {tab === 'titles' && <TitlesTab profile={profile} />}
      </div>
    </div>
  );

  if (desktop) {
    return (
      <main data-testid="camp" className="absolute inset-0 z-modal flex flex-col bg-bg">
        <header className="flex h-16 shrink-0 items-center gap-6 border-b border-border px-4">
          <Button data-testid="camp-back" variant="text" onClick={onBack}>‹ {t('ui.camp.back')}</Button>
          <h1 className="font-display text-xl font-semibold uppercase leading-display tracking-wide">{t('ui.camp.title')}</h1>
          <div className="flex flex-1 items-center justify-end gap-6">{level}{gold}</div>
        </header>
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-50 shrink-0 flex-col justify-between border-r border-border px-3 py-6">{tabs}<BlotIcon size={24} /></aside>
          {panel}
        </div>
      </main>
    );
  }
  return (
    <main data-testid="camp" className="absolute inset-0 z-modal flex flex-col bg-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <header className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <Button data-testid="camp-back" variant="text" className="-ml-3" onClick={onBack}>‹ {t('ui.camp.back')}</Button>
          {gold}
        </div>
        {level}
      </header>
      {tabs}
      {panel}
    </main>
  );
}
