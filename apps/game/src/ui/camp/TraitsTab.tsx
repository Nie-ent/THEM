/** Camp › Traits: four branches, hybrids, class nodes, reset (camp.md "Traits"). */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { content, type TraitNodeDef } from '@them/content';
import { allocateTrait, classDef, pointsInBranch, resetTraits, traitBlock, traitLoadout, traitResetCost, type Profile } from '@them/meta';
import { Button, Wrap, useDesktop, useFmt } from '../kit';
import { ModLines, Reason, Section, itemName, useAct, useConfirm, useShortReason } from './common';

function Node({ profile, d, onLearn }: { profile: Profile; d: TraitNodeDef; onLearn: () => void }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const rank = profile.traits.nodes[d.id] ?? 0;
  const block = traitBlock(profile, content, d.id);
  const reason = (() => {
    switch (block) {
      case null: return null;
      case 'branch-points': return t('ui.camp.traits.block.branchPoints', { n: d.requiresBranchPoints });
      case 'requires-branches': return t('ui.camp.traits.block.branches', {
        list: Object.entries(d.requiresBranches).map(([b, n]) => t('ui.camp.traits.branchNeed', { branch: t(`trait.branch.${b}.name`), n })).join(', '),
      });
      case 'requires-class': return t('ui.camp.traits.block.class', { name: d.requiresClass ? t(classDef(content, d.requiresClass)?.nameKey ?? d.requiresClass) : '' });
      default: return t(`ui.camp.traits.block.${block}`);
    }
  })();
  const keystone = d.kind === 'keystone';
  return (
    <li data-testid={`trait-${d.id}`} className={`flex flex-col gap-1 rounded-md border bg-surface p-3 ${keystone ? 'border-semantic-danger' : 'border-border-strong'} ${rank === 0 && block ? 'opacity-80' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-md font-semibold"><Wrap text={t(d.nameKey)} /></span>
        <span className="whitespace-nowrap text-sm tabular-nums text-text-muted">{t('ui.camp.traits.rank', { rank: int(rank), max: int(d.maxRank) })}</span>
      </div>
      {keystone && <span className="text-sm font-semibold text-semantic-danger">{t('ui.camp.traits.keystone')}</span>}
      <p className="text-sm leading-body text-text-muted"><Wrap text={t(d.descKey)} /></p>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-sm tabular-nums text-text-muted">{t('ui.camp.traits.cost', { n: d.cost })}</span>
        {block === null || block === 'points'
          ? <Button data-testid={`trait-${d.id}-learn`} disabled={block !== null} onClick={onLearn}>{t('ui.camp.traits.learn')}</Button>
          : <span className="text-sm text-text-muted"><Wrap text={reason ?? ''} /></span>}
      </div>
    </li>
  );
}

export function TraitsTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const desktop = useDesktop();
  const { run, errorLine } = useAct();
  const { ask, dialog } = useConfirm();
  const shortReason = useShortReason();
  const branches = content.traits.branches;
  const [branch, setBranch] = useState(branches[0]!.id);
  const crystal = itemName(t, content.traits.respec.itemId);
  const costText = (n: number) => (n === 0 ? t('ui.camp.traits.free') : t('ui.camp.traits.costItems', { n, item: crystal }));
  const respecItem = content.traits.respec.itemId;
  const learn = (id: string) => run(() => allocateTrait(profile, content, id));
  /** Keystones carry a drawback and cost points: confirm first, naming the cost. */
  const learnNode = (d: TraitNodeDef) => (d.kind === 'keystone'
    ? ask(t('ui.camp.confirm.keystoneTitle', { name: t(d.nameKey), n: d.cost }), t('ui.camp.confirm.keystoneBody'), () => learn(d.id))
    : learn(d.id));
  /** Reset: free resets go straight through; a crystal cost opens the confirm dialog. */
  const reset = (branchId: string | undefined, cost: number) => {
    const go = () => run(() => resetTraits(profile, content, branchId));
    if (cost > 0) ask(t('ui.camp.confirm.resetTitle', { n: cost, item: crystal }), t('ui.camp.confirm.resetBody'), go);
    else go();
  };
  const column = (b: string) => (
    <div key={b} className="flex min-w-0 flex-col gap-2">
      <h3 className="flex items-baseline justify-between gap-2 text-lg font-semibold">
        <Wrap text={t(`trait.branch.${b}.name`)} />
        <span className="text-sm tabular-nums text-text-muted">{int(pointsInBranch(profile, content, b))}</span>
      </h3>
      <p className="text-sm leading-body text-text-muted"><Wrap text={t(`trait.branch.${b}.desc`)} /></p>
      <Button data-testid={`traits-reset-${b}`} variant="text" className="self-start" disabled={pointsInBranch(profile, content, b) === 0 || shortReason(profile, respecItem, traitResetCost(profile, content, b)) !== null} onClick={() => reset(b, traitResetCost(profile, content, b))}>
        {t('ui.camp.traits.resetBranch', { cost: costText(traitResetCost(profile, content, b)) })}
      </Button>
      {pointsInBranch(profile, content, b) > 0 && <Reason text={shortReason(profile, respecItem, traitResetCost(profile, content, b))} />}
      <ul className="flex flex-col gap-2">
        {content.traits.nodes.filter((d) => d.branch === b && d.kind !== 'class').map((d) => <Node key={d.id} profile={profile} d={d} onLearn={() => learnNode(d)} />)}
      </ul>
    </div>
  );
  const hybrids = content.traits.nodes.filter((d) => d.kind === 'hybrid');
  const classNodes = content.traits.nodes.filter((d) => d.kind === 'class');

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('ui.camp.tabs.traits')} aside={<span data-testid="traits-points">{t('ui.camp.traits.points', { n: int(profile.traits.unspentPoints) })}</span>}>
        <p data-testid="traits-subtitle" className="text-sm leading-body text-text-muted">{t('ui.camp.traits.subtitle')}</p>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="traits-reset" disabled={Object.keys(profile.traits.nodes).length === 0 || shortReason(profile, respecItem, traitResetCost(profile, content)) !== null} onClick={() => reset(undefined, traitResetCost(profile, content))}>
            {t('ui.camp.traits.reset', { cost: costText(traitResetCost(profile, content)) })}
          </Button>
        </div>
        {Object.keys(profile.traits.nodes).length > 0 && <Reason testid="traits-reset-reason" text={shortReason(profile, respecItem, traitResetCost(profile, content))} />}
        {errorLine}
        {desktop ? (
          <div className="grid grid-cols-4 gap-4">{branches.map((b) => column(b.id))}</div>
        ) : (
          <>
            <div role="group" aria-label={t('ui.camp.traits.branch')} data-testid="traits-branch" className="grid grid-cols-2 gap-2">
              {branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={branch === b.id}
                  data-testid={`traits-branch-${b.id}`}
                  onClick={() => setBranch(b.id)}
                  className={`min-h-11 rounded-md border px-3 py-2 text-center text-md font-medium leading-ui ${branch === b.id ? 'border-focus bg-surface-raised text-reward' : 'border-border-strong text-text-muted'}`}
                >
                  <Wrap text={t(`trait.branch.${b.id}.name`)} />
                </button>
              ))}
            </div>
            {column(branch)}
          </>
        )}
      </Section>
      <Section title={t('ui.camp.traits.hybrid')}>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">{hybrids.map((d) => <Node key={d.id} profile={profile} d={d} onLearn={() => learnNode(d)} />)}</ul>
      </Section>
      <Section title={t('ui.camp.traits.classNodes')}>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">{classNodes.map((d) => <Node key={d.id} profile={profile} d={d} onLearn={() => learnNode(d)} />)}</ul>
      </Section>
      {dialog}
      <Section title={t('ui.camp.traits.total')}>
        {Object.keys(traitLoadout(profile, content).mods ?? {}).length === 0
          ? <p className="text-sm text-text-muted">{t('ui.camp.traits.none')}</p>
          : <ModLines mods={traitLoadout(profile, content).mods ?? {}} />}
      </Section>
    </div>
  );
}
