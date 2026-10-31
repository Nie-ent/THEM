/** Results (docs/design/screens/results.md): the Archive records the run. The grade is the one loud thing. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { content, type Grade } from '@them/content';
import type { ScoreBreakdown } from '@them/core';
import type { GameSession } from '../game/session';
import { useHud } from '../game/store';
import { BlotIcon, Button, PenIcon, Wrap, mmss, useDesktop, useFmt } from './kit';
import { readJson, writeStore } from './storage';

export const BEST_KEY = 'them.best';
export interface Best { grade: Grade | null; score: number }
export const readBest = (): Best => readJson<Best>(BEST_KEY, { grade: null, score: 0 });

const checked = new WeakMap<ScoreBreakdown, boolean>();
/** Saves the run when it beats the stored best. Evaluated once per result object (StrictMode safe). */
function isNewBest(final: ScoreBreakdown): boolean {
  const known = checked.get(final);
  if (known !== undefined) return known;
  const prev = readBest();
  const better = final.total > prev.score;
  if (better) writeStore(BEST_KEY, JSON.stringify({ grade: final.grade, score: final.total }));
  checked.set(final, better);
  return better;
}

const GRADE_STYLE: Record<Grade, string> = {
  S: 'border-grade-s text-grade-s',
  A: 'border-grade-a text-grade-a',
  B: 'border-grade-b text-grade-b',
  C: 'border-grade-c text-grade-c',
};

const STEP_MS = 60;

