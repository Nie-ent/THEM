# In-stage readability rules

Owner: Designer. Applies to P1-09 (placeholder art + VFX), P1-04 (renderer, camera, input) and the
HUD in P1-08. Colors: `tokens.color.stage.*` only (Phaser: `hexToInt(tokens.color.stage.enemy)`).

The stage must stay readable with 500 enemies on desktop and 300 on a phone. The player must always
be able to answer, in under half a second: **where am I, what is about to hit me, what is about to hit
the Core.** Everything else is secondary and gets quieter as the screen fills.

## 1. Visual priority (draw order and loudness)

| Rank | Layer | Rule |
| --- | --- | --- |
| 1 | Hero | Brightest object on screen. Never hidden: drawn above enemies, with a ring. |
| 2 | Telegraphs aimed at hero or Core | Ground-plane shapes, drawn under units but above ground and structures. |
| 3 | Enemy bodies and enemy projectiles | Saturated warm red family, dark outline. |
| 4 | Core, structures, allies | Cool or neutral hues; never red. |
| 5 | Pickups (XP, wood, stone) | Small, low motion, fade in clusters. |
| 6 | Damage numbers, hit sparks | Capped, see section 6. First thing to drop under load. |
| 7 | Ground | Desaturated, low contrast texture (`ground` / `groundAlt`, grid only during prep). |

Draw order bottom to top: ground, grid (prep), telegraphs, structures + Core, pickups, enemies,
allies, hero, projectiles, damage numbers, edge indicators.

## 2. Camera and scale

- Desktop 1280×720 shows about 30×17 world tiles of 40 px at zoom 1. Phone portrait 390×844 uses the
  same world width as desktop height (about 17 tiles across) so threats are not cut off at the sides.
- Hero base size: 28 px (desktop), never below 24 px on screen at any zoom.
- Minimum on-screen size for any enemy: 14 px. Minimum for an enemy projectile: 8 px plus outline.

## 3. Outline rule

Every unit and projectile has a 2 px outline in `stage.outline` (`#0A0C12`) drawn as one extra
filled shape behind it (cheap; no shader). This separates bodies from the ground and from each
other in dense hordes. Exception: telegraphs and pickups have no outline.

## 4. Silhouettes per role

Each role has a unique **shape**, so the role reads with color off. Sizes are diameters at zoom 1.
Enemies all face their movement direction with a notch (a small triangle cut-out) on the front.

| Role | Shape | Size | Fill | Extra cue |
| --- | --- | --- | --- | --- |
| Hero | Circle with a vellum ring (3 px, 4 px gap) | 28 | `hero` | Facing wedge; ring flashes `damageTaken` when hit. |
| AI hero (ally) | Rounded square | 24 | `ally` | Star count as pips above (1 or 2). |
| Raider | Small triangle, point forward | 16 | `enemy` | None. The baseline horde. |
| Torch-bearer | Triangle with a flame dot on the tip | 16 | `enemy` | Flame dot `burning`, flickers at 4 Hz (2-frame swap, not a particle). |
| Brute (armored elite) | Large hexagon | 30 | `enemyElite` with 3 px `enemy` rim | Inner plate lines (2 strokes). Reads "armored". |
| Slinger (ranged) | Diamond | 16 | `enemy` | A hollow ring around it while winding up a shot (see 5). |
| Wolf rider (fast, ignores aggro) | Long chevron (arrow head), 2:1 | 22×11 | `enemy` | Short motion streak behind (2 lines). Fastest thing on screen. |
| War drummer (buffs nearby) | Circle with 4 radial ticks | 20 | `enemy` | Pulsing aura ring every beat (radius 120, 15% alpha, `enemy`). Buffed enemies get a 1 px inner tick. |
| Mini-boss | Large shape of its base role ×2.2, plus a crown of 3 spikes | 44–60 | `enemyElite` + `enemy` rim | HP bar above (60 px wide). Name plate on spawn for 2 s. |
| Boss (Varkul) | Octagon with a ring of 8 notches | 96 | `enemyElite` + `enemy` rim | Boss HP bar is HUD, top center. The ink "blot" mark on the body (lore, GDD §2). |
| Core | Square rotated 45° inside a circle | 56 | `core` | HP ring around it. Pulses `coreThreat` when targeted. |
| Wood wall / tower | Square with plank lines | 40 | `structureWood` | Grain lines distinguish from stone even in grayscale. |
| Stone wall / tower | Square with brick offset pattern | 40 | `structureStone` | Brick pattern. |
| Fire-pit trap | Ground circle, dashed | 40 | `burning` at 30% alpha | Only visible rim when idle. |
| Archer tower | Square with a circle on top | 40 | wood or stone | Range ring only while selected or during prep. |
| XP orb | Small diamond | 6 | `xpOrb` | No outline. Merges into a bigger orb when 20+ overlap. |
| Wood / stone pickup | Small square / small triangle | 8 | `pickupWood` / `pickupStone` | Different shapes, same as HUD icons. |

Shape test for P1-09: take a screenshot, convert to grayscale, and a reviewer must still name every
role. Do it with 200 mixed enemies on screen.

## 5. Danger and telegraph language

Telegraphs are always **on the ground plane** (under units) so they are never confused with bodies.

