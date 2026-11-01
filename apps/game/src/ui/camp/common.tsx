/** Shared pieces of the Camp screen (docs/design/screens/camp.md). */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { content } from '@them/content';
import type { Profile } from '@them/meta';
import { profileStore } from '../../game/profile';
import { Wrap, useFmt } from '../kit';

/** Mods keys whose value is a fraction shown as a signed percent (×100). */
const PERCENT = new Set([
  'damageMult', 'cooldownMult', 'rangeMult', 'projectileSpeedMult', 'speedMult', 'maxHpMult', 'pickupRadiusMult', 'xpMult',
  'critMult', 'structureDamageMult', 'allyDamageMult', 'damageTakenMult', 'critChance', 'armorAdd', 'hpMult',
]);

/** "+12%" / "−8%" / "+1" / "+0.3": tabular, locale-aware, with a real minus sign. */
export function useSigned() {
  const { i18n } = useTranslation();
  const n1 = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  return (key: string, v: number): string => {
    const shown = PERCENT.has(key) ? `${n1.format(Math.abs(v * 100))}%` : n1.format(Math.abs(v));
    return `${v < 0 ? '−' : '+'}${shown}`;
  };
}

/** One line per modifier, from `ui.mod.<key>` (FLEX). Zero values are skipped. */
export function ModLines({ mods, className = '', empty }: { mods: Record<string, number | undefined>; className?: string; empty?: string }) {
  const { t } = useTranslation();
  const signed = useSigned();
  const keys = Object.keys(mods).filter((k) => (mods[k] ?? 0) !== 0).sort();
  if (keys.length === 0) return empty ? <p className={`text-sm text-text-subtle ${className}`}>{empty}</p> : null;
  return (
    <ul className={`flex flex-col gap-0.5 text-sm leading-body text-text-muted ${className}`}>
      {keys.map((k) => <li key={k}><Wrap text={t(`ui.mod.${k}`, { v: signed(k, mods[k]!) })} /></li>)}
    </ul>
  );
}

export function Section({ title, aside, children, testid }: { title: string; aside?: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <section data-testid={testid} className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold leading-display"><Wrap text={title} /></h2>
        {aside && <div className="text-sm text-text-muted">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/** Runs a profile action; keeps the refusal text (meta error code → `ui.camp.error.<code>`). */
export function useAct() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const run = <T extends object>(fn: (p: Profile) => Profile | ({ profile: Profile } & T)): T | null | false => {
    const r = profileStore.act<T>(fn);
    if (!r.ok) {
      setError(t(`ui.camp.error.${r.code}`, { defaultValue: t('ui.camp.error.generic') }));
      return false;
    }
    setError(null);
    return r.value;
  };
  const errorLine = error ? <p data-testid="camp-error" role="status" className="text-sm text-semantic-danger"><Wrap text={error} /></p> : null;
  return { run, errorLine, clear: () => setError(null) };
}

export const itemName = (t: (k: string) => string, id: string): string => {
  const def = content.meta.items.find((i) => i.id === id);
  return def ? t(def.nameKey) : id;
};

export const goldName = (t: (k: string) => string): string => {
  const c = content.meta.currencies.find((x) => x.id === 'gold');
  return c ? t(c.nameKey) : 'gold';
};

/** "1,234 Gold" style amount. */
export function useAmount() {
  const { int } = useFmt();
  return (n: number, name: string) => `${int(n)} ${name}`;
}

export function Stars({ n, max = 5 }: { n: number; max?: number }) {
  const { t } = useTranslation();
  return (
    <span className="whitespace-nowrap text-reward" aria-label={t('ui.camp.heroes.starsLabel', { n })}>
      <span aria-hidden>{'★'.repeat(n)}</span>
      <span aria-hidden className="text-text-subtle">{'★'.repeat(Math.max(0, max - n))}</span>
    </span>
  );
}

export function Bar({ value, max, label, testid }: { value: number; max: number; label: string; testid?: string }) {
  return (
    <div data-testid={testid} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-1.5 w-full rounded-sm bg-hud-track">
      <div className="h-full rounded-sm bg-hud-xp" style={{ width: `${max > 0 ? Math.min(1, value / max) * 100 : 100}%` }} />
    </div>
  );
}
