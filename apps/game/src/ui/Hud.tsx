/**
 * In-stage HUD (docs/design/screens/hud.md). Small plates pinned to the edges; on phones everything
 * sits in the top 168 px so the bottom 200 px stays free for the joystick.
 */
import { useTranslation } from 'react-i18next';
import { content } from '@them/content';
import type { GameSession } from '../game/session';
import { useHud, type HudState } from '../game/store';
import { BlotIcon, CrownIcon, DiamondIcon, FlameIcon, HeartIcon, ResIcon, mmss, useDesktop, useFmt, useThrottled } from './kit';

const LOW = 0.3;

function Bar({ frac, fill, ghost = true, className }: { frac: number; fill: string; ghost?: boolean; className: string }) {
  const f = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  return (
    <div className={`relative overflow-hidden rounded-sm bg-hud-track ${className}`}>
      {ghost && (
        <div
          className="absolute inset-y-0 left-0 bg-hud-loss opacity-60"
          style={{ width: f, transition: 'width var(--them-motion-duration-slow) var(--them-motion-easing-standard) var(--them-motion-duration-hp-ghost-delay)' }}
        />
      )}
      <div className="absolute inset-y-0 left-0" style={{ width: f, background: fill }} />
    </div>
  );
}

function HeroHp({ h, compact }: { h: HudState; compact: boolean }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const frac = h.heroHp / h.heroMaxHp;
  const low = frac < LOW;
  return (
    <div data-testid="hud-hero-hp" role="progressbar" aria-label={t('ui.hud.heroHp')} aria-valuemin={0} aria-valuemax={h.heroMaxHp} aria-valuenow={h.heroHp} className="flex min-w-0 items-center gap-2 text-sm tabular-nums">
      <HeartIcon size={low ? 20 : 16} />
      <Bar frac={frac} fill="var(--them-color-hud-hp-hero)" className={`${compact ? 'h-3 flex-1' : 'h-3.5 w-60'} ${low ? 'anim-pulse outline outline-2 outline-semantic-danger' : ''}`} />
      <span>{compact ? int(h.heroHp) : `${int(h.heroHp)}/${int(h.heroMaxHp)}`}</span>
    </div>
  );
}

function CoreHp({ h, compact }: { h: HudState; compact: boolean }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const frac = h.coreHp / h.coreMaxHp;
  return (
    <div
      data-testid="hud-core-hp"
      role="progressbar"
      aria-label={t('ui.hud.coreHp')}
      aria-valuemin={0}
      aria-valuemax={h.coreMaxHp}
      aria-valuenow={h.coreHp}
      className={`flex min-w-0 items-center gap-2 text-sm tabular-nums ${h.coreThreat ? 'rounded-sm outline outline-2 outline-stage-core-threat' : ''}`}
    >
      <DiamondIcon />
      <Bar frac={frac} fill="var(--them-color-hud-hp-core)" className={`${compact ? 'h-3 flex-1' : 'h-2.5 w-60'} ${frac < LOW ? 'anim-pulse' : ''}`} />
      <span className={h.coreThreat ? 'text-stage-core-threat' : ''}>{compact ? int(h.coreHp) : `${int(h.coreHp)}/${int(h.coreMaxHp)}`}</span>
    </div>
  );
}

function Resources({ h }: { h: HudState }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  return (
    <div className="flex items-center gap-3 text-sm tabular-nums">
      <span data-testid="hud-wood" className="flex items-center gap-1" aria-label={t('ui.hud.wood')}><ResIcon kind="wood" />{int(h.wood)}</span>
      <span data-testid="hud-stone" className="flex items-center gap-1" aria-label={t('ui.hud.stone')}><ResIcon kind="stone" />{int(h.stone)}</span>
      {h.burning > 0 && (
        <span data-testid="hud-burning" className="flex items-center gap-1 text-stage-burning"><FlameIcon />{t('ui.hud.burning', { count: h.burning })}</span>
      )}
    </div>
  );
}

function WaveTimer({ h }: { h: HudState }) {
  const { t } = useTranslation();
  const kind = content.worlds[0]!.waves[h.wave - 1]?.kind;
  const prep = h.phase === 'prep';
  const warn = prep && h.prepTimeLeft <= 5;
  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-md font-semibold tabular-nums sm:text-lg">
      {kind === 'miniboss' && <span title={t('ui.hud.minibossWave')}><CrownIcon /></span>}
      {kind === 'boss' && <span title={t('ui.hud.bossWave')}><BlotIcon size={18} color="var(--them-color-semantic-text)" /></span>}
      <span data-testid="hud-wave">{t('ui.hud.wave', { wave: h.wave, total: h.waveCount })}</span>
      <span aria-hidden className="text-text-subtle">·</span>
      <span data-testid="hud-timer" className={warn ? 'text-semantic-warning' : ''}>{prep ? mmss(h.prepTimeLeft) : mmss(h.elapsed)}</span>
    </div>
  );
}