| Phase | Look | Timing |
| --- | --- | --- |
| Wind-up | Dashed outline (8 px dash, 6 px gap) in `telegraphWarn`, 20% fill. A fill sweeps from the origin outward showing time left. | At least `motion.duration.telegraphMin` (700 ms). Boss attacks 1000–1500 ms. |
| Commit | Outline turns solid `telegraphImpact`, fill to 45%, 45° hatch lines appear. | Last `telegraphCommit` (300 ms). Shape no longer moves. |
| Impact | One frame white flash on the area, then a 150 ms fading ring. | 1 frame + 150 ms. |

Shapes: circle (slam), rectangle from the attacker (charge, line), cone (sweep), ring (shockwave with a
safe center drawn as no fill). The shape of the area is exactly the hitbox. Never smaller.

Slinger and ranged enemies: a thin line (1 px, `telegraphWarn`, 50%) from slinger to target for
400 ms before firing. Max 12 aim lines on screen; beyond that only the nearest 12 to the hero draw.

### Attacks aimed at the Core

The player is often away from base (GDD §3 core tension), so Core threats must be readable from
off-screen.

1. The telegraph uses `coreThreat` (violet) instead of `telegraphWarn`, with a **double** outline.
2. The Core itself pulses a violet ring (2 Hz) for the whole wind-up.
3. If the Core is off-screen, an **edge arrow** in `coreThreat` sits at the screen edge pointing to
   the Core, with a countdown arc around it. Plus HUD Core HP bar flashes its violet frame.
4. Optional placeholder bleep: two low tones.

Shape, position and the arrow carry it; violet is the color channel.

### Spawn directions

At wave start, each spawn side shows an edge chevron group (3 chevrons, `enemy`) for 2 s, matching
the wave intel arrows from prep, so the player connects the prediction with the event.

## 6. Burning-structure state

Torch-bearers set wood on fire (World 1 rule).

- Stage 1 (ignited): 3 flame tongues (triangles) on the top edge, `burning`, 2-frame flicker 6 Hz.
- Stage 2 (below 50% HP while burning): the structure fill darkens 30% and flames double.
- A small burning icon (flame triangle) appears in the structure's slot on the minimap / build grid
  and in the HUD resources row as a count "N burning".
- Stone never burns. When a torch-bearer hits stone, show a 1-frame spark only, to teach the rule.
- Burnt-out wood leaves a charred square outline (`slotBlocked`) for the rest of the wave.

## 7. Damage numbers that do not flood the screen

- Show numbers only for: hero's hits on elites, mini-bosses and the boss; all crits; damage the hero
  takes; heals. Regular horde hits show **no number**, only a 2-frame white hit flash on the enemy.
- Hard cap: 24 numbers on screen. When full, merge: a new number on a target that already shows one
  adds to it and refreshes its timer instead of spawning.
- Size 14 px normal, 18 px crit (`damageCrit`, gilt), 16 px damage taken (`damageTaken`). Font:
  IBM Plex Sans Thai Looped bold, tabular numerals, 2 px outline. Pre-render digit glyphs to a bitmap
  font (Phaser BitmapText) so numbers cost no layout.
- Motion: rise 16 px over 600 ms, fade the last 200 ms. No bounce, no scale-pop except crits (110%).
- Setting: "Damage numbers: All / Important (default) / Off" in pause/settings.

## 8. Load shedding

When live enemies pass 250 (phone) or 400 (desktop), drop in this order: hit sparks, then pickup
sparkle, then damage numbers except damage taken, then drummer aura alpha to 8%. Never drop
telegraphs, outlines, the hero ring or edge arrows.

## 9. Touch zones (mobile)

Portrait 390×844 is the target. Gameplay does **not** force landscape (decision in
`screens/hud.md`).

- **Floating joystick** in the lower 45% of the screen, left or right half by setting (default:
  wherever the thumb lands). Base 128 px, knob 56 px, dead zone 12%. It appears where the thumb
  touches, so it is never in a fixed spot that the hero walks under.
- The camera keeps the hero at **38% from the top** in portrait (not center), so the thumb, which
  lives in the bottom third, never covers the hero or the area in front of it.
- No HUD element in the bottom 200 px except the joystick and the pause button lives top right.
  Exception: in prep (no movement) the build tray uses the bottom sheet.
- When a touch is down, threats under the thumb (within 64 px of the touch point) get an edge
  marker at the nearest visible edge of the thumb area, so nothing hits from behind your finger.
- Minimum target 44×44 px, 8 px apart. Safe-area insets (`env(safe-area-inset-*)`) respected.

## 10. Checks QA and the designer run on P1-09

- [ ] Grayscale screenshot with 200 mixed enemies: every role is nameable.
- [ ] Protan / deutan / tritan simulation (Chrome DevTools > Rendering > Emulate vision deficiencies):
  telegraph wind-up, commit and Core threat are distinguishable from each other and from enemies.
- [ ] Hero is findable within 0.5 s in a 500-enemy screenshot (ask someone who has not seen it).
- [ ] Every telegraph is visible for at least 700 ms before impact; area equals hitbox.
- [ ] Off-screen Core attack shows the edge arrow and HUD flash.
- [ ] No more than 24 damage numbers at once.
- [ ] On 390×844 with a thumb on the joystick, the hero and 3 tiles ahead are visible.
