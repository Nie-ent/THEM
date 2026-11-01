# Screen specs

| Spec | Ticket | Screen |
| --- | --- | --- |
| [menu.md](menu.md) | P1-08 | Title / main menu with language toggle |
| [hud.md](hud.md) | P1-08 (+ P1-04 joystick) | In-stage HUD, includes the orientation decision |
| [card-draft.md](card-draft.md) | P1-08 | Level-up card draft (1 of 3, rerolls, drawbacks) |
| [prep.md](prep.md) | P1-08 | Prep phase: timer, wave intel, build menu, call wave early |
| [pause-settings.md](pause-settings.md) | P1-08 | Pause and settings |
| [results.md](results.md) | P1-08 | Results: score breakdown by GDD §12 multipliers, grade |
| [camp.md](camp.md) | P2-09 | Camp: character / stats / class, traits, gear + enhance, heroes, summon, titles; results rewards |

Flow: menu → run start → prep ⇄ wave (card draft interrupts a wave on level-up) → results → menu.
Pause can open from prep, wave and card draft.

## Shared conventions

- Viewports: **desktop 1280×720**, **mobile 390×844 portrait**. Every spec gives both.
- Tokens: all values are `--them-*` CSS variables from `packages/ui-tokens`. Names below drop the
  `--them-` prefix for brevity (`space-4` means `var(--them-space-4)`).
- i18n: every string is a key. Thai strings are typically 0.9–1.3× the English width in these faces
  but are **taller** (stacked marks), and Thai has no spaces, so wrap with `Intl.Segmenter` word
  boundaries. Elements marked **FLEX** must grow or wrap and must not truncate; elements marked
  **FIXED** are icons/numbers whose width does not depend on language.
- Numbers: format with `Intl.NumberFormat(locale)`; times as `m:ss` with tabular numerals.
- Keyboard: every action reachable by keyboard; Esc always backs out or pauses. Focus ring is
  `shadow-focus`.
- Motion: ease `motion-easing-ink`, one ceremony moment per screen; `prefers-reduced-motion`
  replaces movement with a `motion-duration-fast` fade.
- Test hooks: every interactive element has `data-testid` named in the spec, for P1-10 e2e.
