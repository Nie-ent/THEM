/**
 * Prep phase (docs/design/screens/prep.md): countdown, wave intel, build menu, slots + upkeep,
 * AI hero chips, call wave early. Desktop: select an item, click a slot. Touch: pick a slot and an
 * item, check the ghost on the ground, then confirm (never builds on a single tap).
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { content, type BuildingDef, type Cost, type Side } from '@them/content';
import type { WaveIntel } from '@them/core';
import type { GameSession } from '../game/session';
import { useHud, type HudState } from '../game/store';
import {
  BlotIcon, Button, CrownIcon, FlameIcon, PenIcon, ResIcon, Segmented, ShapeIcon, ShieldIcon, WarnIcon, Wrap,
  mmss, useCoarse, useDesktop, useFmt,
} from './kit';

type Material = 'wood' | 'stone';
const SIDES: Side[] = ['N', 'E', 'S', 'W'];
const SIDE_ROT: Record<Side, number> = { N: 0, E: 90, S: 180, W: 270 };

const buildingColor = (b: BuildingDef) =>
  b.render.shape === 'ring-dashed' ? 'var(--them-color-stage-burning)' : `var(--them-color-stage-structure-${b.material})`;

function missing(cost: Cost, h: HudState): { wood: number; stone: number } {
  return { wood: Math.max(0, (cost.wood ?? 0) - h.wood), stone: Math.max(0, (cost.stone ?? 0) - h.stone) };
}

/** Cost or upkeep as icon + number pairs; a number turns danger-red (with its icon) when short. */
function Amounts({ cost, h, prefix }: { cost: Cost; h?: HudState; prefix?: string }) {
  const { int } = useFmt();
  const short = h ? missing(cost, h) : { wood: 0, stone: 0 };
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      {prefix && <span aria-hidden className="text-text-subtle">{prefix}</span>}
      {(['wood', 'stone'] as const).map((k) => ((cost[k] ?? 0) > 0 ? (
        <span key={k} className={`inline-flex items-center gap-1 ${short[k] > 0 ? 'text-semantic-danger' : ''}`}>
          <ResIcon kind={k} size={14} />{int(cost[k] ?? 0)}
        </span>
      ) : null))}
    </span>
  );
}

