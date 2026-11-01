/** Camp › Heroes: roster, team, EXP books, star up, limit break (camp.md "Heroes"). */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { content } from '@them/content';
import {
  heroExpToNext, heroGrowth, heroLevelCap, limitBreakHero, starUpHero, toggleTeamHero, useExpBooks as feedExpBooks, type Profile,
} from '@them/meta';
import { Button, Wrap, useFmt } from '../kit';
import { Bar, ModLines, Reason, Section, Stars, goldName, itemName, useAct, useShortReason } from './common';

export function HeroesTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const { run, errorLine } = useAct();
  const shortReason = useShortReason();
  const [selected, setSelected] = useState(profile.heroes.owned[0]?.heroId ?? null);
  const G = content.heroGrowth;
  const h = profile.heroes.owned.find((x) => x.heroId === selected) ?? null;
  const def = h ? content.heroes.find((x) => x.id === h.heroId) : undefined;
  const cap = h ? heroLevelCap(content, h) : 0;
  const books = Object.keys(G.expBooks);
  const nextStar = h ? G.starUp.find((s) => s.to === h.stars + 1) : undefined;
  const nextBreak = h ? G.limitBreaks[h.limitBreaks] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('ui.camp.tabs.heroes')} aside={t('ui.camp.heroes.team', { n: int(profile.heroes.team.length), max: int(content.meta.maxTeamSize) })}>
        <ul className="flex flex-col gap-2">
          {profile.heroes.owned.map((x) => {
            const d = content.heroes.find((c) => c.id === x.heroId);
            const inTeam = profile.heroes.team.includes(x.heroId);
            return (
              <li key={x.heroId} className={`flex flex-wrap items-center gap-3 rounded-md border p-3 ${selected === x.heroId ? 'border-focus bg-surface-raised' : 'border-border-strong bg-surface'}`}>
                <button type="button" data-testid={`hero-${x.heroId}`} aria-pressed={selected === x.heroId} onClick={() => setSelected(x.heroId)} className="flex min-h-11 min-w-0 flex-1 flex-col items-start text-left">
                  <span className="flex flex-wrap items-baseline gap-2 text-md font-semibold"><Wrap text={d ? t(d.nameKey) : x.heroId} /><Stars n={x.stars} max={G.maxStars} /></span>
                  <span className="text-sm tabular-nums text-text-muted">{t('ui.camp.heroes.level', { level: int(x.level), cap: int(heroLevelCap(content, x)) })}</span>
                </button>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input data-testid={`hero-team-${x.heroId}`} type="checkbox" className="size-5 accent-accent" checked={inTeam} onChange={() => run(() => toggleTeamHero(profile, content, x.heroId))} />
                  {t('ui.camp.heroes.inTeam')}
                </label>
              </li>
            );
          })}
        </ul>
      </Section>

      {h && def && (
        <Section title={t(def.nameKey)} testid="hero-detail">
          <p className="text-sm leading-body text-text-muted"><Wrap text={t(def.descKey)} /></p>
          <div className="flex flex-col gap-1">
            <span className="text-md tabular-nums">{t('ui.camp.heroes.level', { level: int(h.level), cap: int(cap) })}</span>
            {h.level < cap
              ? <><Bar value={h.exp} max={heroExpToNext(content, h.level)} label={t('ui.camp.heroes.exp')} /><span className="text-sm tabular-nums text-text-muted">{t('ui.camp.exp', { exp: int(h.exp), next: int(heroExpToNext(content, h.level)) })}</span></>
              : <span className="text-sm text-text-muted">{t('ui.camp.heroes.atCap')}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{t('ui.camp.heroes.growth')}</span>
            <ModLines mods={heroGrowth(content, h)} empty={t('ui.camp.noBonus')} />
          </div>
          <div className="flex flex-wrap gap-2">
            {books.map((b) => {
              const have = profile.items[b] ?? 0;
              return [1, 10].filter((n) => n === 1 || have >= 10).map((n) => (
                <Button key={`${b}-${n}`} data-testid={`hero-book-${b === books[0] ? 'small' : 'large'}${n === 10 ? '-10' : ''}`} disabled={have < n || h.level >= cap}
                  onClick={() => run(() => feedExpBooks(profile, content, h.heroId, b, n))}>
                  {t('ui.camp.heroes.book', { name: itemName(t, b), n, have: int(have) })}
                </Button>
              ));
            })}
          </div>
          {books.map((b) => <Reason key={b} testid={`hero-book-reason-${b === books[0] ? 'small' : 'large'}`} text={shortReason(profile, b, 1)} />)}
          <div className="flex flex-wrap gap-2">
            <Button data-testid="hero-star-up" disabled={!nextStar} onClick={() => run(() => starUpHero(profile, content, h.heroId))}>
              {nextStar ? t('ui.camp.heroes.starUp', { to: nextStar.to, shards: int(nextStar.shards), shardName: itemName(t, G.shardItemId), gold: int(nextStar.gold), goldName: goldName(t), have: int(profile.items[G.shardItemId] ?? 0) }) : t('ui.camp.heroes.maxStars')}
            </Button>
            <Button data-testid="hero-limit-break" disabled={!nextBreak || h.level < cap || Object.entries(nextBreak.items).some(([id, n]) => (profile.items[id] ?? 0) < n)} onClick={() => run(() => limitBreakHero(profile, content, h.heroId))}>
              {nextBreak
                ? t('ui.camp.heroes.limitBreak', {
                  cost: [...Object.entries(nextBreak.items).map(([id, n]) => `${itemName(t, id)} ×${int(n)}`), `${int(nextBreak.gold)} ${goldName(t)}`].join(' · '),
                })
                : t('ui.camp.heroes.noLimitBreak')}
            </Button>
          </div>
          {nextBreak && h.level < cap && <p className="text-sm text-text-muted">{t('ui.camp.heroes.limitBreakAtCap')}</p>}
          {nextBreak && Object.entries(nextBreak.items).map(([id, n]) => <Reason key={id} text={shortReason(profile, id, n)} />)}
          {nextStar && <Reason text={shortReason(profile, G.shardItemId, nextStar.shards)} />}
        </Section>
      )}
      {errorLine}
    </div>
  );
}
