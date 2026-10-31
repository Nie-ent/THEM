import { describe, expect, it } from 'vitest';
import { segmentWords, wrapThai } from '../src/wrap';

const len = (s: string) => [...s].length;

describe('wrapThai', () => {
  it('segments Thai into words', () => {
    const words = segmentWords('ทุ่งเลือดการ์รอธ');
    expect(words.length).toBeGreaterThan(1);
    expect(words.join('')).toBe('ทุ่งเลือดการ์รอธ');
  });

  it('never exceeds width and preserves text', () => {
    const text = 'ผู้เล่นบังคับแค่การเคลื่อนที่ ผู้กล้าโจมตีอัตโนมัติ ศัตรูดรอปประสบการณ์และทรัพยากร';
    const lines = wrapThai(text, 12, len);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(len(l)).toBeLessThanOrEqual(12);
    expect(lines.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
  });

  it('breaks between words, not inside them, when possible', () => {
    const lines = wrapThai('สวัสดีครับ', 7, len);
    expect(lines).toEqual(['สวัสดี', 'ครับ']);
  });

  it('wraps English on spaces', () => {
    expect(wrapThai('hello big world', 9, len, 'en')).toEqual(['hello big', 'world']);
  });

  it('hard-splits a segment longer than width', () => {
    const lines = wrapThai('aaaaaaaaaa', 4, len, 'en');
    expect(lines).toEqual(['aaaa', 'aaaa', 'aa']);
  });
});