function Fact({ b }: { b: BuildingDef }) {
  const { t } = useTranslation();
  return b.flammable ? (
    <span className="inline-flex items-center gap-1 text-sm text-stage-burning"><FlameIcon size={14} />{t('ui.build.burns')}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm text-text-muted"><ShieldIcon size={14} />{t('ui.build.fireproof')}</span>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Intel                                                                                    */
/* ---------------------------------------------------------------------------------------- */

function Compass({ intel, size }: { intel: WaveIntel; size: number }) {
  const { t } = useTranslation();
  return (
    <svg data-testid="intel-compass" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={t('ui.prep.compass')} className="shrink-0 rounded-md border border-border bg-surface">
      <path d="M60 50 70 60 60 70 50 60z" fill="var(--them-color-stage-core)" />
      {SIDES.filter((s) => intel.sides[s] > 0).map((s) => {
        const w = 2 + intel.sides[s] * 10;
        return (
          <g key={s} transform={`rotate(${SIDE_ROT[s]} 60 60)`} fill="var(--them-color-stage-enemy)" stroke="var(--them-color-stage-enemy)">
            <line x1="60" y1="8" x2="60" y2="34" strokeWidth={w} />
            <polygon points={`${60 - w * 1.4},32 ${60 + w * 1.4},32 60,46`} strokeWidth="1" />
          </g>
        );
      })}
    </svg>
  );
}

function IntelHeader({ intel }: { intel: WaveIntel }) {
  const { t } = useTranslation();
  const boss = content.bosses.find((b) => content.enemies.find((e) => e.boss === b.id && intel.enemies.some((x) => x.enemyId === e.id)));
  return (
    <div className="flex flex-col gap-1">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold leading-display">
        {intel.kind === 'miniboss' && <CrownIcon size={20} />}
        {intel.kind === 'boss' && <BlotIcon size={20} color="var(--them-color-semantic-text)" />}
        {t('ui.prep.intelTitle', { wave: intel.wave })}
      </h2>
      {intel.kind !== 'normal' && (
        <p className="flex items-start gap-2 font-hand text-lg leading-display text-annotation">
          <PenIcon />
          <span>{boss ? `${t(boss.nameKey)} · ` : ''}{intel.kind === 'boss' ? t('ui.prep.intelFinal') : t('ui.prep.intelBoss')}</span>
        </p>
      )}
    </div>
  );
}

function SideShares({ intel }: { intel: WaveIntel }) {
  const { t } = useTranslation();
  const { pct } = useFmt();
  return (
    <p className="text-sm text-text-muted">
      {SIDES.filter((s) => intel.sides[s] > 0).map((s) => t('ui.prep.compassShare', { side: t(`ui.side.${s}`), pct: pct(intel.sides[s]) })).join(' · ')}
    </p>
  );
}

function EnemyRow({ id, count }: { id: string; count: number }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const d = content.enemies.find((e) => e.id === id);
  if (!d) return null;
  return (
    <li data-testid={`intel-enemy-${id}`} className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0">
      <span className="flex items-start gap-2">
        <ShapeIcon shape={d.render.shape} color={d.tier === 'normal' ? undefined : 'var(--them-color-stage-enemy-elite)'} size={24} />
        <span className="min-w-0 flex-1 text-md font-medium leading-ui"><Wrap text={t(d.nameKey)} /></span>
        <span className="text-md font-semibold tabular-nums">{t('ui.prep.enemyCount', { count: int(count) })}</span>
      </span>
      {d.counterKey && (
        <span className="ml-8 flex items-start gap-1 font-hand text-lg leading-display text-annotation"><PenIcon size={14} /><Wrap text={t(d.counterKey)} /></span>
      )}
    </li>
  );
}

function IntelPanel({ intel }: { intel: WaveIntel | null }) {
  const { t } = useTranslation();
  return (
    <aside data-testid="intel" className="anim-slide pointer-events-auto absolute bottom-24 left-4 top-40 z-drawer flex w-80 flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sheet">
      {intel ? (
        <>
          <IntelHeader intel={intel} />
          <ul className="them-scroll-y min-h-0 flex-1">{intel.enemies.map((e) => <EnemyRow key={e.enemyId} id={e.enemyId} count={e.count} />)}</ul>
          <div className="flex items-center gap-3">
            <Compass intel={intel} size={112} />
            <SideShares intel={intel} />
          </div>
        </>
      ) : (
        <p className="text-md text-text-muted">{t('ui.prep.intelNone')}</p>
      )}
    </aside>
  );
}

function IntelStrip({ intel }: { intel: WaveIntel | null }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const [open, setOpen] = useState(false);
  if (!intel) return <p className="rounded-md bg-hud-plate p-2 text-sm text-text-muted">{t('ui.prep.intelNone')}</p>;
  return (
    <div data-testid="intel" className="anim-slide pointer-events-auto relative rounded-md border border-border bg-surface">
      <div className="flex h-35 items-stretch gap-3 p-2">
        <Compass intel={intel} size={96} />
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? t('ui.prep.hideIntel') : t('ui.prep.showIntel')}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 flex-col justify-center gap-2 rounded-md text-left"
        >
          <span className="flex items-center gap-2 text-md font-semibold">
            {intel.kind === 'miniboss' && <CrownIcon />}
            {intel.kind === 'boss' && <BlotIcon color="var(--them-color-semantic-text)" />}
            {t('ui.prep.intelTitle', { wave: intel.wave })}
          </span>
          <span className="flex flex-wrap gap-2">
            {intel.enemies.map((e) => {
              const d = content.enemies.find((x) => x.id === e.enemyId);
              return (
                <span key={e.enemyId} data-testid={open ? undefined : `intel-enemy-${e.enemyId}`} className="inline-flex items-center gap-1 text-md tabular-nums">
                  {d && <ShapeIcon shape={d.render.shape} color={d.tier === 'normal' ? undefined : 'var(--them-color-stage-enemy-elite)'} size={20} title={t(d.nameKey)} />}
                  {t('ui.prep.enemyCount', { count: int(e.count) })}
                </span>
              );
            })}
          </span>
          <SideShares intel={intel} />
        </button>
      </div>
      {open && (
        <div className="them-scroll-y absolute inset-x-0 top-full z-drawer max-h-60 rounded-md border border-border bg-surface px-3 shadow-sheet">
          <IntelHeader intel={intel} />
          <ul>{intel.enemies.map((e) => <EnemyRow key={e.enemyId} id={e.enemyId} count={e.count} />)}</ul>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Build                                                                                    */
/* ---------------------------------------------------------------------------------------- */

function ItemRow({ b, index, h, selected, hotkey, onPick }: { b: BuildingDef; index: number; h: HudState; selected: boolean; hotkey: boolean; onPick: () => void }) {
  const { t } = useTranslation();
  const short = missing(b.cost, h);
  const poor = short.wood > 0 || short.stone > 0;
  const full = h.slotsUsed >= h.maxSlots;
  return (
    <button
      type="button"
      data-testid={`build-item-${b.id}`}
      aria-pressed={selected}
      aria-disabled={poor || full}
      onClick={onPick}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-md border bg-surface-raised p-2 text-left ${selected ? 'border-2 border-focus' : 'border-border-strong hover:border-focus'} ${poor || full ? 'opacity-50' : ''}`}
    >
      <ShapeIcon shape={b.render.shape} color={buildingColor(b)} size={32} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-md font-semibold leading-ui"><Wrap text={t(b.nameKey)} /></span>
          {hotkey && <span className="rounded-sm border border-border px-1 text-sm text-text-subtle">{index + 1}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Amounts cost={b.cost} h={h} />
          <Amounts cost={b.upkeep} prefix="↻" />
          <Fact b={b} />
        </span>
        {poor && <span className="text-sm text-semantic-danger">{needText(t, short)}</span>}
      </span>
    </button>
  );
}

function needText(t: (k: string, o?: Record<string, unknown>) => string, short: { wood: number; stone: number }): string {
  return (['wood', 'stone'] as const).filter((k) => short[k] > 0).map((k) => t('ui.build.needMore', { amount: short[k], resource: t(`ui.hud.${k}`) })).join(' · ');
}

function Tile({ b, h, selected, onPick }: { b: BuildingDef; h: HudState; selected: boolean; onPick: () => void }) {
  const { t } = useTranslation();
  const short = missing(b.cost, h);
  const poor = short.wood > 0 || short.stone > 0;
  return (
    <button
      type="button"
      data-testid={`build-item-${b.id}`}
      aria-pressed={selected}
      aria-disabled={poor}
      onClick={onPick}
      className={`pointer-events-auto flex h-30 w-24 shrink-0 flex-col items-start gap-1 rounded-md border bg-surface-raised p-2 text-left ${selected ? 'border-2 border-focus' : 'border-border-strong'} ${poor ? 'opacity-50' : ''}`}
    >
      <ShapeIcon shape={b.render.shape} color={buildingColor(b)} size={24} />
      <span className="text-sm font-semibold leading-ui"><Wrap text={t(b.nameKey)} /></span>
      <span className="mt-auto flex flex-col gap-1 text-sm">
        <Amounts cost={b.cost} h={h} />
        <Fact b={b} />
      </span>
    </button>
  );
}

function SlotsUpkeep({ h }: { h: HudState }) {
  const { t } = useTranslation();
  const noSlots = h.slotsUsed >= h.maxSlots;
  const shortUp = h.wood < h.upkeepWood || h.stone < h.upkeepStone;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div data-testid="build-slots" className={`flex items-center gap-2 ${noSlots ? 'text-semantic-warning' : ''}`}>
        {noSlots && <WarnIcon color="var(--them-color-semantic-warning)" size={14} />}
        <span>{t('ui.build.slots', { used: h.slotsUsed, max: h.maxSlots })}</span>
        {noSlots && <span>· {t('ui.build.noSlots')}</span>}
      </div>
      <div data-testid="build-upkeep" className={`flex flex-wrap items-center gap-x-2 ${shortUp ? 'text-semantic-warning' : ''}`}>
        {shortUp && <WarnIcon color="var(--them-color-semantic-warning)" size={14} />}
        <span>{t('ui.build.upkeepSummary')}</span>
        <Amounts cost={{ wood: h.upkeepWood, stone: h.upkeepStone }} />
        <span className="text-text-subtle">· {t('ui.build.stock')}</span>
        <Amounts cost={{ wood: h.wood, stone: h.stone }} />
      </div>
      {shortUp && <p className="text-semantic-warning">{t('ui.build.upkeepShort')}</p>}
      {h.burning > 0 && <p className="flex items-center gap-1 text-stage-burning"><FlameIcon size={14} />{t('ui.build.burningNow', { count: h.burning })}</p>}
    </div>
  );
}

function Heroes({ placing, onPick }: { placing: string | null; onPick: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {content.heroes.map((hero) => (
        <button
          key={hero.id}
          type="button"
          data-testid={`prep-hero-${hero.id}`}
          aria-pressed={placing === hero.id}
          aria-label={t('ui.prep.heroPlace', { name: t(hero.nameKey) })}
          onClick={() => onPick(hero.id)}
          className={`pointer-events-auto flex min-h-11 items-center gap-2 rounded-md border bg-surface-raised px-2 text-sm ${placing === hero.id ? 'border-2 border-focus' : 'border-border-strong hover:border-focus'}`}
        >
          <ShapeIcon shape="rounded-square" color="var(--them-color-stage-ally)" size={20} />
          <span className="font-semibold">{t(hero.nameKey)}</span>
          <span aria-label={t('ui.prep.heroStars', { count: hero.stars })} className="text-reward">{'★'.repeat(hero.stars)}</span>
          <span className="text-text-muted">{t(hero.personalityKey)}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Screen                                                                                   */
/* ---------------------------------------------------------------------------------------- */

export function PrepScreen({ session, topSlot }: { session: GameSession; topSlot: HTMLElement | null }) {
  const { t } = useTranslation();
  const desktop = useDesktop();
  const coarse = useCoarse();
  const confirmFlow = coarse && !desktop;
  const h = useHud(session.hud, (s) => s);
  const sel = h.selectedBuilding;
  const [tab, setTab] = useState<Material>('wood');
  const [cell, setCell] = useState(-1);
  const [placing, setPlacing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [prevSel, setPrevSel] = useState(sel);
  if (prevSel !== sel) { setPrevSel(sel); if (!sel) setCell(-1); }

  const selDef = content.buildings.find((b) => b.id === sel) ?? null;
  const grid = session.run.grid;
  const free = (c: number) => c >= 0 && grid.buildable[c] === 1 && grid.cell[c] === -1;
  const short = selDef ? missing(selDef.cost, h) : { wood: 0, stone: 0 };
  const canBuild = !!selDef && free(cell) && short.wood === 0 && short.stone === 0 && h.slotsUsed < h.maxSlots;

  const pickItem = (b: BuildingDef) => {
    const s = missing(b.cost, h);
    if (s.wood > 0 || s.stone > 0) { setMsg(needText(t, s)); return; }
    if (h.slotsUsed >= h.maxSlots) { setMsg(t('ui.build.noSlots')); return; }
    setMsg(null);
    setPlacing(null);
    session.selectBuilding(sel === b.id ? null : b.id);
  };

  // Touch flow + hero placement take stage taps; the ghost shows what a confirm would build.
  useEffect(() => {
    if (!confirmFlow && !placing) return;
    session.tapListener = (tp) => {
      if (placing) {
        session.command({ placeHero: { heroId: placing, x: tp.x, y: tp.y } });
        setPlacing(null);
      } else if (tp.cell >= 0) {
        setCell(tp.cell);
        setMsg(session.run.grid.buildable[tp.cell] === 1 && session.run.grid.cell[tp.cell] === -1 ? null : t('ui.build.blocked'));
      }
    };
    return () => { session.tapListener = null; };
  }, [session, confirmFlow, placing, t]);

  useEffect(() => {
    session.ghost = confirmFlow && cell >= 0 ? { cell, ok: canBuild || (!selDef && free(cell)) } : null;
    return () => { session.ghost = null; };
  });

  const confirm = () => {
    if (!selDef || !canBuild) return;
    session.command({ build: { buildingId: selDef.id, cell } });
    setCell(-1);
  };

  // Desktop hotkeys: 1-4 pick an item (switching tab), Tab flips Wood/Stone when nothing has focus.
  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || h.paused || h.draft) return;
      const n = Number(e.key);
      if (n >= 1 && n <= content.buildings.length) {
        const b = content.buildings[n - 1]!;
        setTab(b.material);
        pickItem(b);
      } else if (e.key === 'Tab' && (document.activeElement === document.body || document.activeElement?.tagName === 'CANVAS')) {
        e.preventDefault();
        setTab((m) => (m === 'wood' ? 'stone' : 'wood'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const choosePlacing = (id: string) => { session.selectBuilding(null); setCell(-1); setPlacing(placing === id ? null : id); };
  const items = content.buildings.filter((b) => b.material === tab);
  const callEarly = () => session.command({ callWave: true });
  const warn = h.prepTimeLeft <= 5;
  const tabs = (
    <Segmented<Material>
      value={tab}
      onChange={setTab}
      testid="build-tab"
      label={t('ui.build.title')}
      options={[{ value: 'wood', label: t('ui.build.tabWood') }, { value: 'stone', label: t('ui.build.tabStone') }]}
    />
  );
  const timer = (
    <span key={warn ? h.prepTimeLeft : 'steady'} data-testid="prep-timer" aria-label={t('ui.prep.countdown')} className={`text-2xl font-semibold tabular-nums ${warn ? 'anim-tick text-semantic-warning' : ''}`}>
      {mmss(h.prepTimeLeft)}
    </span>
  );

  if (desktop) {
    return (
      <>
        <IntelPanel intel={h.intel} />
        <aside data-testid="build-menu" className="anim-fade pointer-events-auto absolute bottom-24 right-4 top-40 z-drawer flex w-80 flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-sheet">
          <h2 className="font-display text-lg font-semibold leading-display">{t('ui.build.title')}</h2>
          {tabs}
          <div className="them-scroll-y flex min-h-0 flex-1 flex-col gap-2">
            {items.length === 0 && <p className="text-md text-text-muted">{t('ui.build.none')}</p>}
            {items.map((b) => (
              <ItemRow key={b.id} b={b} index={content.buildings.indexOf(b)} h={h} selected={sel === b.id} hotkey onPick={() => pickItem(b)} />
            ))}
          </div>
          {msg && <p role="status" className="text-sm text-semantic-warning">{msg}</p>}
          {sel && <p className="text-sm text-text-muted">{t('ui.build.pick')}</p>}
          <SlotsUpkeep h={h} />
          <Heroes placing={placing} onPick={choosePlacing} />
          {placing && <p role="status" className="text-sm text-text-muted">{t('ui.prep.heroPlacing')}</p>}
        </aside>
        <div className="anim-fade pointer-events-auto absolute bottom-6 left-1/2 z-drawer flex h-14 -translate-x-1/2 items-center gap-4 rounded-lg border border-border bg-surface px-4 shadow-sheet">
          <span className="text-md text-text-muted">{t('ui.prep.title')}</span>
          {timer}
          <Button variant="primary" data-testid="prep-call-early" onClick={callEarly}>{t('ui.prep.callEarly')}</Button>
          <span className="max-w-60 text-sm leading-ui text-text-muted"><Wrap text={t('ui.prep.callEarlyHint')} /></span>
        </div>
      </>
    );
  }

  const topStack = (
    <div className="flex flex-col gap-2 pt-2">
      <div className="pointer-events-auto flex min-h-12 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3">
        <span className="flex items-center gap-2"><span className="text-md text-text-muted">{t('ui.prep.title')}</span>{timer}</span>
        <Button variant="primary" data-testid="prep-call-early" className="max-w-40" onClick={callEarly}>{t('ui.prep.callEarly')}</Button>
      </div>
      <IntelStrip intel={h.intel} />
    </div>
  );

  return (
    <>
      {topSlot && createPortal(topStack, topSlot)}
      <div className="anim-fade pointer-events-auto absolute inset-x-0 bottom-0 z-drawer flex h-65 flex-col gap-2 rounded-t-lg border-t border-border bg-surface px-3 pb-[max(var(--them-space-3),env(safe-area-inset-bottom))] pt-3 shadow-sheet">
        {confirmFlow && (sel || cell >= 0 || msg) && (
          <div className="pointer-events-auto absolute inset-x-2 bottom-full mb-2 flex items-center gap-2 rounded-md border border-border-strong bg-surface p-2" data-testid="build-confirm-bar">
            <p role="status" className="min-w-0 flex-1 text-sm leading-ui text-text">
              {msg ?? (sel && cell >= 0 ? t('ui.build.readyToPlace') : sel ? t('ui.build.tapSlot') : t('ui.build.pickItem'))}
            </p>
            <Button data-testid="build-cancel" variant="text" onClick={() => { session.selectBuilding(null); setCell(-1); setMsg(null); }}>{t('ui.build.cancel')}</Button>
            <Button data-testid="build-confirm" variant="primary" disabled={!canBuild} onClick={confirm}>{t('ui.build.confirm')}</Button>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          {tabs}
          <span data-testid="build-slots" className={`text-sm ${h.slotsUsed >= h.maxSlots ? 'text-semantic-warning' : ''}`}>
            {t('ui.build.slots', { used: h.slotsUsed, max: h.maxSlots })}{h.slotsUsed >= h.maxSlots ? ` · ${t('ui.build.noSlots')}` : ''}
          </span>
        </div>
        <div className="them-scroll-x flex gap-2 pb-1">
          {items.length === 0 && <p className="text-md text-text-muted">{t('ui.build.none')}</p>}
          {items.map((b) => <Tile key={b.id} b={b} h={h} selected={sel === b.id} onPick={() => pickItem(b)} />)}
        </div>
        <div className="flex items-center justify-between gap-2">
          <MobileUpkeep h={h} />
          <Heroes placing={placing} onPick={choosePlacing} />
        </div>
      </div>
    </>
  );
}

function MobileUpkeep({ h }: { h: HudState }) {
  const { t } = useTranslation();
  const shortUp = h.wood < h.upkeepWood || h.stone < h.upkeepStone;
  return (
    <div data-testid="build-upkeep" className={`flex items-center gap-1 text-sm ${shortUp ? 'text-semantic-warning' : ''}`} title={shortUp ? t('ui.build.upkeepShort') : undefined}>
      {shortUp && <WarnIcon size={14} color="var(--them-color-semantic-warning)" />}
      <span className="sr-only">{t('ui.build.upkeepSummary')}</span>
      <Amounts cost={{ wood: h.upkeepWood, stone: h.upkeepStone }} prefix="↻" />
    </div>
  );
}
