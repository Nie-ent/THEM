/**
 * Trait Tree (GDD §5) — P2-03. Data: `content/data/traits.json`.
 *
 * - 4 branches; points may be spread across branches freely.
 * - A node's first rank needs `requiresBranchPoints` already spent in its branch, every
 *   `requiresNodes` at rank ≥ 1, and for hybrids `requiresBranches` (points per branch).
 * - Keystones are big trade-offs; at most `limits.keystones` may be taken.
 * - Card nodes change skill-card params in the run (core `Loadout.cardParams`).
 * - Reset: free up to `respec.freeUntilLevel`; after that a full reset costs `fullCost` and a
 *   one-branch reset `branchCost` of `respec.itemId` (Rewind Crystal). A branch reset also refunds
 *   hybrid nodes that need that branch.
 *
 * Pure: functions return a new profile.
 */
import type { ContentBundle, TraitNodeDef } from '@them/content';
import type { Mods } from '@them/core';
import type { LoadoutContributor, LoadoutPart } from './loadout';
import { MetaError } from './progression';
import type { Profile } from './profile';

function node(content: ContentBundle, id: string): TraitNodeDef {
  const n = content.traits.nodes.find((x) => x.id === id);
  if (!n) throw new MetaError('unknown-trait', `unknown trait node "${id}"`);
  return n;
}

const rankOf = (p: Profile, id: string) => p.traits.nodes[id] ?? 0;

/** Trait points spent in a branch (rank × cost of its nodes; hybrids count in no branch). */
export function pointsInBranch(profile: Profile, content: ContentBundle, branch: string): number {
  let n = 0;
  for (const d of content.traits.nodes) if (d.branch === branch) n += rankOf(profile, d.id) * d.cost;
  return n;
}

export function keystonesTaken(profile: Profile, content: ContentBundle): number {
  return content.traits.nodes.filter((d) => d.kind === 'keystone' && rankOf(profile, d.id) > 0).length;
}

export type TraitBlock =
  | 'unknown' | 'maxed' | 'points' | 'branch-points' | 'requires-node' | 'requires-branches' | 'keystone-limit';

/** Why the next rank of `id` cannot be taken, or null if it can. */
export function traitBlock(profile: Profile, content: ContentBundle, id: string): TraitBlock | null {
  const d = content.traits.nodes.find((x) => x.id === id);
  if (!d) return 'unknown';
  const r = rankOf(profile, id);
  if (r >= d.maxRank) return 'maxed';
  if (profile.traits.unspentPoints < d.cost) return 'points';
  if (r === 0) {
    if (pointsInBranch(profile, content, d.branch) < d.requiresBranchPoints) return 'branch-points';
    for (const req of d.requiresNodes) if (rankOf(profile, req) < 1) return 'requires-node';
    for (const [b, need] of Object.entries(d.requiresBranches)) if (pointsInBranch(profile, content, b) < need) return 'requires-branches';
    if (d.kind === 'keystone' && keystonesTaken(profile, content) >= content.traits.limits.keystones) return 'keystone-limit';
  }
  return null;
}

/** Take the next rank of a node. Throws MetaError with the block reason. */
export function allocateTrait(profile: Profile, content: ContentBundle, id: string): Profile {
  const d = node(content, id);
  const block = traitBlock(profile, content, id);
  if (block) throw new MetaError(block === 'points' ? 'not-enough-points' : 'trait-locked', `allocateTrait ${id}: ${block}`);
  const p = structuredClone(profile);
  p.traits.nodes[id] = rankOf(p, id) + 1;
  p.traits.unspentPoints -= d.cost;
  return p;
}

/** Items a reset costs right now (0 while free). `branch` = one-branch reset, omitted = full reset. */
export function traitResetCost(profile: Profile, content: ContentBundle, branch?: string): number {
  const r = content.traits.respec;
  if (profile.level <= r.freeUntilLevel) return 0;
  return branch === undefined ? r.fullCost : r.branchCost;
}

/**
 * Refund trait points: every node (full reset) or one branch plus the hybrids that need it.
 * Pays the reset cost from `profile.items[respec.itemId]`; throws MetaError if short.
 */
