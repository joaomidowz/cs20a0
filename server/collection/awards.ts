import { courtPower } from '../../src/lib/game/courtPower';
import { rarityOf } from '../../src/lib/game/online/collection-rules';
import type { MajorAwards, Player, PlayerRunStats, SelectedPlayer, SeriesResult } from '../../src/lib/game/types';

/** Court points the beaten opponent had over the lineup for the win to count as a giant killing (about one upset in twelve). */
export const GIANT_KILLER_GAP = 12;

export interface AwardInput {
  participantId: string;
  placement: string;
  champion: boolean;
  lineup: SelectedPlayer[];
  starPlayerId: string | null;
  matches: SeriesResult[];
  stats: PlayerRunStats[];
  opponents: Array<{ id: string; power: number; won: boolean }>;
  ownPower: number;
  awards: MajorAwards | null;
  lookup: (id: string) => Player | undefined;
}

export interface DetectedAward {
  kind: string;
  detail: Record<string, unknown>;
}

const won = (series: SeriesResult, me: string) => series.winnerId === me;
const myMaps = (series: SeriesResult, me: string) => series.maps.map((map) => ({ map, mine: map.winnerId === me, myScore: series.teamA.id === me ? map.scoreA : map.scoreB, theirScore: series.teamA.id === me ? map.scoreB : map.scoreA }));

/** Pure: every award the run earned, from the participant's own series, stats and the field's awards. */
export function detectAwards(input: AwardInput): DetectedAward[] {
  const me = input.participantId;
  const out: DetectedAward[] = [];
  const add = (kind: string, detail: Record<string, unknown> = {}) => out.push({ kind, detail });
  const wins = input.matches.filter((series) => won(series, me));

  if (input.champion) add('major_title', { placement: input.placement });
  const mvp = input.awards?.mvp;
  const mvpMine = Boolean(mvp && mvp.teamId === me);
  if (mvpMine) add('major_mvp', { playerId: mvp!.playerId, rating: mvp!.rating });
  for (const top of input.awards?.topPlayers ?? []) if (top.teamId === me && top.playerId !== mvp?.playerId) add('top10_player', { playerId: top.playerId, rating: top.rating });

  let overtimeWins = 0;
  for (const series of input.matches) {
    for (const entry of myMaps(series, me)) {
      if (entry.mine && entry.theirScore === 0 && entry.myScore >= 13) add('flawless_map', { series: series.id, map: entry.map.mapId ?? entry.map.map, score: `${entry.myScore}-${entry.theirScore}` });
      if (entry.mine && entry.map.overtime) overtimeWins += 1;
      const comebackMine = entry.map.comeback && ((entry.map.comeback === 'a' && series.teamA.id === me) || (entry.map.comeback === 'b' && series.teamB.id === me));
      if (comebackMine) add('comeback_map', { series: series.id, map: entry.map.mapId ?? entry.map.map });
    }
    if (won(series, me) && series.bestOf >= 3 && myMaps(series, me).every((entry) => entry.mine)) add('perfect_series', { series: series.id, phase: series.phase });
    if (won(series, me) && series.bestOf >= 3) {
      const first = myMaps(series, me)[0];
      const lostFirstTwo = series.bestOf === 5 && myMaps(series, me).slice(0, 2).every((entry) => !entry.mine);
      if ((series.bestOf === 3 && first && !first.mine) || lostFirstTwo) add('comeback_series', { series: series.id, phase: series.phase });
    }
  }
  if (overtimeWins >= 3) add('overtime_king', { overtimeWins });
  if (input.champion && input.matches.length && wins.length === input.matches.length) add('undefeated_major', { series: input.matches.length });

  // A giant is measured on the court scale, the one that plays: above the curve's knee eight raw points are barely one
  // on the court, and beating such a "giant" used to pay an award for a coin flip.
  for (const opponent of input.opponents) {
    const gap = courtPower(opponent.power) - courtPower(input.ownPower);
    if (opponent.won && gap >= GIANT_KILLER_GAP) add('giant_killer', { opponent: opponent.id, gap: Number(gap.toFixed(1)) });
  }

  const cards = input.lineup.map((pick) => input.lookup(pick.playerId)).filter((player): player is Player => Boolean(player));
  const average = cards.length ? cards.reduce((sum, player) => sum + (player.overall ?? 70), 0) / cards.length : 0;
  if (input.champion && cards.length === 5 && average <= 78) add('budget_champion', { average: Number(average.toFixed(1)) });
  if (mvpMine) {
    const card = input.lookup(mvp!.playerId);
    if (card && ['common', 'rare'].includes(rarityOf(card))) add('common_hero', { playerId: card.id, rarity: rarityOf(card) });
  }
  if (input.starPlayerId) {
    if (mvpMine && mvp!.playerId === input.starPlayerId) add('star_delivered', { playerId: input.starPlayerId });
    const star = input.stats.find((line) => line.playerId === input.starPlayerId);
    if (input.champion && star && star.runRating >= 1.3) add('carried', { playerId: input.starPlayerId, rating: Number(star.runRating.toFixed(2)) });
  }
  return out;
}