function Line({ i, testid, label, detail, value, strong, children, valueTestid }: {
  i: number; testid: string; valueTestid?: string; label: string; detail?: ReactNode; value: string; strong?: boolean; children?: ReactNode;
}) {
  return (
    <div data-testid={testid} style={{ animationDelay: `${i * STEP_MS}ms` }} className={`anim-fade flex items-start justify-between gap-3 border-b border-border py-2 ${strong ? 'border-b-0 text-xl font-semibold' : 'text-md'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 leading-ui">
          <span className={strong ? 'font-display' : ''}>{label}</span>
          {detail && <span className="text-sm text-text-muted">{detail}</span>}
        </div>
        {children}
      </div>
      <span data-testid={valueTestid} className="w-24 shrink-0 text-right tabular-nums">{value}</span>
    </div>
  );
}

export function ResultsScreen({ session, onMenu }: { session: GameSession; onMenu: () => void }) {
  const { t } = useTranslation();
  const { int, dec, pct } = useFmt();
  const desktop = useDesktop();
  const h = useHud(session.hud, (s) => s);
  const final = h.final;
  const [skipped, setSkipped] = useState(false);
  const [open, setOpen] = useState(false);
  const newBest = useMemo(() => (final ? isNewBest(final) : false), [final]);

  // Any key or tap skips the reveal.
  useEffect(() => {
    const skip = () => setSkipped(true);
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => { window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); };
  }, []);

  if (!final) return null;
  const win = h.result === 'win';
  const world = content.worlds[0]!;
  const sc = content.balance.scoring;
  const kp = sc.killPoints;
  const base = final.killPoints + final.bossBonus;
  const coreFrac = h.coreHp / h.coreMaxHp;
  // The sim reports the final multiplier only; recover the hero hit share from it (formatting aid).
  const coreMult = sc.damage.coreBase + sc.damage.coreWeight * coreFrac;
  const hitShare = Math.max(0, Math.min(1, (sc.damage.heroBase - final.mDamage / coreMult) / sc.damage.heroWeight));
  const next = [...sc.grades].sort((a, b) => a.min - b.min).find((g) => g.min > final.performance);
  const cleared = win ? h.waveCount : Math.max(0, h.wave - 1);
  const cause = h.coreHp <= 0 ? 'causeCore' : 'causeHero';
  const counts = [
    { n: final.kills.normal, v: kp.normal },
    { n: final.kills.elite, v: kp.elite },
    { n: final.kills.miniboss, v: kp.miniboss },
  ].map((c) => `${int(c.n)}×${int(c.v)}`).join('  ');
  const stampDelay = 7 * STEP_MS + STEP_MS;

  const stamp = (size: string) => (
    <div className="flex flex-col items-center gap-2">
      <div
        data-testid="results-grade"
        aria-label={`${t('ui.results.grade')} ${final.grade}`}
        style={{ animationDelay: `${stampDelay}ms` }}
        className={`anim-stamp flex items-center justify-center rounded-md border-4 font-display font-extrabold ${size} ${GRADE_STYLE[final.grade]}`}
      >
        {final.grade}
      </div>
      <p className="text-center text-sm leading-ui text-text-muted">
        {t('ui.results.gradeFormula', { value: dec(final.performance) })}
        <br />
        {next ? t('ui.results.gradeNext', { grade: next.grade, min: dec(next.min) }) : t('ui.results.gradeTop')}
        {' · '}
        {t(h.result === 'win' ? 'ui.results.reward' : 'ui.results.rewardPartial', { pct: pct(final.rewardPct / 100) })}
      </p>
    </div>
  );

  const killDetail = <span className="tabular-nums">{counts}</span>;
  const lines = (
    <div className="flex flex-col">
      <Line i={0} testid="results-line-kill" label={t('ui.results.kill')} value={int(final.killPoints)} detail={desktop || open ? killDetail : undefined}>
        {!desktop && (
          <button type="button" data-testid="results-kill-toggle" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 text-sm text-accent-text">
            {open ? t('ui.results.collapse') : t('ui.results.expand')} {open ? '⌃' : '⌄'}
          </button>
        )}
        {open && !desktop && (
          <ul className="pb-1 text-sm text-text-muted">
            {([['killNormal', final.kills.normal, kp.normal], ['killElite', final.kills.elite, kp.elite], ['killMiniboss', final.kills.miniboss, kp.miniboss]] as const).map(([k, n, v]) => (
              <li key={k} className="flex justify-between tabular-nums"><span>{t(`ui.results.${k}`)}</span><span>{int(n)}×{int(v)}</span></li>
            ))}
          </ul>
        )}
      </Line>
      <Line i={1} testid="results-line-boss" label={t('ui.results.boss')} value={final.bossBonus > 0 ? int(final.bossBonus) : t('ui.results.none')} />
      <Line i={2} testid="results-line-base" label={t('ui.results.base')} value={int(base)} />
      <Line i={3} testid="results-line-difficulty" label={t('ui.results.difficulty')} detail={t('ui.results.difficultyNormal')} value={dec(final.mDifficulty)} />
      <Line i={4} testid="results-line-speed" label={t('ui.results.speed')} detail={t('ui.results.speedDetail', { standard: mmss(world.standardTimeSeconds), actual: mmss(h.elapsed) })} value={dec(final.mSpeed)} />
      <Line i={5} testid="results-line-damage" label={t('ui.results.damage')} detail={t('ui.results.damageDetail', { core: pct(coreFrac), hit: pct(hitShare) })} value={dec(final.mDamage)} />
      <div className="border-t-4 border-double border-border-strong" />
      <Line i={6} testid="results-line-score" valueTestid="results-score" strong label={t('ui.results.score')} value={int(final.total)} />
    </div>
  );

  const heading = (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-3xl font-extrabold leading-display md:text-4xl"><Wrap text={t(win ? 'ui.results.victory' : 'ui.results.defeat')} /></h1>
      {!win && <p className="flex items-center gap-2 text-lg text-semantic-danger" data-testid="results-cause">{t(`ui.results.${cause}`, { wave: h.wave })}</p>}
      <p className="flex items-start gap-2 font-hand text-xl leading-display text-annotation"><PenIcon size={18} /><span>“<Wrap text={t(win ? 'ui.results.quote' : 'ui.results.quoteDefeat')} />”</span></p>
    </div>
  );
  const scoreBadge = newBest && <span data-testid="results-new-best" className="rounded-sm border border-reward px-2 text-sm text-reward">{t('ui.results.newBest')}</span>;
  const actions = (
    <>
      <Button data-testid="results-play-again" variant="primary" autoFocus className="min-h-14 md:min-h-12 md:min-w-50" onClick={() => session.restart()}>{t('ui.results.again')}</Button>
      <Button data-testid="results-menu" variant="text" className="min-h-14 md:min-h-12" onClick={onMenu}>{t('ui.results.menu')}</Button>
    </>
  );

  return (
    <main data-testid="results" className={`pointer-events-auto absolute inset-0 z-modal bg-bg ${skipped ? 'no-anim' : ''}`}>
      {desktop ? (
        <div className="flex h-full">
          <aside className="flex w-50 shrink-0 flex-col gap-2 border-r border-border p-6 text-md text-text-muted">
            <BlotIcon size={24} />
            <span className="text-text">{t('ui.results.folio')}</span>
            <span>{t('ui.results.waves', { cleared, total: h.waveCount })}</span>
            <span className="tabular-nums">{t('ui.results.time')} {mmss(h.elapsed)}</span>
          </aside>
          <div className="them-scroll-y min-w-0 flex-1 pl-16 pr-8 pt-10">
            {heading}
            <div className="mt-6 flex items-start gap-8">
              <div className="w-140 shrink-0">{lines}{scoreBadge && <div className="pt-1">{scoreBadge}</div>}</div>
              {stamp('h-50 w-50 text-6xl')}
            </div>
            <div className="flex items-center gap-4 py-6">{actions}</div>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
          <div className="shrink-0 border-b border-border px-6 py-3 text-sm tabular-nums text-text-muted">
            {t('ui.results.folio')} · {mmss(h.elapsed)} · {cleared}/{h.waveCount}
          </div>
          <div className="them-scroll-y flex min-h-0 flex-1 flex-col gap-4 px-6 py-4">
            {heading}
            <div className="self-center">{stamp('h-40 w-40 text-5xl')}</div>
            <p className="flex items-baseline justify-between gap-3 border-y border-border-strong py-2 font-display text-xl font-semibold" data-testid="results-score-top">
              <span>{t('ui.results.score')}</span><span className="tabular-nums">{int(final.total)}</span>
            </p>
            {lines}
            {scoreBadge && <div>{scoreBadge}</div>}
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface p-3 pb-[max(var(--them-space-3),env(safe-area-inset-bottom))]">{actions}</div>
        </div>
      )}
    </main>
  );
}
