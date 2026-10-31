# THEM design direction: "The annotated manuscript"

Owner: Designer. Status: P1-05, approved for Phase 1 build. Tokens: `packages/ui-tokens`.

## The idea in two sentences

Every screen outside the stage is a page of a manuscript the Author is still writing: iron-gall ink
for the ground, vellum for the words, rubric red where the Author corrects the world, gilt where the
world rewards you, and hand-written marginalia where the Author comments on your choices. Inside the
stage the page becomes a quiet blotter so that only the living things and the danger carry color.

## Why this and not "dark fantasy"

The generic dark-fantasy template is black + gold + blackletter + stone textures + ember particles.
THEM's lore gives us something more specific to own:

| Lore fact (GDD §2) | Visual consequence |
| --- | --- |
| The Author writes worlds; bosses say they did what "was written". | Typography is the hero. Titles are set like a manuscript heading, not a logo slapped on art. |
| The Archive (อาร์ไคฟ์) keeps the record of every world. | Results and intel read like catalogued entries: ruled lines, folio numbers, entry layout. |
| The hub is The Margin (ขอบกระดาษ), space the Author never wrote. | Layouts keep a deliberate empty margin column. The UI literally lives in the margin of the page. |
| A hidden ink mark appears in every world. | One recurring mark (the "blot") is our only ornament. It appears once per screen, never as a pattern. |
| The last boss rewrites the rules of a level. | Later, UI itself can be "struck through" and rewritten by the Author. We reserve strike-through + red hand annotation for that voice from day one. |

## Palette (base)

| Name | Hex | Role |
| --- | --- | --- |
| Ink 900 | `#0D1220` | Page background. Blue-black iron-gall ink, not neutral black. |
| Ink 800 / 700 | `#141B2E` / `#1E2740` | Surfaces, raised surfaces. |
| Vellum 100 | `#EEEADF` | Primary text. 14.2:1 on surface. |
| Rubric 500 / 300 | `#B5352A` / `#F07A63` | Primary action fill / red text on ink. The Author's correction ink. |
| Gilt 400 | `#D9B25C` | Reward, grade S, rarity, keyboard focus. Used sparingly, like real gold leaf. |

Ink is blue, paper is warm, the two accents are the two historic manuscript inks (minium red and
gold leaf). There is no gradient anywhere in the UI. Light comes from contrast, not glow.

## Typography

| Role | Face | Why |
| --- | --- | --- |
| Display | **Trirong** (Cadson Demak, Google Fonts) | A high-contrast looped Thai serif with matching Latin, drawn for editorial and book use. It is literally a manuscript face in both scripts, which no Latin-only fantasy display can give us. Weights 400/600/800 + italic. |
| Text / UI | **IBM Plex Sans Thai Looped** | Looped Thai (with heads on letters) reads as more formal and premium than loopless Thai, and pairs with Plex Latin designed by the same family. Strong numerals for HUD, tabular figures, 4 weights. Clearly distinct from Trirong (sans vs serif). |
| Hand | **Charm** (Cadson Demak) | A Thai + Latin script face. Used only for the Author's voice: card drawbacks, intel notes, boss quotes. Never for labels, numbers or anything a player must parse under time pressure. |

Fallbacks: Noto Serif Thai / Noto Sans Thai Looped / Noto Sans Thai, then system. All three primary
faces have `thai` + `latin` subsets on Google Fonts and are loaded with `display=swap`.

Rules:

- Scale is a major third (1.25) from 16 px: 11, 12, 14, 16, 20, 25, 31, 39, 49, 61, 76.
- Thai needs vertical room for stacked marks: body line-height 1.65, UI 1.45, display 1.3, never
  below 1.2. Never letter-space Thai. Numerals may take `0.02em` in the HUD.
- Minimum size: 14 px for anything readable during play on mobile, 12 px only for static captions.
- Sentence case everywhere. No all-caps labels (Thai has no case, so all-caps creates a visual
  mismatch between languages).
- HUD numbers use `font-variant-numeric: tabular-nums` so timers and counters do not jitter.

## Layout concept: the folio

Outside the stage every screen is a folio with three columns: a **margin** (narrow, left on desktop,
top band on mobile) that holds navigation and the Author's annotations, the **text block** (the
content), and breathing space. Content is left-aligned (Thai and English both read left to right);
the only centered element is a grade or a title stamp.

