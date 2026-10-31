/**
 * THEM design tokens, owned by the Designer (ticket P1-05).
 *
 * Direction: "the annotated manuscript". Outside the stage the UI is a page of iron-gall ink and
 * vellum that the Author has rubricated in red and annotated by hand in the margin. Inside the
 * stage the ground is a quiet, desaturated "blotter" so that entities, danger and telegraphs are
 * the only saturated things on screen. See docs/design/direction.md and docs/design/readability.md.
 *
 * Rules for consumers:
 * - React/Tailwind: use the CSS custom properties in ./tokens.css (`var(--them-…)`), never raw hex.
 * - Phaser: use `tokens.color.stage.*` through `hexToInt()`; never raw hex in scene code.
 * - Keep this file and tokens.css in sync with `pnpm --filter @them/ui-tokens gen:css`
 *   (a test fails when they drift).
 */

/* ------------------------------------------------------------------------------------------ */
/* Raw palette. Components should prefer the semantic layer below.                            */
/* ------------------------------------------------------------------------------------------ */

const ink = {
  /** Page background: iron-gall ink, blue-black, never neutral grey. */
  900: '#0D1220',
  /** Default surface (panels, cards). */
  800: '#141B2E',
  /** Raised surface (hover, selected row, modal body). */
  700: '#1E2740',
  /** Borders, dividers, disabled fills. */
  600: '#2C3756',
  /** Strong borders, scrollbar thumbs, inactive icons. */
  500: '#46527A',
} as const;

const vellum = {
  /** Primary text on ink. 14.2:1 on ink-800. */
  100: '#EEEADF',
  /** Secondary text. 9.8:1 on ink-800. */
  300: '#C9C4B4',
  /** Tertiary text, captions, placeholder. 5.9:1 on ink-800 (AA body). */
  500: '#9C978A',
} as const;

/** Rubric: the red ink scribes used for headings and that the Author uses to correct a world. */
const rubric = {
  /** Text/icon red on ink. 6.3:1 on ink-800. */
  300: '#F07A63',
  /** Fill red for primary buttons with vellum-100 text (5.0:1). Not for text on ink. */
  500: '#B5352A',
} as const;

/** Gilt: illumination gold. Rewards, grade S, rare drops, focus ring. */
const gilt = {
  /** Text/icon gold on ink. 8.5:1 on ink-800. */
  400: '#D9B25C',
  /** Gilt edge lines and pressed state. Decorative only (fails AA as text). */
  600: '#9E7A2E',
} as const;

/* ------------------------------------------------------------------------------------------ */

