/** Shared UI primitives: buttons, segmented control, icons, media hooks, number formatting. */
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { segmentWords } from '@them/i18n';
import { SHAPES } from '../game/shapes';

/* ---------------------------------------------------------------------------------------- */
/* Hooks                                                                                    */
/* ---------------------------------------------------------------------------------------- */

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', fn);
      return () => m.removeEventListener('change', fn);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Desktop layout from the `md` breakpoint (768 px) up; tablet uses the desktop layout. */
export const useDesktop = (): boolean => useMedia('(min-width: 768px)');
/** Touch-first input (select-then-confirm flows, no key hints). */
export const useCoarse = (): boolean => useMedia('(pointer: coarse)');

export function useFmt() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const int = new Intl.NumberFormat(i18n.language);
    const dec = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pct = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 });
    return { int: (v: number) => int.format(v), dec: (v: number) => dec.format(v), pct: (v: number) => pct.format(v) };
  }, [i18n.language]);
}

export const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

/** Updates at most every `ms` (score readout: 4 updates per second). */
export function useThrottled<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  const last = useRef(0);
  useEffect(() => {
    const wait = Math.max(0, last.current + ms - performance.now());
    const id = window.setTimeout(() => { last.current = performance.now(); setShown(value); }, wait);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return shown;
}

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),[href],select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside `ref` while `active`, and returns focus to the previous element on close. */
export function useFocusTrap(active: boolean, ref: RefObject<HTMLElement | null>, restore = true): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0]!, last = nodes[nodes.length - 1]!;
      if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (restore) prev?.focus?.();
    };
  }, [active, ref, restore]);
}

/* ---------------------------------------------------------------------------------------- */
/* Text                                                                                     */
/* ---------------------------------------------------------------------------------------- */

/** Thai has no spaces: offer a line break only at word boundaries (Intl.Segmenter). */
export function Wrap({ text }: { text: string }) {
  const { i18n } = useTranslation();
  if (i18n.language !== 'th') return <>{text}</>;
  const words = segmentWords(text, 'th');
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={i}>{i > 0 && <wbr />}{w}</Fragment>
      ))}
    </>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Controls                                                                                 */
/* ---------------------------------------------------------------------------------------- */

type Variant = 'primary' | 'secondary' | 'text' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'border border-accent bg-accent text-text-on-accent hover:border-focus active:border-reward-edge',
  secondary: 'border border-border-strong bg-surface-raised text-text hover:border-focus',
  text: 'border border-transparent text-text-muted hover:text-text',
  danger: 'border border-semantic-danger bg-transparent text-semantic-danger hover:bg-surface-raised',
};

export function Button({ variant = 'secondary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={`pointer-events-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-center text-md font-semibold leading-ui disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-fill disabled:text-disabled-text ${VARIANT[variant]} ${className}`}
    />
  );
}

export interface SegOption<T extends string> { value: T; label: string }