```
Desktop 1280×720                          Mobile 390×844
+------+------------------------+-----+   +---------------------+
|margin| text block             |     |   | margin band (nav)   |
| nav  | heading (Trirong)      |     |   +---------------------+
| note | content, left aligned  |     |   | text block          |
|      |                        |     |   |                     |
|  ·   | primary action (rubric)|     |   | primary action      |
+------+------------------------+-----+   | (thumb zone)        |
                                          +---------------------+
```

## Principles laborers must follow

1. **One loud thing per screen.** The title on the menu, the three cards in the draft, the grade on
   results. Everything else is quiet vellum on ink.
2. **Ink, not glass.** No blur panels, no gradients, no neon glow, no drop shadows besides
   `--them-shadow-sheet`. Panels are sheets laid on a desk: flat fill, 1 px border, hard edge.
3. **Radius follows hierarchy:** 2 px chips, 4 px buttons and cards, 8 px modals, round only for the
   joystick and round icon buttons. Never a pill button.
4. **Red means the Author.** Rubric is for the primary action and for drawbacks/annotations. Danger
   states use `--them-color-semantic-danger` plus an icon, never rubric alone.
5. **Gilt is earned.** Only rewards, grade S, rarity edges and focus rings. If more than ~5% of a
   screen is gold, it is wrong.
6. **The hand speaks rarely.** Charm appears at most in two places per screen.
7. **Stage is quiet.** In-stage colors come from `tokens.color.stage` only and follow
   `docs/design/readability.md`.
8. **Motion is a pen stroke.** UI entrances use `--them-motion-easing-ink`; one ceremony moment per
   screen at most (card reveal, grade stamp). Respect `prefers-reduced-motion`: replace movement with
   a 120 ms opacity change.
9. **Focus is always visible** (`--them-shadow-focus`, gilt ring with ink gap) on every interactive
   element, keyboard and gamepad.
10. **No raw hex, px font sizes or ad-hoc spacing in components.** Use `var(--them-…)` or the Tailwind
    theme mapped to the same tokens.

## Accessibility baseline (verified)

Computed with WCAG 2.x relative luminance; enforced by `packages/ui-tokens/src/tokens.test.ts`.

| Pair | Ratio | Target |
| --- | --- | --- |
| text (vellum 100) on bg / surface / raised | 15.5 / 14.2 / 12.3 | AAA 7 |
| textMuted on raised | 8.5 | AA 4.5 |
| textSubtle on raised | 5.1 | AA 4.5 |
| accentText (rubric 300) on surface | 6.3 | AA 4.5 |
| reward (gilt 400) on surface | 8.5 | AA 4.5 |
| vellum on rubric 500 button | 5.0 | AA 4.5 |
| ink 900 on gilt button | 9.3 | AA 4.5 |
| success / warning / danger / info on surface | 9.0 / 10.2 / 5.3 / 8.8 | AA 4.5 |
| stage entities and telegraphs on ground | 3.8 to 10.2 | non-text 3:1 |

Color-vision: the stage role groups (hero/ally/enemy/elite; telegraph warn/impact/core-threat/burning/
enemy; HP/Core/XP; wood/stone/burning; UI status colors) were simulated for protanopia, deuteranopia
and tritanopia (Machado 2009, full severity). Every pair inside a group stays at least 20 ΔE76 apart
except telegraph impact vs enemy under tritanopia (15.8), which is resolved by shape: telegraphs are
ground-plane outlines and fills, enemies are outlined solid bodies, and impact frames add a hatch.
Shape and pattern carry every meaning first; color is the second channel.

## Consumption

- CSS: `import '@them/ui-tokens/tokens.css'` once in the app entry. It `@import`s the Google Fonts.
- TS/Phaser: `import { tokens, hexToInt } from '@them/ui-tokens'`.
- Tailwind: map `theme.colors`, `fontFamily`, `spacing`, `borderRadius`, `zIndex`, `screens` to the
  CSS variables (Engineer, P1-04).
- After editing `src/index.ts`, run `pnpm --filter @them/ui-tokens gen:css`. A test fails on drift.
