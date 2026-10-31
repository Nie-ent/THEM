/** Level-up card draft (docs/design/screens/card-draft.md): 1 of 3, rerolls, drawbacks in their own block. */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { content, type CardDef } from '@them/content';
import type { CardOption } from '@them/core';
import type { GameSession } from '../game/session';
import { useHud } from '../game/store';
import { Button, CheckIcon, PenIcon, ShapeIcon, WarnIcon, Wrap, useCoarse, useDesktop } from './kit';

const INPUT_LOCK_MS = 400;

const RARITY_EDGE: Record<CardDef['rarity'], string> = {
  common: 'bg-border-strong',
  rare: 'bg-semantic-info',
  epic: 'bg-accent-text',
  legendary: 'bg-reward',
};

function Card({ index, option, selected, dimmed, desktop, coarse, onPick }: {
  index: number; option: CardOption; selected: boolean; dimmed: boolean; desktop: boolean; coarse: boolean; onPick: () => void;
}) {
  const { t, i18n } = useTranslation();
  const card = content.cards.find((c) => c.id === option.cardId);
  if (!card) return null;
  const tags = card.tags.filter((tag) => i18n.exists(`ui.tag.${tag}`));
  return (
    <button
      type="button"
      data-testid={`draft-card-${index}`}
      aria-pressed={selected}
      onClick={onPick}
      style={{ animationDelay: `${index * 80}ms` }}
      className={`anim-deal lift pointer-events-auto relative flex flex-col overflow-hidden rounded-md border bg-surface-raised text-left ${selected ? 'border-2 border-focus' : 'border-border-strong hover:border-focus'} ${dimmed ? 'opacity-70' : ''} ${desktop ? 'h-100 w-74' : 'min-h-40 w-full shrink-0'}`}
    >
      <span aria-hidden className={`block h-0.75 w-full shrink-0 ${RARITY_EDGE[card.rarity]}`} />
      <span className="flex flex-1 flex-col gap-3 p-4">
        <span className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-surface">
            <ShapeIcon shape="diamond" color="var(--them-color-semantic-reward)" size={28} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-display text-lg font-semibold leading-display"><Wrap text={t(card.nameKey)} /></span>
            <span className="flex flex-wrap gap-1">
              <span className="rounded-sm border border-border-strong px-2 text-sm text-text-muted">{t(`ui.rarity.${card.rarity}`)}</span>
              {tags.map((tag) => (
                <span key={tag} className="rounded-sm border border-border px-2 text-sm text-text-subtle">{t(`ui.tag.${tag}`)}</span>
              ))}
            </span>
          </span>
          {selected && <CheckIcon size={24} />}
        </span>
        <span className="flex items-start gap-2 text-md leading-body">
          <span aria-hidden className="font-bold text-semantic-success">+</span>
          <span className="sr-only">{t('ui.draft.benefit')}: </span>
          <span><Wrap text={t(card.descKey)} /></span>
        </span>
        {card.drawbackKey && (
          <span data-testid={`draft-drawback-${index}`} className="mt-1 flex flex-col gap-1 border-t border-annotation pt-2">
            <span className="flex items-center gap-2 font-hand text-lg leading-display text-annotation"><PenIcon />{t('ui.draft.price')}</span>
            <span className="flex items-start gap-2 text-md leading-body">
              <WarnIcon />
              <span className="sr-only">{t('ui.draft.drawback')}: </span>
              <span><Wrap text={t(card.drawbackKey)} /></span>
            </span>
          </span>
        )}
        <span className="mt-auto flex items-center justify-between text-sm text-text-subtle">
          <span>{option.nextLevel > 1 ? t('ui.draft.upgrade', { from: option.nextLevel - 1, to: option.nextLevel }) : ''}</span>
          {desktop && !coarse && <span className="rounded-sm border border-border px-2">{t('ui.draft.key', { n: index + 1 })}</span>}
        </span>
      </span>
    </button>
  );
}

