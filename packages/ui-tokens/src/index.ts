/**
 * @them/ui-tokens — PLACEHOLDER STUB written by the Engineer (P1-01).
 *
 * The Designer owns this package (P1-05) and REPLACES every value below. Only the shape
 * (top-level groups: color, font, space, radius, z, motion) is a contract the app relies on;
 * the designer may add keys freely. Consumers import tokens only through this file or
 * `./tokens.css` (CSS custom properties prefixed `--them-`).
 *
 * Values are deliberately neutral greys so nobody mistakes them for the real palette.
 */
export const tokens = {
  color: {
    bg: '#1a1a1a',
    surface: '#262626',
    surfaceRaised: '#333333',
    text: '#f2f2f2',
    textMuted: '#a6a6a6',
    accent: '#bfbfbf',
    danger: '#d94c4c',
    warning: '#d9a64c',
    success: '#4cd97a',
    // in-stage placeholder colours (numbers, for Phaser fills)
    stage: {
      ground: 0x202020,
      grid: 0x2c2c2c,
      core: 0x8080ff,
      hero: 0xffffff,
      ally: 0x80c0ff,
      enemy: 0xd94c4c,
      elite: 0xff8040,
      boss: 0xff40c0,
      projectile: 0xffffaa,
      enemyProjectile: 0xff6060,
      wood: 0x9c6b3c,
      stone: 0x9a9a9a,
      tower: 0x60a060,
      trap: 0xc08030,
      fire: 0xff7a1a,
      telegraph: 0xff3030,
      xp: 0x60e0ff,
      hpBar: 0x4cd97a,
      hpBarBg: 0x401010,
    },
  },
  font: {
    body: "system-ui, 'Noto Sans Thai', sans-serif",
    display: "system-ui, 'Noto Sans Thai', sans-serif",
    mono: 'ui-monospace, monospace',
    size: { xs: '12px', sm: '14px', md: '16px', lg: '20px', xl: '28px' },
  },
  space: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px', xxl: '32px' },
  radius: { sm: '4px', md: '8px', lg: '12px', pill: '999px' },
  z: { stage: 0, hud: 10, overlay: 20, modal: 30, toast: 40 },
  motion: { fast: '120ms', base: '200ms', slow: '320ms', easing: 'cubic-bezier(0.2, 0, 0, 1)' },
} as const;

export type Tokens = typeof tokens;
