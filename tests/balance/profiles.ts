/**
 * QA reference profiles for progression balance (P2 review). Built with the public @them/meta API
 * where an API exists (EXP, stats, traits, class, gear grant/equip, titles); enhancement level,
 * hero stars/levels and owned gacha heroes are written straight into the profile, because rolling
 * for them is not what this measures. Every profile is schema-validated.
 */
import { content } from '../../packages/content/src/index';
import {
  Profile, allocateStats, allocateTrait, equipGear, grantExp, grantGear, heroLevelCap, newProfile, seededRolls,
  setClass, traitBlock, unlockTitles, equipTitle, type StatId,
} from '../../packages/meta/src/index';

const env = () => ({ now: () => 1_800_000_000_000, rolls: seededRolls(7) });

function toLevel(p: Profile, level: number): Profile {
  let total = 0;
  for (let l = 1; l < level; l++) total += content.meta.globalLevel.expToNext[l - 1]!;
  return grantExp(p, content, total).profile;
}

function spreadStats(p: Profile, weights: Partial<Record<StatId, number>>): Profile {
  const pts = p.unspentStatPoints;
  const sum = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0);
  const add: Partial<Record<StatId, number>> = {};
  let used = 0;
  const ids = Object.keys(weights) as StatId[];
  ids.forEach((id, i) => {
    const n = i === ids.length - 1 ? pts - used : Math.floor((pts * (weights[id] ?? 0)) / sum);
    add[id] = n; used += n;
  });
  return allocateStats(p, add);
}

/** Greedily take nodes of `branches` (in content order, repeated passes) until no point can be spent. */
function fillTraits(p: Profile, branches: string[], allowKeystone: string | null): Profile {
  for (let pass = 0; pass < 20; pass++) {
    let took = false;
    for (const n of content.traits.nodes) {
      if (!branches.includes(n.branch) && n.kind !== 'hybrid') continue;
      if (n.kind === 'keystone' && n.id !== allowKeystone) continue;
      if (traitBlock(p, content, n.id) === null) { p = allocateTrait(p, content, n.id); took = true; }
    }
    if (!took) break;
  }
  return p;
}

function gear(p: Profile, items: string[], enhance: number): Profile {
  const rolls = seededRolls(3);
  for (const id of items) {
    const g = grantGear(p, content, id, rolls);
    p = equipGear(g.profile, content, g.uid);
  }
  p = structuredClone(p);
  const eq = new Set(Object.values(p.gear.equipped));
  for (const it of p.gear.items) if (eq.has(it.uid)) it.enhance = enhance;
  return p;
}

function heroes(p: Profile, ids: string[], stars: number | null, levelAtCap: boolean, level = 1): Profile {
  p = structuredClone(p);
  for (const id of ids) {
    const def = content.heroes.find((h) => h.id === id)!;
    let h = p.heroes.owned.find((x) => x.heroId === id);
    if (!h) { h = { heroId: id, stars: def.stars, level: 1, exp: 0, limitBreaks: 0 }; p.heroes.owned.push(h); }
    if (stars !== null) h.stars = stars;
    if (levelAtCap) { h.limitBreaks = content.heroGrowth.limitBreaks.length; h.level = heroLevelCap(content, h); } else h.level = level;
  }
  p.heroes.team = ids.slice(0, content.meta.maxTeamSize);
  return p;
}

function allTitles(p: Profile, equip: string): Profile {
  p = structuredClone(p);
  p.titles.unlocked = content.titles.titles.map((t) => t.id);
  return equipTitle(unlockTitles(p, content).profile, content, equip);
}

export interface NamedProfile { name: string; desc: string; profile: Profile | null }

export function referenceProfiles(): NamedProfile[] {
  const base = newProfile(content, env());

  let early = toLevel(base, 10);
  early = spreadStats(early, { strength: 2, vitality: 2, agility: 1, command: 1 });
  early = setClass(early, content, 'warrior');
  early = fillTraits(early, ['vanguard'], null);
  early = gear(early, ['worn-blade', 'padded-vest'], 5);
  early = heroes(early, ['mira', 'brann'], null, false, 10);

  let mid = toLevel(base, 20);
  mid = spreadStats(mid, { strength: 2, vitality: 2, agility: 1, command: 1 });
  mid = setClass(mid, content, 'warrior');
  mid = fillTraits(mid, ['vanguard'], null);
  mid = gear(mid, ['worn-blade', 'padded-vest'], 10);
  mid = heroes(mid, ['mira', 'brann'], null, false, 20);

  let strong = toLevel(base, 50);
  strong = spreadStats(strong, { strength: 3, vitality: 3, agility: 2, intellect: 1, command: 2 });
  strong = setClass(strong, content, 'warrior');
  strong = setClass(strong, content, 'berserker');
  strong = fillTraits(strong, ['vanguard', 'hunter'], 'vg-juggernaut');
  strong = gear(strong, ['warlord-axe', 'warlord-plate', 'warlord-signet'], 15);
  strong = heroes(strong, ['seraphine', 'garrick', 'mira', 'brann'], 5, true);
  strong = allTitles(strong, 'lone-survivor');

  const out: NamedProfile[] = [
    { name: 'bare (no profile)', desc: 'Phase 1 config, recommended power', profile: null },
    { name: 'new profile', desc: 'fresh save: Lv 1, +0 starting gear, Mira + Brann', profile: base },
    { name: 'early (Lv 10)', desc: 'Lv 10, 27 stat pts, Warrior, 9 trait pts in Vanguard, +5 starting gear, heroes Lv 10', profile: early },
    { name: 'mid (Lv 20)', desc: 'Lv 20, 57 stat pts, Warrior, 19 trait pts in Vanguard, +10 starting gear, heroes Lv 20', profile: mid },
    { name: 'strong (Lv 50)', desc: 'Lv 50, 147 stat pts, Berserker, Vanguard + Juggernaut keystone + Hunter + hybrids, +15 Warlord set, 4 heroes 5★ at cap, all titles', profile: strong },
  ];
  for (const o of out) if (o.profile) Profile.parse(o.profile);
  return out;
}
