/**
 * QA gate: static hygiene rules from CLAUDE.md.
 * - Rule 4: no raw colours (#hex, 0xRRGGBB, rgb()/hsl()) in apps/game/src outside token files.
 * - Rule 2 / stack: packages/core never imports DOM, Phaser, React, i18n or app code, and never
 *   references browser globals.
 * Known violations are listed in ALLOW with their docs/qa/findings.md id so they stay visible; the
 * test fails if a listed violation disappears (remove it from ALLOW) or a new one appears.
 */
import { describe, expect, it } from 'vitest';
import { files, lineOf, read, rel, stripComments } from './source-scan';

/** Files that are allowed to hold raw colour values (token sources). */
const TOKEN_FILES = [/^packages\/ui-tokens\//, /(^|\/)tokens?[-.][^/]*\.(ts|css)$/];

/** Known findings: `file:line-text` substring → finding id. */
const ALLOW_COLOUR: Record<string, string> = {
  'apps/game/src/game/StageScene.ts: 0xffffff': 'QA-P1-10-002',
};

const COLOUR_RE = /#[0-9a-fA-F]{3,8}\b|\b0x[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|\b(?:rgba?|hsla?)\s*\(/g;

describe('hygiene (QA gate)', () => {
  it('no raw colours in apps/game/src outside token files', () => {
    const found: string[] = [];
    for (const f of files('apps/game', ['.ts', '.tsx', '.css', '.html'])) {
      const r = rel(f);
      if (TOKEN_FILES.some((re) => re.test(r)) || /\.test\.tsx?$/.test(r) || r.includes('/node_modules/')) continue;
      if (!r.startsWith('apps/game/src/') && !r.endsWith('index.html')) continue;
      const src = stripComments(read(f));
      COLOUR_RE.lastIndex = 0;
      for (let m = COLOUR_RE.exec(src); m; m = COLOUR_RE.exec(src)) {
        // HTML entities like &#91; are not colours.
        if (src[m.index - 1] === '&') continue;
        found.push(`${r}: ${m[0]}@${lineOf(src, m.index)}`);
      }
    }
    const isAllowed = (s: string) => Object.keys(ALLOW_COLOUR).some((k) => s.startsWith(k.split(': ')[0]!) && s.includes(k.split(': ')[1]!));
    expect(found.filter((s) => !isAllowed(s))).toEqual([]);
    // Stale allow-list entries mean a finding was fixed: drop it from ALLOW_COLOUR and close the finding.
    const stale = Object.entries(ALLOW_COLOUR).filter(([k]) => !found.some((s) => s.startsWith(k.split(': ')[0]!) && s.includes(k.split(': ')[1]!)));
    expect(stale.map(([k, id]) => `${id} fixed? ${k}`)).toEqual([]);
  });

  it('packages/core imports nothing platform-specific', () => {
    const banned = /^(phaser|react|react-dom|react-i18next|i18next|@them\/i18n|@them\/ui-tokens|@them\/game|node:|fs$|path$|http|worker_threads)/;
    const bad: string[] = [];
    for (const f of files('packages/core/src', ['.ts'])) {
      const src = stripComments(read(f));
      const re = /\b(?:import|export)\b[^'"`;]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g;
      for (let m = re.exec(src); m; m = re.exec(src)) {
        const spec = m[1] ?? m[2] ?? m[3] ?? m[4]!;
        if (banned.test(spec) || spec.includes('apps/')) bad.push(`${rel(f)}:${lineOf(src, m.index)} imports ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('packages/core references no DOM / wall-clock globals', () => {
    const re = /\b(window|document|navigator|localStorage|sessionStorage|requestAnimationFrame|HTMLElement|HTMLCanvasElement|performance\.now|Date\.now|new\s+Date|Math\.random|setTimeout|setInterval)\b/g;
    const bad: string[] = [];
    for (const f of files('packages/core/src', ['.ts'])) {
      const src = stripComments(read(f)).replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, (m) => ' '.repeat(m.length));
      for (let m = re.exec(src); m; m = re.exec(src)) bad.push(`${rel(f)}:${lineOf(src, m.index)}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });

  it('packages/core package.json depends only on @them/content', () => {
    const pkg = JSON.parse(read(`${files('packages/core', ['package.json'])[0]}`)) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {}).filter((d) => d !== '@them/content')).toEqual([]);
  });
});
