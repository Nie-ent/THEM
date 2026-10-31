/**
 * Generates src/tokens.css from src/index.ts so the two entry points never drift.
 * Run: pnpm --filter @them/ui-tokens gen:css   (Node 22 strips the types natively.)
 * The test in src/tokens.test.ts fails if tokens.css differs from this output.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tokens } from '../src/index.ts';

const PX_GROUPS = new Set(['size', 'space', 'radius', 'breakpoint', 'target']);
const MS_GROUPS = new Set(['duration']);

function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

export function toCssVars(): string[] {
  const lines: string[] = [];
  const walk = (node: unknown, path: string[], group: string): void => {
    // The font URL is emitted as an @import instead (it contains ';', which is invalid in a var).
    if (path.join('-') === 'font-google-fonts-url') return;
    if (node !== null && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, [...path, kebab(k)], path.length === 0 ? k : group);
      return;
    }
    const last = path[path.length - 2] ?? '';
    let value = String(node);
    if (typeof node === 'number') {
      if (PX_GROUPS.has(group)) value = node >= 9999 ? '9999px' : `${node}px`;
      else if (MS_GROUPS.has(last)) value = `${node}ms`;
    }
    lines.push(`  --them-${path.join('-')}: ${value};`);
  };
  walk(tokens, [], '');
  return lines;
}

export function renderCss(): string {
  return [
    '/* GENERATED from src/index.ts by scripts/gen-css.ts. Do not edit by hand. */',
    '/* Fonts: Trirong (display), IBM Plex Sans Thai Looped (text), Charm (hand). See docs/design/direction.md. */',
    `@import url('${tokens.font.googleFontsUrl}');`,
    '',
    ':root {',
    ...toCssVars(),
    '}',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = new URL('../src/tokens.css', import.meta.url);
  writeFileSync(out, renderCss());
  console.log(`wrote ${fileURLToPath(out)}`);
}
