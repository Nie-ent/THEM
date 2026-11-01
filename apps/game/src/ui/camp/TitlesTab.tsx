/** Camp › Titles: main title, collection tiers, every title with how to earn it (camp.md "Titles"). */
import { useTranslation } from 'react-i18next';
import { content } from '@them/content';
import { countedTitles, equipTitle, type Profile } from '@them/meta';
import { Button, Wrap, useFmt } from '../kit';
import { ModLines, Section, useAct } from './common';

export function TitlesTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const { int } = useFmt();
  const { run, errorLine } = useAct();
  const T = content.titles;
  const eq = T.titles.find((x) => x.id === profile.titles.equipped);
  const n = countedTitles(profile, content);

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('ui.camp.titles.main')}>
        {eq ? (
          <div data-testid="title-equipped" className="flex flex-col gap-1">
            <span className="text-lg font-semibold text-reward"><Wrap text={t(eq.nameKey)} /></span>
            <ModLines mods={eq.mods} />
            <Button data-testid="title-unequip" variant="text" className="self-start" onClick={() => run(() => equipTitle(profile, content, null))}>{t('ui.camp.titles.unequip')}</Button>
          </div>
        ) : <p className="text-md text-text-muted">{t('ui.camp.titles.none')}</p>}
      </Section>

      <Section title={t('ui.camp.titles.collection', { n: int(n) })}>
        <ul className="flex flex-col gap-2">
          {T.collection.map((tier) => (
            <li key={tier.count} className={`flex flex-wrap items-baseline gap-x-3 ${n >= tier.count ? '' : 'text-text-subtle'}`}>
              <span className="text-md font-semibold tabular-nums">{t('ui.camp.titles.tier', { count: tier.count })}</span>
              <span className="text-sm">{n >= tier.count ? t('ui.camp.titles.reached') : t('ui.camp.titles.notReached')}</span>
              <ModLines mods={tier.mods} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('ui.camp.tabs.titles')}>
        {errorLine}
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {T.titles.map((x) => {
            const unlocked = profile.titles.unlocked.includes(x.id);
            const equipped = profile.titles.equipped === x.id;
            return (
              <li key={x.id} data-testid={`title-${x.id}`} className={`flex flex-col gap-1 rounded-md border p-3 ${equipped ? 'border-reward' : 'border-border-strong'} ${unlocked ? 'bg-surface' : 'bg-bg text-text-subtle'}`}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-md font-semibold"><Wrap text={t(x.nameKey)} /></span>
                  <span className="whitespace-nowrap text-sm">{equipped ? t('ui.camp.titles.equipped') : unlocked ? t('ui.camp.titles.unlocked') : t('ui.camp.titles.locked')}</span>
                </span>
                <p className="text-sm leading-body"><Wrap text={t(x.descKey)} /></p>
                {unlocked && !equipped && <Button data-testid={`title-equip-${x.id}`} className="self-start" onClick={() => run(() => equipTitle(profile, content, x.id))}>{t('ui.camp.titles.equip')}</Button>}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
