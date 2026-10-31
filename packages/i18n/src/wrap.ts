/**
 * Thai has no spaces between words, so naive wrapping either overflows or breaks mid-word.
 * We segment with `Intl.Segmenter` (word granularity, ICU dictionary for Thai) and greedily
 * pack segments into lines no wider than `width` as reported by `measure`.
 *
 * `measure` is injected so the same function works for Phaser text (canvas measureText),
 * DOM, or tests (character count).
 */
export type Measure = (text: string) => number;

const segmenterCache = new Map<string, Intl.Segmenter>();

function segmenter(locale: string): Intl.Segmenter {
  let s = segmenterCache.get(locale);
  if (!s) {
    s = new Intl.Segmenter(locale, { granularity: 'word' });
    segmenterCache.set(locale, s);
  }
  return s;
}

export function segmentWords(text: string, locale = 'th'): string[] {
  const out: string[] = [];
  for (const seg of segmenter(locale).segment(text)) out.push(seg.segment);
  return out;
}

/** Split a single over-long segment by grapheme so it can never overflow on its own. */
function splitGraphemes(word: string, width: number, measure: Measure, locale: string): string[] {
  const g = new Intl.Segmenter(locale, { granularity: 'grapheme' });
  const lines: string[] = [];
  let cur = '';
  for (const { segment } of g.segment(word)) {
    if (cur && measure(cur + segment) > width) {
      lines.push(cur);
      cur = segment;
    } else cur += segment;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function wrapThai(text: string, width: number, measure: Measure, locale = 'th'): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let cur = '';
    for (const seg of segmentWords(paragraph, locale)) {
      const candidate = cur + seg;
      if (measure(candidate) <= width) {
        cur = candidate;
        continue;
      }
      if (cur.trim()) lines.push(cur.trimEnd());
      const trimmed = seg.trimStart();
      if (measure(trimmed) > width) {
        const parts = splitGraphemes(trimmed, width, measure, locale);
        lines.push(...parts.slice(0, -1));
        cur = parts[parts.length - 1] ?? '';
      } else cur = trimmed;
    }
    lines.push(cur.trimEnd());
  }
  return lines;
}
