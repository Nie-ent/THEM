/** Camp › Summon: banner, listed and effective rates, pity, pulls (camp.md "Summon"). */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { content } from '@them/content';
import { pull, type Profile, type PullResult } from '@them/meta';
import { profileStore } from '../../game/profile';
import { Button, Wrap, useFmt } from '../kit';
import { Section, Stars, goldName, itemName, useAct } from './common';

/**
 * Effective shares measured by the P2-11 gate (docs/qa/phase2-sims.md, 200,000 pulls) — shown next
 * to the listed base rates (QA-P2-11-001). Update together with that report when the rules change.
 */
const EFFECTIVE: Record<string, number> = { '5': 0.0243, '4': 0.1437, '3': 0.2675, '2': 0.2829, '1': 0.2816 };

export function SummonTab({ profile }: { profile: Profile }) {
  const { t, i18n } = useTranslation();
  const { int } = useFmt();
  const { run, errorLine } = useAct();
  const [results, setResults] = useState<PullResult[]>([]);
  const G = content.gacha;
  const banner = G.banners[0]!;
  const pct = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 1 });
  const gold = profile.currencies[G.cost.currency] ?? 0;
  const doPull = (n: 1 | 10) => {
    const r = run<{ results: PullResult[] }>(() => pull(profile, content, banner.id, n, profileStore.rolls));
    if (r) setResults(r.results);
  };
  const untilGuarantee = Math.max(1, G.pity.guarantee4Every - profile.gacha.pullsSince4);

  return (
    <div className="flex flex-col gap-6">
      <Section title={t(banner.nameKey)} aside={`${int(gold)} ${goldName(t)}`}>
        <p className="text-md leading-body text-text-muted"><Wrap text={t(banner.descKey)} /></p>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="summon-1" disabled={gold < G.cost.single} onClick={() => doPull(1)}>{t('ui.camp.summon.pull1', { n: int(G.cost.single), currency: goldName(t) })}</Button>
          <Button data-testid="summon-10" variant="primary" disabled={gold < G.cost.ten} onClick={() => doPull(10)}>{t('ui.camp.summon.pull10', { n: int(G.cost.ten), currency: goldName(t) })}</Button>
        </div>
        {errorLine}
        {results.length > 0 && (
          <ul data-testid="summon-results" aria-live="polite" className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {results.map((r, i) => {
              const d = content.heroes.find((h) => h.id === r.heroId);
              return (
                <li key={i} style={{ animationDelay: `${i * 80}ms` }} className={`anim-fade flex items-center justify-between gap-2 rounded-md border p-3 ${r.stars >= 5 ? 'border-reward' : r.stars === 4 ? 'border-focus' : 'border-border-strong'} bg-surface`}>
                  <span className="flex flex-col">
                    <span className="text-md font-semibold"><Wrap text={d ? t(d.nameKey) : r.heroId} /></span>
                    <Stars n={r.stars} />
                  </span>
                  <span className="text-sm font-semibold">{r.duplicate ? t('ui.camp.summon.shards', { n: int(r.shards), name: itemName(t, content.heroGrowth.shardItemId) }) : t('ui.camp.summon.new')}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t('ui.camp.summon.pity')}>
        <p data-testid="summon-pity" className="text-md tabular-nums">{t('ui.camp.summon.since5', { n: int(profile.gacha.pullsSince5), hard: int(G.pity.hard) })}</p>
        <p className="text-sm text-text-muted"><Wrap text={t('ui.camp.summon.soft', { n: int(G.pity.softFrom) })} /></p>
        <p className="text-sm text-text-muted">{t('ui.camp.summon.guarantee4', { n: int(untilGuarantee) })}</p>
      </Section>

      <Section title={t('ui.camp.summon.rates')}>
        <table data-testid="summon-rates" className="w-full max-w-120 text-md tabular-nums">
          <thead>
            <tr className="border-b border-border text-sm text-text-muted">
              <th className="py-1 text-left font-medium">{t('ui.camp.summon.star')}</th>
              <th className="py-1 text-right font-medium">{t('ui.camp.summon.rateListed')}</th>
              <th className="py-1 text-right font-medium">{t('ui.camp.summon.rateEffective')}</th>
            </tr>
          </thead>
          <tbody>
            {(['5', '4', '3', '2', '1'] as const).map((s) => (
              <tr key={s} className="border-b border-border last:border-b-0">
                <td className="py-1"><Stars n={Number(s)} /></td>
                <td className="py-1 text-right">{pct.format(G.rates[s] ?? 0)}</td>
                <td className="py-1 text-right">{pct.format(EFFECTIVE[s] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm leading-body text-text-muted"><Wrap text={t('ui.camp.summon.effectiveNote')} /></p>
      </Section>
    </div>
  );
}