export function DraftScreen({ session }: { session: GameSession }) {
  const { t } = useTranslation();
  const desktop = useDesktop();
  const coarse = useCoarse();
  const draft = useHud(session.hud, (s) => s.draft);
  const level = useHud(session.hud, (s) => s.level);
  const rerolls = useHud(session.hud, (s) => s.rerollsLeft);
  const paused = useHud(session.hud, (s) => s.paused);
  const [sel, setSel] = useState<number | null>(null);
  const unlocked = useRef(false);
  const more = Math.max(0, session.run.pendingLevels - 1);

  // 400 ms input lock so a held joystick or key does not pick a card by accident.
  useEffect(() => {
    unlocked.current = false;
    const id = window.setTimeout(() => { unlocked.current = true; }, INPUT_LOCK_MS);
    return () => window.clearTimeout(id);
  }, []);

  const act = (fn: () => void) => { if (unlocked.current && !paused) fn(); };
  const pick = (i: number) => act(() => { session.command({ pickCard: i }); setSel(null); });
  const reroll = () => act(() => { if (rerolls > 0) { session.command({ reroll: true }); setSel(null); } });
  // Desktop clicks pick at once; touch selects first (select-then-confirm).
  const click = (i: number) => act(() => (coarse ? setSel(i) : pick(i)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '1' || e.key === '2' || e.key === '3') { if (unlocked.current && !paused && draft?.[Number(e.key) - 1]) { (document.activeElement as HTMLElement | null)?.blur(); setSel(Number(e.key) - 1); } }
      else if (e.key === 'Enter' && sel !== null && (document.activeElement === document.body || document.activeElement === null)) { e.preventDefault(); pick(sel); }
      else if (e.key === 'r' || e.key === 'R') reroll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!draft) return null;
  const rerollLabel = rerolls > 0 ? t('ui.draft.reroll', { count: rerolls }) : t('ui.draft.rerollNone');

  const header = (
    <h2 className="flex flex-wrap items-baseline gap-x-4 font-display text-2xl font-semibold leading-display">
      <span>{t('ui.draft.title', { level })}{more > 0 ? ` ${t('ui.draft.more', { count: more })}` : ''}</span>
      <span className="text-text-muted">{t('ui.draft.choose')}</span>
    </h2>
  );
  const rerollBtn = (
    <Button data-testid="draft-reroll" disabled={rerolls <= 0} onClick={reroll}>
      {rerollLabel}{desktop && !coarse && rerolls > 0 && <span className="rounded-sm border border-border-strong px-2 text-sm text-text-muted">R</span>}
    </Button>
  );
  const cards = draft.map((o, i) => (
    <Card key={`${o.cardId}-${i}`} index={i} option={o} selected={sel === i} dimmed={sel !== null && sel !== i} desktop={desktop} coarse={coarse} onPick={() => click(i)} />
  ));

  return (
    <section data-testid="draft" aria-label={t('ui.draft.region')} className="pointer-events-auto absolute inset-0 z-modal bg-scrim">
      {desktop ? (
        <div className="flex h-full flex-col px-40 py-10">
          {header}
          <div className="flex flex-1 items-center justify-center gap-8">{cards}</div>
          <div className="flex justify-start">{rerollBtn}</div>
        </div>
      ) : (
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
          <div className="shrink-0 px-6 pb-3 pt-6">{header}</div>
          <div className="them-scroll-y flex flex-1 flex-col gap-3 px-6 pb-4">{cards}</div>
          <div className="flex shrink-0 gap-3 border-t border-border bg-surface p-3 pb-[max(var(--them-space-3),env(safe-area-inset-bottom))]">
            {rerollBtn}
            <Button data-testid="draft-take" variant="primary" className="flex-1" disabled={sel === null} onClick={() => sel !== null && pick(sel)}>{t('ui.draft.take')}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
