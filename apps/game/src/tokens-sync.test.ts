import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tokens } from '@them/ui-tokens';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('Tailwind theme ↔ ui-tokens', () => {
  it('literal breakpoints match tokens.breakpoint', () => {
    for (const [k, v] of Object.entries(tokens.breakpoint)) {
      expect(css, `--breakpoint-${k}`).toContain(`--breakpoint-${k}: ${v}px;`);
    }
  });

  it('every --them-* var referenced by the theme exists in tokens.css', () => {
    const tokenCss = readFileSync(new URL('../../../packages/ui-tokens/src/tokens.css', import.meta.url), 'utf8');
    const used = new Set([...css.matchAll(/var\((--them-[a-z0-9-]+)\)/g)].map((m) => m[1]));
    const missing = [...used].filter((v) => !tokenCss.includes(`${v}:`));
    expect(missing).toEqual([]);
  });
});
