/** Camp › Gear: slots, inventory, equip, enhance (camp.md "Gear"). */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { content } from '@them/content';
import { enhanceGear, enhanceInfo, equipGear, gearDef, type EnhanceOutcome, type GearItem, type Profile } from '@them/meta';
import { profileStore } from '../../game/profile';
import { Button, WarnIcon, Wrap, useFmt } from '../kit';
import { ModLines, Reason, Section, goldName, itemName, useAct, useShortReason } from './common';

/** Bonuses of one item at its level: base + perEnhance × level. */
function itemMods(it: GearItem): Record<string, number> {
  const d = gearDef(content, it.itemId);
  if (!d) return {};
  const out: Record<string, number> = { ...d.mods };
  for (const [k, v] of Object.entries(d.perEnhance)) out[k] = Math.round(((out[k] ?? 0) + v * it.enhance) * 1e9) / 1e9;
  return out;
}

export function GearTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const { int, pct } = useFmt();
  const { run, errorLine } = useAct();
  const shortReason = useShortReason();
  const [selected, setSelected] = useState<string | null>(null);
  const [protect, setProtect] = useState(false);
  const [last, setLast] = useState<{ outcome: EnhanceOutcome; level: number } | null>(null);
  const E = content.gear.enhance;
  const sel = profile.gear.items.find((g) => g.uid === selected) ?? null;
  const selDef = sel ? gearDef(content, sel.itemId) : undefined;
  const info = sel ? enhanceInfo(profile, content, sel.uid) : null;
  const equippedUids = new Set(Object.values(profile.gear.equipped));
  const name = (it: GearItem) => `${t(gearDef(content, it.itemId)?.nameKey ?? it.itemId)}${it.enhance > 0 ? ` +${it.enhance}` : ''}`;
  const setPieces = (setId: string) => Object.values(profile.gear.equipped)
    .map((uid) => profile.gear.items.find((g) => g.uid === uid))
    .filter((g) => g && gearDef(content, g.itemId)?.set === setId).length;

  const enhance = () => {
    if (!sel) return;
    const r = run<{ outcome: EnhanceOutcome; level: number }>(() => enhanceGear(profile, content, sel.uid, profileStore.rolls, { protect: protect && (info?.scrolls ?? 0) > 0 }));
    if (r) setLast({ outcome: r.outcome, level: r.level });
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('ui.camp.gear.slots')} aside={t('ui.camp.gear.have', {
        list: [`${itemName(t, E.stoneItemId)} ×${int(profile.items[E.stoneItemId] ?? 0)}`, `${itemName(t, E.protectItemId)} ×${int(profile.items[E.protectItemId] ?? 0)}`].join(' · '),
      })}>
        <ul className="flex flex-col">
          {content.gear.slots.map((s) => {
            const uid = profile.gear.equipped[s.id];
            const it = uid ? profile.gear.items.find((g) => g.uid === uid) : undefined;
            return (
              <li key={s.id} data-testid={`gear-slot-${s.id}`} className="flex flex-wrap items-start justify-between gap-2 border-b border-border py-2 last:border-b-0">
                <span className="min-w-24 text-sm text-text-muted">{t(s.nameKey)}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  {it ? <><span className="text-md font-semibold"><Wrap text={name(it)} /></span><ModLines mods={itemMods(it)} /></> : <span className="text-md text-text-subtle">{t('ui.camp.gear.empty')}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        {content.gear.sets.map((set) => {
          const n = setPieces(set.id);
          if (n === 0) return null;
          return <p key={set.id} className="text-sm text-text-muted"><Wrap text={`${t(set.nameKey)} (${int(n)}/${int(content.gear.items.filter((i) => i.set === set.id).length)}) · ${t(set.descKey)}`} /></p>;
        })}
      </Section>

      <Section title={t('ui.camp.gear.inventory')}>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {profile.gear.items.map((it) => (
            <li key={it.uid}>
              <button
                type="button"
                data-testid={`gear-item-${it.uid}`}
                aria-pressed={selected === it.uid}
                onClick={() => { setSelected(it.uid); setLast(null); setProtect(false); }}
                className={`flex min-h-11 w-full flex-col items-start rounded-md border px-3 py-2 text-left ${selected === it.uid ? 'border-focus bg-surface-raised' : 'border-border-strong bg-surface hover:border-focus'}`}
              >
                <span className="text-md font-semibold"><Wrap text={name(it)} /></span>
                <span className="text-sm text-text-muted">
                  {t(content.gear.slots.find((s) => s.id === gearDef(content, it.itemId)?.slot)?.nameKey ?? '')}
                  {equippedUids.has(it.uid) && ` · ${t('ui.camp.gear.equipped')}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {sel && selDef && info && (
        <Section title={name(sel)} testid="gear-detail">
          <p className="text-sm leading-body text-text-muted"><Wrap text={t(selDef.descKey)} /></p>
          <ModLines mods={itemMods(sel)} />
          <Button data-testid="gear-equip" disabled={equippedUids.has(sel.uid)} className="self-start" onClick={() => run(() => equipGear(profile, content, sel.uid))}>
            {equippedUids.has(sel.uid) ? t('ui.camp.gear.equipped') : t('ui.camp.gear.equip')}
          </Button>
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <h3 className="text-md font-semibold">{t('ui.camp.gear.enhanceTitle')}</h3>
            {info.next === null ? <p className="text-sm text-text-muted">{t('ui.camp.gear.max')}</p> : (
              <>
                <p className="text-md tabular-nums">{t('ui.camp.gear.next', { from: info.level, to: info.level + 1 })} · {t('ui.camp.gear.chance', { p: pct(info.next.chance) })}</p>
                {info.next.chance >= 1
                  ? <p className="text-sm text-text-muted">{t('ui.camp.gear.safe')}</p>
                  : info.next.dropChance > 0
                    ? <p data-testid="gear-risk" className="flex items-start gap-2 text-md font-semibold text-semantic-warning"><WarnIcon size={18} color="var(--them-color-semantic-warning)" /><span><Wrap text={t('ui.camp.gear.drop', { p: pct(info.next.dropChance), to: info.level - 1 })} /></span></p>
                    : <p className="text-sm text-text-muted">{t('ui.camp.gear.noDrop')}</p>}
                <p className="text-sm tabular-nums text-text-muted">{t('ui.camp.gear.cost', { stones: int(info.next.stones), stoneName: itemName(t, E.stoneItemId), gold: int(info.next.gold), goldName: goldName(t) })}</p>
                {info.next.dropChance > 0 && (
                  <div className="flex flex-col">
                    <label className={`flex min-h-11 items-center gap-2 text-md ${info.scrolls === 0 ? 'text-text-subtle' : ''}`}>
                      <input data-testid="gear-protect" type="checkbox" className="size-5 accent-accent" disabled={info.scrolls === 0} checked={protect && info.scrolls > 0} onChange={(e) => setProtect(e.target.checked)} />
                      {t('ui.camp.gear.protect', { n: int(info.scrolls), name: itemName(t, E.protectItemId) })}
                    </label>
                    {info.scrolls === 0 && <Reason testid="gear-no-scrolls" text={`${t('ui.camp.gear.noScrolls')} · ${shortReason(profile, E.protectItemId, 1) ?? ''}`} />}
                  </div>
                )}
                <Reason testid="gear-stone-reason" text={shortReason(profile, E.stoneItemId, info.next.stones)} />
                <Button data-testid="gear-enhance" variant="primary" className="self-start" disabled={!info.canAfford} onClick={enhance}>
                  {info.next.dropChance > 0 && info.next.chance < 1 ? t(protect && info.scrolls > 0 ? 'ui.camp.gear.enhanceProtected' : 'ui.camp.gear.enhanceRisk') : t('ui.camp.gear.enhance')}
                </Button>
              </>
            )}
            {last && <p data-testid="gear-result" role="status" className={`text-md font-semibold ${last.outcome === 'success' ? 'text-semantic-success' : last.outcome === 'fail-drop' ? 'text-semantic-danger' : 'text-semantic-warning'}`}>{t(`ui.camp.gear.result.${last.outcome}`, { n: last.level })}</p>}
          </div>
        </Section>
      )}
      {errorLine}
    </div>
  );
}
