import type { Language, RoundDetail, SeriesResult, TeamSide, Weapon } from './types';

/** What a player actually did across the run, counted from the rounds that were played. */
export interface PlayerHighlight {
  playerId: string;
  name: string;
  kills: number;
  deaths: number;
  headshots: number;
  /** First kill of a round. */
  openingKills: number;
  threeKills: number;
  fourKills: number;
  aces: number;
  clutches: number;
  bestWeapon: Weapon | null;
  bestWeaponKills: number;
  roundsPlayed: number;
}

export type HighlightKind = 'ace' | 'four-kill' | 'clutch' | 'triple';

/** A single moment worth retelling, pointing at the exact round it happened in. */
export interface RunMoment {
  kind: HighlightKind;
  seriesId: string;
  phase: SeriesResult['phase'];
  mapNumber: number;
  mapId?: string;
  round: number;
  playerId: string;
  name: string;
  opponentName: string;
  kills: number;
}

export interface RunHighlights {
  players: PlayerHighlight[];
  moments: RunMoment[];
  totals: { rounds: number; clutches: number; aces: number; openingKills: number; headshots: number; kills: number };
}

const MOMENT_ORDER: Record<HighlightKind, number> = { ace: 0, 'four-kill': 1, clutch: 2, triple: 3 };

/** Kills each player made in one round, in the order they happened. */
const killsByPlayer = (round: RoundDetail) => {
  const counts = new Map<string, { name: string; side: TeamSide; kills: number; last: number }>();
  round.kills.forEach((kill, index) => {
    const entry = counts.get(kill.killerId) ?? { name: kill.killerName, side: kill.killerSide, kills: 0, last: -1 };
    entry.kills += 1;
    entry.last = index;
    counts.set(kill.killerId, entry);
  });
  return counts;
};

/**
 * Reads the played rounds of the user's series and returns who did what: multi-kills, clutches, opening kills and the
 * weapon each player did most damage with. Nothing here is generated, it all comes from the round events.
 */
export function collectRunHighlights(matches: SeriesResult[], userTeamId: string): RunHighlights {
  const players = new Map<string, PlayerHighlight>();
  const moments: RunMoment[] = [];
  const totals = { rounds: 0, clutches: 0, aces: 0, openingKills: 0, headshots: 0, kills: 0 };
  const weapons = new Map<string, Map<Weapon, number>>();

  const entry = (id: string, name: string) => {
    let player = players.get(id);
    if (!player) {
      player = { playerId: id, name, kills: 0, deaths: 0, headshots: 0, openingKills: 0, threeKills: 0, fourKills: 0, aces: 0, clutches: 0, bestWeapon: null, bestWeaponKills: 0, roundsPlayed: 0 };
      players.set(id, player);
    }
    return player;
  };

  for (const match of matches) {
    if (!match.winnerId) continue;
    const userIsA = match.teamA.id === userTeamId;
    const userSide: TeamSide = userIsA ? 'a' : 'b';
    const opponentName = userIsA ? match.teamB.name : match.teamA.name;
    for (const map of match.maps) {
      for (const round of map.details ?? []) {
        totals.rounds += 1;
        const counts = killsByPlayer(round);
        const opening = round.kills[0];
        if (opening && opening.killerSide === userSide) {
          entry(opening.killerId, opening.killerName).openingKills += 1;
          totals.openingKills += 1;
        }
        for (const kill of round.kills) {
          if (kill.killerSide === userSide) {
            const killer = entry(kill.killerId, kill.killerName);
            killer.kills += 1;
            totals.kills += 1;
            if (kill.headshot) { killer.headshots += 1; totals.headshots += 1; }
            const byWeapon = weapons.get(kill.killerId) ?? new Map<Weapon, number>();
            byWeapon.set(kill.weapon, (byWeapon.get(kill.weapon) ?? 0) + 1);
            weapons.set(kill.killerId, byWeapon);
          } else {
            entry(kill.victimId, kill.victimName).deaths += 1;
          }
        }
        // The clutch tag marks the round; the player who closed it is the last kill of the winning side.
        const clutcher = round.tags.includes('clutch') && round.winner === userSide
          ? [...round.kills].reverse().find((kill) => kill.killerSide === userSide)
          : undefined;
        if (clutcher) {
          entry(clutcher.killerId, clutcher.killerName).clutches += 1;
          totals.clutches += 1;
          moments.push({ kind: 'clutch', seriesId: match.id, phase: match.phase, mapNumber: map.map, mapId: map.mapId, round: round.number, playerId: clutcher.killerId, name: clutcher.killerName, opponentName, kills: counts.get(clutcher.killerId)?.kills ?? 1 });
        }
        for (const [playerId, count] of counts) {
          if (count.side !== userSide || count.kills < 3) continue;
          const player = entry(playerId, count.name);
          const kind: HighlightKind = count.kills >= 5 ? 'ace' : count.kills === 4 ? 'four-kill' : 'triple';
          if (kind === 'ace') { player.aces += 1; totals.aces += 1; }
          else if (kind === 'four-kill') player.fourKills += 1;
          else player.threeKills += 1;
          if (kind !== 'triple') {
            moments.push({ kind, seriesId: match.id, phase: match.phase, mapNumber: map.map, mapId: map.mapId, round: round.number, playerId, name: count.name, opponentName, kills: count.kills });
          }
        }
      }
      for (const player of players.values()) player.roundsPlayed = totals.rounds;
    }
  }

  for (const player of players.values()) {
    const byWeapon = weapons.get(player.playerId);
    if (!byWeapon) continue;
    const [weapon, kills] = [...byWeapon.entries()].sort((left, right) => right[1] - left[1])[0];
    player.bestWeapon = weapon;
    player.bestWeaponKills = kills;
  }

  moments.sort((left, right) => MOMENT_ORDER[left.kind] - MOMENT_ORDER[right.kind] || right.kills - left.kills || left.round - right.round);
  return {
    players: [...players.values()].sort((left, right) => right.kills - left.kills),
    moments,
    totals
  };
}

export const highlightHeadshotRate = (player: PlayerHighlight) =>
  player.kills > 0 ? Math.round((player.headshots / player.kills) * 100) : 0;

const MOMENT_LABELS: Record<Language, Record<HighlightKind, string>> = {
  'pt-BR': { ace: 'ACE', 'four-kill': '4K', clutch: 'CLUTCH', triple: '3K' },
  es: { ace: 'ACE', 'four-kill': '4K', clutch: 'CLUTCH', triple: '3K' },
  en: { ace: 'ACE', 'four-kill': '4K', clutch: 'CLUTCH', triple: '3K' }
};

export const getMomentLabel = (language: Language, kind: HighlightKind) => MOMENT_LABELS[language][kind];