/** Equal-width segmented control (radiogroup). Segments grow with their text; never truncate. */
export function Segmented<T extends string>({ value, options, onChange, testid, label, className = '' }: {
  value: T; options: SegOption<T>[]; onChange: (v: T) => void; testid: string; label: string; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testid} className={`pointer-events-auto inline-flex rounded-md border border-border-strong ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-testid={`${testid}-${o.value}`}
          onClick={() => onChange(o.value)}
          className={`min-h-11 min-w-11 flex-1 whitespace-nowrap px-3 text-center text-md font-medium leading-ui first:rounded-l-md last:rounded-r-md ${value === o.value ? 'bg-surface-raised text-reward' : 'text-text-muted hover:text-text'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Icons: same silhouettes as the stage so the HUD/intel read like the world                 */
/* ---------------------------------------------------------------------------------------- */

const V = (name: string) => `var(--them-color-${name})`;

export function ShapeIcon({ shape, color = V('stage-enemy'), size = 20, title }: { shape: keyof typeof SHAPES; color?: string; size?: number; title?: string }) {
  const poly = SHAPES[shape];
  const stroke = V('stage-outline');
  return (
    <svg width={size} height={size} viewBox="-1.6 -1.6 3.2 3.2" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} className="shrink-0">
      {poly === 'circle' ? (
        <circle r="1" fill={shape === 'ring-dashed' ? 'none' : color} stroke={shape === 'ring-dashed' ? color : stroke} strokeWidth={shape === 'ring-dashed' ? 0.2 : 0.14} strokeDasharray={shape === 'ring-dashed' ? '0.35 0.25' : undefined} />
      ) : (
        <polygon points={poly.map(([x, y]) => `${x},${y}`).join(' ')} fill={color} stroke={stroke} strokeWidth="0.14" strokeLinejoin="round" />
      )}
      {shape === 'circle-ticks' && [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([x, y], i) => (
        <line key={i} x1={x! * 1.05} y1={y! * 1.05} x2={x! * 1.5} y2={y! * 1.5} stroke={color} strokeWidth="0.2" />
      ))}
      {shape === 'triangle-flame' && <circle cx="1.15" cy="0" r="0.35" fill={V('stage-burning')} />}
      {(shape === 'square-planks' || shape === 'square-bricks') && [-0.5, 0.5].map((k) => (
        <line key={k} x1="-1" x2="1" y1={k} y2={k} stroke={stroke} strokeWidth="0.12" />
      ))}
      {shape === 'square-bricks' && <line x1="0" x2="0" y1="-1" y2="-0.5" stroke={stroke} strokeWidth="0.12" />}
      {shape === 'square-tower' && <circle r="0.45" fill={stroke} fillOpacity="0.5" />}
    </svg>
  );
}

/** Wood = square, stone = triangle: the same shapes as the pickups. */
export function ResIcon({ kind, size = 16 }: { kind: 'wood' | 'stone'; size?: number }) {
  return <ShapeIcon shape={kind === 'wood' ? 'square' : 'triangle'} color={V(kind === 'wood' ? 'hud-resource-wood' : 'hud-resource-stone')} size={size} />;
}

export function HeartIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path d="M8 14 2 8.2A3.6 3.6 0 0 1 8 4a3.6 3.6 0 0 1 6 4.2z" fill={V('hud-hp-hero')} />
    </svg>
  );
}

export function DiamondIcon({ size = 16, color = V('hud-hp-core') }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path d="M8 1 15 8 8 15 1 8z" fill={color} />
    </svg>
  );
}

export function CrownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path d="M2 12V5l3.5 3L8 3l2.5 5L14 5v7z" fill={V('semantic-reward')} />
    </svg>
  );
}

/** The ink blot: the one recurring ornament (menu margin, wave 20 glyph). */
export function BlotIcon({ size = 16, color = V('semantic-text-subtle') }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path d="M8 1.5c2 0 2.6 2 4 2.6 2 .8 3 2.6 2.2 4.6-.6 1.6-.2 3.4-2 4.6-1.6 1.1-3 .4-4.2 1.2-1.4.9-3.4.4-4.4-1C2.2 12.4 1.6 10.6 2.2 9 2.8 7.4 2 6 3.2 4.6 4.4 3.200 5.200 2.800 6 2.200 6.800 1.700 7.400 1.500 8 1.500z" fill={color} />
    </svg>
  );
}

export function FlameIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path d="M8 1c1 3 4 4.600 4 8.200A4 4 0 0 1 4 9.200C4 7.600 5 6.600 5.600 5.400 6.800 6 7.200 4 8 1z" fill={V('stage-burning')} />
    </svg>
  );
}

export function ShieldIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path d="M8 1.500 13.500 3.500v4.200c0 3-2.300 5.300-5.500 6.800C4.800 13 2.500 10.700 2.500 7.700V3.500z" fill={V('stage-structure-stone')} />
    </svg>
  );
}

export function WarnIcon({ size = 16, color = V('semantic-danger') }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path d="M8 1.500 15 14H1z" fill={color} />
      <path d="M8 6v4M8 11.500v1" stroke={V('semantic-bg')} strokeWidth="1.500" strokeLinecap="round" />
    </svg>
  );
}

export function PenIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path d="M2 14l.8-3.400L11 2.400 13.600 5 5.400 13.200z" fill={V('semantic-annotation')} />
    </svg>
  );
}

export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path d="M3 8.500 6.500 12 13 4.500" fill="none" stroke={V('semantic-reward')} strokeWidth="2" />
    </svg>
  );
}

export function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex items-center gap-2 ${className}`}>{children}</div>;
}