function BossBar({ h }: { h: HudState }) {
  const { t } = useTranslation();
  if (!h.boss) return null;
  const b = h.boss;
  const line = h.bossLine && h.bossLine.bossId === b.bossId ? h.bossLine : null;
  return (
    <div className="flex flex-col items-center gap-1">
      <div data-testid="hud-boss" className="flex w-full items-center gap-3 rounded-md bg-hud-plate px-3 py-2 text-sm">
        <span className="font-semibold">{t(b.nameKey)}</span>
        <Bar frac={b.hpFrac} fill="var(--them-color-stage-enemy)" ghost={false} className="h-3 flex-1" />
        <span aria-label={t('ui.hud.bossPhase', { phase: b.phase + 1, total: b.phases })} className="tracking-normal">
          {'●'.repeat(b.phase + 1)}{'○'.repeat(Math.max(0, b.phases - b.phase - 1))}
        </span>
      </div>
      {line && (
        <span key={line.seq} data-testid="hud-boss-line" role="status" className="max-w-full rounded-sm bg-hud-plate px-3 py-1 text-center font-hand text-md text-annotation">
          {t(line.key)}
        </span>
      )}
    </div>
  );
}

export function PauseButton({ session }: { session: GameSession }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      data-testid="hud-pause"
      aria-label={t('ui.hud.pause')}
      onClick={() => session.command({ pause: true })}
      className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-md border border-border-strong bg-hud-plate hover:border-focus"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor" /></svg>
    </button>
  );
}

export function Hud({ session, slotRef }: { session: GameSession; slotRef?: (el: HTMLDivElement | null) => void }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const desktop = useDesktop();
  const h = useHud(session.hud, (s) => s);
  const score = useThrottled(h.score, 250);
  if (!h.ready) return null;
  // The sim is paused during a draft; hide (not unmount) the HUD so the draft header never collides with it.
  const hidden = h.draft !== null;
  const low = h.heroHp / h.heroMaxHp < LOW && h.phase !== 'ended';

  const xp = (
    <div data-testid="hud-xp" role="progressbar" aria-label={t('ui.hud.xp')} aria-valuemin={0} aria-valuemax={h.xpToNext} aria-valuenow={h.xp} className="h-1 w-full bg-hud-track">
      <div className="h-full bg-hud-xp" style={{ width: `${Math.min(1, h.xp / h.xpToNext) * 100}%` }} />
    </div>
  );
  const level = <span data-testid="hud-level" className="self-start whitespace-nowrap rounded-sm bg-hud-plate px-2 py-1 text-sm font-semibold">{t('ui.hud.level', { level: h.level })}</span>;
  const scoreEl = (
    <span data-testid="hud-score" aria-label={t('ui.hud.score')} className="rounded-md bg-hud-plate px-3 py-2 text-md font-semibold tabular-nums sm:text-lg">{int(score)}</span>
  );

  return (
    <div className={hidden ? 'invisible' : undefined} aria-hidden={hidden || undefined}>
      {low && <div aria-hidden className="pointer-events-none absolute inset-0 z-hud opacity-25" style={{ boxShadow: 'inset 0 0 var(--them-space-6) var(--them-space-3) var(--them-color-hud-hp-hero)' }} />}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-hud pt-[env(safe-area-inset-top)]">
        {xp}
        {desktop ? (
          <div className="relative px-4 pt-3">
            <div className="flex w-70 flex-col gap-2 rounded-md bg-hud-plate p-2">
              {level}
              <HeroHp h={h} compact={false} />
              <CoreHp h={h} compact={false} />
              <Resources h={h} />
            </div>
            <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-hud-plate px-3 py-2"><WaveTimer h={h} /></div>
            <div className="absolute right-4 top-3 flex items-center gap-2">{scoreEl}<PauseButton session={session} /></div>
            {h.boss && <div className="absolute left-1/2 top-16 w-120 -translate-x-1/2"><BossBar h={h} /></div>}
          </div>
        ) : (
          <div className="flex flex-col gap-1 px-2 pt-1">
            <div className="flex h-11 items-center gap-2">
              {level}
              <div className="min-w-0 flex-1 rounded-md bg-hud-plate px-2 py-1"><WaveTimer h={h} /></div>
              <PauseButton session={session} />
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-md bg-hud-plate p-2">
              <HeroHp h={h} compact />
              <CoreHp h={h} compact />
            </div>
            <div className="flex items-center justify-between rounded-md bg-hud-plate px-2 py-1">
              <Resources h={h} />
              <span className="text-md font-semibold tabular-nums" data-testid="hud-score" aria-label={t('ui.hud.score')}>{int(score)}</span>
            </div>
            <BossBar h={h} />
            <div ref={slotRef} />
          </div>
        )}
      </div>
    </div>
  );
}
