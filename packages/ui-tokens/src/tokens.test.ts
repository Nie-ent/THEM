import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderCss } from '../scripts/gen-css.ts';
import { hexToInt, tokens } from './index.ts';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('ui-tokens', () => {
  it('tokens.css matches the generator output (run gen:css after editing index.ts)', () => {
    const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
    expect(css).toBe(renderCss());
  });

  const s = tokens.color.semantic;
  const st = tokens.color.stage;
  const aa: Array<[string, string, string, number]> = [
    ['text on bg', s.text, s.bg, 7],
    ['text on surfaceRaised', s.text, s.surfaceRaised, 7],
    ['textMuted on surfaceRaised', s.textMuted, s.surfaceRaised, 4.5],
    ['textSubtle on surfaceRaised', s.textSubtle, s.surfaceRaised, 4.5],
    ['accentText on surface', s.accentText, s.surface, 4.5],
    ['reward on surface', s.reward, s.surface, 4.5],
    ['textOnAccent on accent', s.textOnAccent, s.accent, 4.5],
    ['textOnGilt on reward', s.textOnGilt, s.reward, 4.5],
    ['danger on surface', s.danger, s.surface, 4.5],
    ['warning on surface', s.warning, s.surface, 4.5],
    ['success on surface', s.success, s.surface, 4.5],
    ['info on surface', s.info, s.surface, 4.5],
    ['hero on ground', st.hero, st.ground, 3],
    ['enemy on ground', st.enemy, st.ground, 3],
    ['telegraphWarn on ground', st.telegraphWarn, st.ground, 3],
    ['telegraphImpact on ground', st.telegraphImpact, st.ground, 3],
    ['coreThreat on ground', st.coreThreat, st.ground, 3],
    ['burning on ground', st.burning, st.ground, 3],
  ];
  it.each(aa)('contrast %s >= %#', (_n, fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it('hexToInt converts for Phaser', () => {
    expect(hexToInt('#0D1220')).toBe(0x0d1220);
  });
});