export const tokens = {
  color: {
    ink,
    vellum,
    rubric,
    gilt,

    /** Semantic UI layer for everything outside the stage and for HUD chrome. */
    semantic: {
      bg: ink[900],
      surface: ink[800],
      surfaceRaised: ink[700],
      /** Translucent scrim behind modals over the running stage. */
      scrim: 'rgba(13, 18, 32, 0.72)',
      /** HUD plate behind numbers on the stage (keeps text >= 4.5:1 over any ground). */
      hudPlate: 'rgba(13, 18, 32, 0.78)',
      border: ink[600],
      borderStrong: ink[500],
      text: vellum[100],
      textMuted: vellum[300],
      textSubtle: vellum[500],
      textOnAccent: vellum[100],
      textOnGilt: ink[900],
      accent: rubric[500],
      accentText: rubric[300],
      reward: gilt[400],
      rewardEdge: gilt[600],
      focus: gilt[400],
      /** Hand-written marginalia (the Author's notes, drawbacks). */
      annotation: rubric[300],
      success: '#4FD1A5',
      warning: '#F2C14E',
      danger: '#F0604D',
      info: '#9DB8FF',
      disabledText: vellum[500],
      disabledFill: ink[600],
    },

    /** HUD meters. Each meter also differs by position and shape, never by color alone. */
    hud: {
      hpHero: '#E8484A',
      hpCore: '#6FB7FF',
      xp: '#E9C46A',
      /** Meter track behind the fill. */
      track: ink[600],
      /** Recently lost HP ("ghost" segment that drains after 400 ms). */
      loss: vellum[100],
      resourceWood: '#A8793F',
      resourceStone: '#9AA3B2',
    },

    /** Grades on the results screen (GDD §12). Grade letter is always printed too. */
    grade: {
      S: gilt[400],
      A: vellum[100],
      B: vellum[300],
      C: vellum[500],
    },

    /**
     * In-stage palette for Phaser. Ground is quiet; only entities and danger are saturated.
     * Distinguishability was checked under protan/deutan/tritan simulation (Machado 2009,
     * full severity): every pair inside a role group differs by >= 20 ΔE76. Shape and pattern
     * still carry the meaning (docs/design/readability.md); color is the second channel.
     */
    stage: {
      ground: '#33322A',
      groundAlt: '#2C2B22',
      /** Build-grid lines and slot outlines during prep. */
      grid: '#4A483C',
      slotFree: vellum[300],
      slotBlocked: '#5A5446',
      /** 2 px dark outline drawn under every unit and projectile. */
      outline: '#0A0C12',
      hero: '#F4F1E6',
      ally: '#5CC8FF',
      core: '#6FB7FF',
      enemy: '#EE5B45',
      /** Armor plate fill for elites (brute) and mini-boss, always with an enemy-colored rim. */
      enemyElite: '#7A1E2A',
      enemyProjectile: '#EE5B45',
      allyProjectile: '#5CC8FF',
      /** Telegraph wind-up: the area that will be hit. Drawn as dashed outline + 20% fill. */
      telegraphWarn: '#FFF3A8',
      /** Telegraph final 300 ms + impact frame. Solid outline + 45% fill. */
      telegraphImpact: '#FF5CC8',
      /** Any attack that targets the Core. Always paired with the edge arrow and Core ring. */
      coreThreat: '#9D72FF',
      burning: '#FF9A1A',
      structureWood: '#A8793F',
      structureStone: '#9AA3B2',
      xpOrb: '#E9C46A',
      pickupWood: '#A8793F',
      pickupStone: '#9AA3B2',
      damageNormal: vellum[100],
      damageCrit: gilt[400],
      damageTaken: '#E8484A',
      heal: '#4FD1A5',
    },
  },

  font: {
    family: {
      /** Display: titles, card names, grade letters. Thai + Latin, looped high-contrast serif. */
      display: "'Trirong', 'Noto Serif Thai', Georgia, serif",
      /** Text: body, buttons, HUD labels. Thai looped + Latin from one family. */
      text: "'IBM Plex Sans Thai Looped', 'Noto Sans Thai Looped', 'Noto Sans Thai', system-ui, sans-serif",
      /** Hand: the Author's marginalia only (drawbacks, intel notes, flavor). Never for UI labels. */
      hand: "'Charm', 'Trirong', cursive",
    },
    /** Google Fonts CSS2 URL. Load once in apps/game index.html. */
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Charm:wght@400;700&family=IBM+Plex+Sans+Thai+Looped:wght@400;500;600;700&family=Trirong:ital,wght@0,400;0,600;0,800;1,400&display=swap',
    weight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      display: 800,
    },
    /** Thai needs room for stacked vowels and tone marks above and below the line. */
    lineHeight: {
      tight: 1.2,
      display: 1.3,
      ui: 1.45,
      body: 1.65,
    },
    letterSpacing: {
      normal: '0',
      /** Only for Latin numerals in the HUD. Never letter-space Thai. */
      numeric: '0.02em',
    },
  },

  /** Type scale in px, ratio 1.25 (major third) from a 16 px base. */
  size: {
    '2xs': 11,
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 25,
    '2xl': 31,
    '3xl': 39,
    '4xl': 49,
    '5xl': 61,
    '6xl': 76,
  },

  /** 4 px base grid. */
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
    20: 80,
  },

  /** Radii are deliberately small: cut paper, not pills. Radius follows hierarchy. */
  radius: {
    none: 0,
    /** Inputs, chips, meter ends. */
    sm: 2,
    /** Buttons, cards. */
    md: 4,
    /** Modals, sheets. */
    lg: 8,
    /** Round icon buttons and the joystick. */
    full: 9999,
  },

  /** Layer order for the React overlay above the Phaser canvas. */
  z: {
    stage: 0,
    stageOverlay: 10,
    hud: 100,
    joystick: 150,
    toast: 200,
    drawer: 300,
    modal: 400,
    tooltip: 500,
    system: 900,
  },

  motion: {
    duration: {
      instant: 0,
      fast: 120,
      base: 200,
      slow: 320,
      /** Card draft reveal, results grade stamp. */
      ceremony: 640,
      /** HP ghost segment delay before draining. */
      hpGhostDelay: 400,
      /** Minimum telegraph wind-up a player must see before a hit lands. */
      telegraphMin: 700,
      /** Final "commit" phase of a telegraph, drawn in telegraphImpact. */
      telegraphCommit: 300,
    },
    easing: {
      standard: 'cubic-bezier(0.2, 0, 0, 1)',
      enter: 'cubic-bezier(0, 0, 0, 1)',
      exit: 'cubic-bezier(0.3, 0, 1, 1)',
      /** Ink stroke: slow start, fast finish, like a pen committing to paper. */
      ink: 'cubic-bezier(0.7, 0, 0.2, 1)',
    },
  },

  /** Min-width breakpoints in px. Design viewports: mobile 390×844, desktop 1280×720. */
  breakpoint: {
    sm: 480,
    md: 768,
    lg: 1024,
    xl: 1280,
  },

  /** Minimum interactive target sizes in px. */
  target: {
    min: 44,
    comfortable: 48,
    joystick: 128,
  },

  shadow: {
    /** Panels float on ink with a hard offset edge, like a sheet laid on a desk. */
    sheet: '0 1px 0 rgba(238, 234, 223, 0.06) inset, 0 8px 24px rgba(0, 0, 0, 0.45)',
    focus: '0 0 0 2px #0D1220, 0 0 0 4px #D9B25C',
  },
} as const;

export type Tokens = typeof tokens;

/** Convert a `#RRGGBB` token to the integer Phaser expects (0xRRGGBB). */
export function hexToInt(hex: string): number {
  return Number.parseInt(hex.slice(1, 7), 16);
}
