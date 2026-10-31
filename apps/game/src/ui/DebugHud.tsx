/**
 * MINIMAL DEBUG HUD (P1-04) so the run is playable end to end with stub content. P1-08 replaces
 * this file with the designed screens (docs/design/screens/*). testids follow the specs so e2e
 * written now keeps working. All strings are i18n keys; all colours are tokens.
 */
import { useTranslation } from 'react-i18next';
import { content } from '@them/content';
import { setLocale, currentLocale } from '@them/i18n';
import type { GameSession } from '../game/session';
import { useHud } from '../game/store';

const btn =
  'pointer-events-auto min-h-[44px] min-w-[44px] rounded-md border border-border-strong bg-surface-raised px-3 text-sm text-text hover:border-focus focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50';

function Bar({ frac, color, testid, label }: { frac: number; color: string; testid: string; label: string }) {
  return (
    <div data-testid={testid} className="flex items-center gap-2 text-xs tabular-nums" aria-label={label}>
      <div className="h-2.5 w-32 rounded-sm bg-hud-track sm:w-56">
        <div className="h-full rounded-sm" style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: color }} />
      </div>
    </div>
  );
}

export function DebugHud({ session }: { session: GameSession }) {
  const { t } = useTranslation();
  const h = useHud(session.hud, (s) => s);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (!h.ready) return null;

  return (
    <>
      {/* XP bar, full width, top edge */}
      <div data-testid="hud-xp" className="absolute inset-x-0 top-0 h-1 bg-hud-track" style={{ zIndex: 100 }}>
        <div className="h-full bg-hud-xp" style={{ width: `${(h.xp / h.xpToNext) * 100}%` }} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-1 flex items-start justify-between gap-2 p-2 sm:p-4" style={{ zIndex: 100 }}>
        <div className="flex flex-col gap-1 rounded-md bg-hud-plate p-2">
          <span data-testid="hud-level" className="text-xs text-text-muted">{t('hud.level', { level: h.level })}</span>
          <div className="flex items-center gap-2">
            <Bar testid="hud-hero-hp" frac={h.heroHp / h.heroMaxHp} color="var(--them-color-hud-hp-hero)" label={t('hud.heroHp')} />
            <span className="text-xs tabular-nums">{h.heroHp}</span>
          </div>
          <div className="flex items-center gap-2">
            <Bar testid="hud-core-hp" frac={h.coreHp / h.coreMaxHp} color="var(--them-color-hud-hp-core)" label={t('hud.coreHp')} />
            <span className={`text-xs tabular-nums ${h.coreThreat ? 'text-stage-core-threat' : ''}`}>{h.coreHp}</span>
          </div>
          <div className="flex gap-3 text-xs tabular-nums">
            <span data-testid="hud-wood" className="text-hud-resource-wood">■ {h.wood}</span>
            <span data-testid="hud-stone" className="text-hud-resource-stone">▲ {h.stone}</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1 rounded-md bg-hud-plate p-2 text-sm font-semibold sm:text-lg">
          <span data-testid="hud-wave">{t('hud.wave', { wave: h.wave, total: h.waveCount })}</span>
          <span data-testid="hud-timer" className="tabular-nums">
            {h.phase === 'prep' ? t('hud.prep', { time: mmss(h.prepTimeLeft) }) : mmss(h.elapsed)}
          </span>
          {h.boss && (
            <div data-testid="hud-boss" className="flex items-center gap-2 text-xs">
              <span>{t(h.boss.nameKey)}</span>
              <div className="h-2 w-28 bg-hud-track"><div className="h-full bg-stage-enemy" style={{ width: `${h.boss.hpFrac * 100}%` }} /></div>
              <span>{'●'.repeat(h.boss.phase + 1)}{'○'.repeat(h.boss.phases - h.boss.phase - 1)}</span>
            </div>
          )}
          {h.bossLine && (h.boss || h.bossLine.moment === 'defeat') && (
            <span key={h.bossLine.seq} data-testid="hud-boss-line" className="max-w-xs font-hand text-sm text-annotation">
              {t(h.bossLine.key)}
            </span>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <span data-testid="hud-score" className="rounded-md bg-hud-plate p-2 text-sm tabular-nums sm:text-lg">{h.score}</span>
            <button data-testid="hud-pause" className={btn} aria-label={t('hud.pause')} onClick={() => session.command({ pause: true })}>II</button>
          </div>
          <div className="pointer-events-auto flex gap-1">
            {(['th', 'en'] as const).map((l) => (
              <button key={l} data-testid={`lang-${l}`} className={btn} aria-pressed={currentLocale() === l} onClick={() => void setLocale(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
      </div>

      {h.phase === 'prep' && !h.paused && <PrepPanel session={session} />}
      {h.draft && !h.paused && <Draft session={session} />}
      {h.paused && h.phase !== 'ended' && (
        <div className="absolute inset-0 flex items-center justify-center bg-scrim" style={{ zIndex: 400 }}>
          <div className="flex flex-col items-center gap-4 rounded-lg bg-surface p-6 shadow-sheet">
            <h2 className="font-display text-2xl">{t('hud.paused')}</h2>
            <button data-testid="pause-resume" className={btn} onClick={() => session.command({ pause: true })}>{t('hud.resume')}</button>
          </div>
        </div>
      )}
      {h.phase === 'ended' && h.final && (
        <div className="absolute inset-0 flex items-center justify-center bg-scrim" style={{ zIndex: 400 }}>
          <div className="flex flex-col items-center gap-3 rounded-lg bg-surface p-6 shadow-sheet">
            <h2 className="font-display text-3xl">{t(h.result === 'win' ? 'results.win' : 'results.lose')}</h2>
            <div data-testid="results-grade" className="font-display text-6xl">{h.final.grade}</div>
            <div data-testid="results-score" className="tabular-nums">{t('results.score')}: {h.final.total}</div>
            <button data-testid="results-play-again" className={btn} onClick={() => session.restart()}>{t('results.again')}</button>
          </div>
        </div>
      )}
    </>
  );
}

function PrepPanel({ session }: { session: GameSession }) {
  const { t } = useTranslation();
  const intel = useHud(session.hud, (s) => s.intel);
  const sel = useHud(session.hud, (s) => s.selectedBuilding);
  const slots = useHud(session.hud, (s) => `${s.slotsUsed}/${s.maxSlots}`);
  const wood = useHud(session.hud, (s) => s.wood);
  const stone = useHud(session.hud, (s) => s.stone);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-2 sm:p-4" style={{ zIndex: 300 }}>
      {intel && (
        <div className="self-start rounded-md bg-hud-plate p-2 text-xs" data-testid="intel-compass">
          <div className="font-semibold">{t('hud.intel', { wave: intel.wave })}</div>
          {intel.enemies.map((e) => {
            const d = content.enemies.find((x) => x.id === e.enemyId);
            return (
              <div key={e.enemyId} data-testid={`intel-enemy-${e.enemyId}`}>
                {d ? t(d.nameKey) : e.enemyId} ×{e.count}
                {d?.counterKey && <span className="ml-2 font-hand text-annotation">{t(d.counterKey)}</span>}
              </div>
            );
          })}
          <div className="text-text-muted">
            {(['N', 'E', 'S', 'W'] as const).filter((s) => intel.sides[s] > 0).map((s) => `${t(`side.${s}`)} ${Math.round(intel.sides[s] * 100)}%`).join(' · ')}
          </div>
        </div>
      )}
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-md bg-surface p-2">
        <span data-testid="build-slots" className="text-xs">{t('hud.slots', { used: slots.split('/')[0], max: slots.split('/')[1] })}</span>
        {content.buildings.map((b) => {
          const afford = wood >= b.cost.wood && stone >= b.cost.stone;
          return (
            <button
              key={b.id}
              data-testid={`build-item-${b.id}`}
              className={`${btn} ${sel === b.id ? 'border-focus' : ''}`}
              disabled={!afford}
              aria-pressed={sel === b.id}
              onClick={() => session.selectBuilding(sel === b.id ? null : b.id)}
            >
              {t(b.nameKey)} <span className="tabular-nums text-text-muted">{b.cost.wood ? `■${b.cost.wood}` : ''}{b.cost.stone ? `▲${b.cost.stone}` : ''}</span>
            </button>
          );
        })}
        <button data-testid="prep-call-early" className={`${btn} ml-auto bg-accent`} onClick={() => session.command({ callWave: true })}>
          {t('hud.callEarly')}
        </button>
      </div>
    </div>
  );
}

function Draft({ session }: { session: GameSession }) {
  const { t } = useTranslation();
  const draft = useHud(session.hud, (s) => s.draft);
  const level = useHud(session.hud, (s) => s.level);
  const rerolls = useHud(session.hud, (s) => s.rerollsLeft);
  if (!draft) return null;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-scrim p-4" style={{ zIndex: 400 }}>
      <h2 className="font-display text-2xl">{t('draft.title', { level })}</h2>
      <div className="flex w-full max-w-4xl flex-col gap-3 sm:flex-row">
        {draft.map((o, i) => {
          const c = content.cards.find((x) => x.id === o.cardId)!;
          return (
            <button
              key={`${o.cardId}-${i}`}
              data-testid={`draft-card-${i}`}
              className="pointer-events-auto flex flex-1 flex-col gap-2 rounded-md border border-border bg-surface-raised p-4 text-left hover:border-focus"
              onClick={() => session.command({ pickCard: i })}
            >
              <span className="font-display text-lg">{t(c.nameKey)} <span className="text-xs text-text-subtle">{o.nextLevel > 1 ? `Lv ${o.nextLevel}` : ''}</span></span>
              <span className="text-sm">{t(c.descKey)}</span>
              {c.drawbackKey && <span data-testid={`draft-drawback-${i}`} className="text-sm text-semantic-danger">− {t(c.drawbackKey)}</span>}
            </button>
          );
        })}
      </div>
      <button data-testid="draft-reroll" className={btn} disabled={rerolls <= 0} onClick={() => session.command({ reroll: true })}>
        {t('draft.reroll', { count: rerolls })}
      </button>
    </div>
  );
}
