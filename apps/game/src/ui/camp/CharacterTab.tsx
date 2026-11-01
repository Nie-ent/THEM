/** Camp › Character: Global Level, stat allocation, class (camp.md "Character"). */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { content } from '@them/content';
import {
  STAT_IDS, allocateStats, canResetStatsFree, classBlock, classChain, classChangeCost, resetStats, setClass, statMods,
  tierLevel, type Profile, type StatId,
} from '@them/meta';
import { Button, Wrap, useFmt } from '../kit';
import { ModLines, Section, itemName, useAct } from './common';

export function CharacterTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const { run, errorLine } = useAct();
  const [pending, setPending] = useState<Record<StatId, number>>({ strength: 0, intellect: 0, agility: 0, vitality: 0, command: 0 });
  const spent = STAT_IDS.reduce((a, id) => a + pending[id], 0);
  const left = profile.unspentStatPoints - spent;
  const g = content.meta.globalLevel;
  const preview: Profile = { ...profile, stats: { ...profile.stats } };
  for (const id of STAT_IDS) preview.stats[id] += pending[id];
  const totals = statMods(preview, content);

  const step = (id: StatId, d: number) => setPending((p) => ({ ...p, [id]: Math.max(0, p[id] + d) }));
  const confirm = () => { if (run(() => allocateStats(profile, pending)) !== false) setPending({ strength: 0, intellect: 0, agility: 0, vitality: 0, command: 0 }); };

  const chain = classChain(content, profile.classId);
  const current = chain[chain.length - 1];
  const nextTier = current ? current.tier + 1 : 1;
  const choices = content.classes.classes.filter((c) => c.tier === nextTier && (c.parent ?? null) === (current?.id ?? null));
  const unlockAt = tierLevel(content, nextTier);
  const seal = itemName(t, content.classes.change.itemId);

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('ui.camp.stats.title')} aside={<span data-testid="stats-unspent">{t('ui.camp.stats.unspent', { n: int(left) })}</span>}>
        <ul className="flex flex-col">
          {STAT_IDS.map((id) => {
            const per = content.meta.stats[id];
            return (
              <li key={id} data-testid={`stat-${id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border py-2 last:border-b-0">
                <div className="flex min-w-40 flex-1 flex-col">
                  <span className="text-md font-semibold"><Wrap text={t(`ui.camp.stat.${id}`)} /></span>
                  <span className="text-sm text-text-muted">{t('ui.camp.stats.perPoint')}</span>
                  <ModLines mods={per} />
                </div>
                <div className="flex items-center gap-2">
                  <Button data-testid={`stat-${id}-minus`} aria-label={t('ui.camp.stats.minus', { stat: t(`ui.camp.stat.${id}`) })} disabled={pending[id] === 0} onClick={() => step(id, -1)} className="w-11 px-0">−</Button>
                  <span className="w-14 text-center text-lg font-semibold tabular-nums" aria-live="polite">
                    {int(profile.stats[id] + pending[id])}
                    {pending[id] > 0 && <span className="text-sm text-reward"> +{int(pending[id])}</span>}
                  </span>
                  <Button data-testid={`stat-${id}-plus`} aria-label={t('ui.camp.stats.plus', { stat: t(`ui.camp.stat.${id}`) })} disabled={left <= 0} onClick={() => step(id, 1)} className="w-11 px-0">+</Button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{t('ui.camp.stats.total')}</span>
          <ModLines mods={totals} empty={t('ui.camp.noBonus')} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="stats-confirm" variant="primary" disabled={spent === 0} onClick={confirm}>{t('ui.camp.stats.confirm', { n: int(spent) })}</Button>
          <Button data-testid="stats-reset" disabled={!canResetStatsFree(profile, content) || STAT_IDS.every((id) => profile.stats[id] === 0)} onClick={() => { run(() => resetStats(profile, content)); setPending({ strength: 0, intellect: 0, agility: 0, vitality: 0, command: 0 }); }}>
            {t('ui.camp.stats.reset')}
          </Button>
        </div>
        {!canResetStatsFree(profile, content) && <p className="text-sm text-text-muted">{t('ui.camp.stats.resetLocked', { level: g.freeRespecUntilLevel })}</p>}
      </Section>

      <Section title={t('ui.camp.class.title')}>
        {chain.length === 0 ? <p className="text-md text-text-muted">{t('ui.camp.class.none')}</p> : (
          <div data-testid="class-current" className="flex flex-col gap-2">
            {chain.map((c) => (
              <div key={c.id} className="flex flex-col">
                <span className="text-md font-semibold"><Wrap text={t(c.nameKey)} /></span>
                <span className="text-sm leading-body text-text-muted"><Wrap text={t(c.descKey)} /></span>
              </div>
            ))}
          </div>
        )}
        {choices.length > 0 && profile.level < unlockAt && <p className="text-sm text-text-muted">{t('ui.camp.class.lockedAt', { level: unlockAt })}</p>}
        {choices.length > 0 && profile.level >= unlockAt && (
          <div className="flex flex-col gap-2">
            <p className="text-md font-semibold">{t(nextTier === 1 ? 'ui.camp.class.choose' : 'ui.camp.class.promote')}</p>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {choices.map((c) => {
                const block = classBlock(profile, content, c.id);
                const cost = classChangeCost(profile, content, c.id);
                return (
                  <li key={c.id} className="flex flex-col gap-2 rounded-md border border-border-strong bg-surface p-3">
                    <span className="text-md font-semibold"><Wrap text={t(c.nameKey)} /></span>
                    <span className="text-sm leading-body text-text-muted"><Wrap text={t(c.descKey)} /></span>
                    <Button data-testid={`class-pick-${c.id}`} disabled={block !== null} onClick={() => run(() => setClass(profile, content, c.id))}>
                      {cost > 0 ? t('ui.camp.class.change', { name: t(c.nameKey), n: cost, item: seal }) : t('ui.camp.class.pick', { name: t(c.nameKey) })}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {chain.length > 0 && (
          <details data-testid="class-change" className="rounded-md border border-border p-3">
            <summary className="min-h-11 cursor-pointer text-md font-semibold leading-ui">{t('ui.camp.class.changeTitle', { n: content.classes.change.cost, item: seal, have: int(profile.items[content.classes.change.itemId] ?? 0) })}</summary>
            <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              {content.classes.classes
                .filter((c) => !chain.some((x) => x.id === c.id) && !choices.some((x) => x.id === c.id) && profile.level >= tierLevel(content, c.tier))
                .map((c) => (
                  <li key={c.id} className="flex flex-col gap-1">
                    <Button data-testid={`class-pick-${c.id}`} disabled={classBlock(profile, content, c.id) !== null} onClick={() => run(() => setClass(profile, content, c.id))}>
                      {t('ui.camp.class.change', { name: t(c.nameKey), n: classChangeCost(profile, content, c.id), item: seal })}
                    </Button>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </Section>
      {errorLine}
    </div>
  );
}