export function resetTraits(profile: Profile, content: ContentBundle, branch?: string): Profile {
  if (branch !== undefined && !content.traits.branches.some((b) => b.id === branch)) {
    throw new MetaError('unknown-trait', `resetTraits: unknown branch "${branch}"`);
  }
  const cost = traitResetCost(profile, content, branch);
  const item = content.traits.respec.itemId;
  const have = profile.items[item] ?? 0;
  if (have < cost) throw new MetaError('not-enough-items', `resetTraits: needs ${cost} ${item}, have ${have}`);
  const p = structuredClone(profile);
  let refund = 0;
  for (const d of content.traits.nodes) {
    const r = rankOf(p, d.id);
    if (r === 0) continue;
    const hit = branch === undefined || d.branch === branch || branch in d.requiresBranches;
    if (!hit) continue;
    refund += r * d.cost;
    delete p.traits.nodes[d.id];
  }
  if (refund === 0) return profile; // nothing to reset: no charge
  p.traits.unspentPoints += refund;
  if (cost > 0) p.items[item] = have - cost;
  p.traits.respecs++;
  return p;
}

/** Everything the taken traits bring into a run. Keys summed in sorted node order. */
export function traitLoadout(profile: Profile, content: ContentBundle): LoadoutPart & { noAllies: boolean } {
  const mods: Record<string, number> = {};
  const cardParams: Record<string, Record<string, number>> = {};
  const cardWeights: Record<string, number> = {};
  let noAllies = false;
  const nodes = [...content.traits.nodes].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const d of nodes) {
    const r = Math.min(rankOf(profile, d.id), d.maxRank);
    if (r <= 0) continue;
    for (const k of Object.keys(d.mods).sort()) mods[k] = (mods[k] ?? 0) + d.mods[k]! * r;
    for (const c of Object.keys(d.cardParams).sort()) {
      const t = (cardParams[c] ??= {});
      for (const k of Object.keys(d.cardParams[c]!).sort()) t[k] = (t[k] ?? 0) + d.cardParams[c]![k]! * r;
    }
    for (const c of Object.keys(d.cardWeights).sort()) cardWeights[c] = (cardWeights[c] ?? 1) * d.cardWeights[c]!;
    if (d.noAllies) noAllies = true;
  }
  const round = (o: Record<string, number>) => { for (const k of Object.keys(o)) o[k] = Math.round(o[k]! * 1e9) / 1e9; };
  round(mods);
  for (const t of Object.values(cardParams)) round(t);
  return { mods: mods as Partial<Record<keyof Mods, number>>, cardParams, cardWeights, noAllies };
}

export const traitsContributor: LoadoutContributor = (profile, content) => traitLoadout(profile, content);

/** Content cross-checks for the tree (used by checkMetaContent). */
export function checkTraitsContent(content: ContentBundle): string[] {
  const out: string[] = [];
  const t = content.traits;
  const branches = new Set(t.branches.map((b) => b.id));
  const ids = new Set<string>();
  for (const d of t.nodes) {
    if (ids.has(d.id)) out.push(`traits.nodes: duplicate id "${d.id}"`);
    ids.add(d.id);
    if (d.branch !== 'hybrid' && !branches.has(d.branch)) out.push(`traits.${d.id}: unknown branch "${d.branch}"`);
    if (d.kind === 'hybrid' && Object.keys(d.requiresBranches).length < 2) out.push(`traits.${d.id}: hybrid needs two branches`);
    for (const b of Object.keys(d.requiresBranches)) if (!branches.has(b)) out.push(`traits.${d.id}: requiresBranches unknown "${b}"`);
  }
  for (const d of t.nodes) for (const r of d.requiresNodes) if (!ids.has(r)) out.push(`traits.${d.id}: requiresNodes unknown "${r}"`);
  if (!content.meta.items.some((i) => i.id === t.respec.itemId)) out.push(`traits.respec.itemId: "${t.respec.itemId}" is not in meta.items`);
  return out;
}
