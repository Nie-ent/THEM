/** Team selection, shared by the loadout builder and hero growth (own module: no import cycle). */
import type { ContentBundle } from '@them/content';
import type { Profile } from './profile';

/** The ally heroes a profile brings: its team, owned and known to content, capped at maxTeamSize. */
export function teamFor(profile: Profile, content: ContentBundle): string[] {
  const owned = new Set(profile.heroes.owned.map((h) => h.heroId));
  const known = new Set(content.heroes.map((h) => h.id));
  const out: string[] = [];
  for (const id of profile.heroes.team) {
    if (out.length >= content.meta.maxTeamSize) break;
    if (owned.has(id) && known.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}
