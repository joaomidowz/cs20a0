// src/lib/game/playerCareer/awards.ts
// Prêmios da temporada no estilo HLTV: o Top 20 do ano (rating ponderado pelo peso dos campeonatos, títulos e
// MVPs) e o Rookie of the Year (o melhor de quem estreou em Major na temporada). Você entra com o que jogou; os
// jogadores da cena entram pelo overall da temporada (mecânica declarada, como a força dos rivais) e pelos MVPs e
// títulos que eles levaram nos seus campeonatos.
import { createSeededRng } from '../simulation';
import { memberBirthYear, memberCatalogOverall, memberDebutYear, memberNick, sceneOrgs } from './data';
import type { PlayerCareerState, RankedPlayer, TournamentResult } from './engine';
import { rosterIn, yearOfSeason } from './world';
import { seatedNicks } from './squad';
import { currentLevelOf } from './tiers';

/** Peso do campeonato no ranking: Major e Tier S valem mais; Tier A internacional mais que o regional; tier B e C
 *  quase não pesam (ninguém entra no Top 20 da HLTV ganhando Challenger). */
export const tierBonus = (tier: TournamentResult['tier'], level: number): number =>
  tier === 'Major' ? 0.12 : tier === 'S' ? 0.1 : tier === 'A' ? (level <= 1 ? 0.06 : -0.1) : tier === 'B' ? -0.24 : -0.34;
const PLACE_BONUS: Record<string, number> = { 'Campeão': 0.05, Vice: 0.025, Semis: 0.01 };
/** Jogadores da cena: o nível do time diz o peso médio dos campeonatos que eles jogam. */
const LEVEL_BONUS: Record<number, number> = { 0: 0.1, 1: 0.07, 2: 0 };
/** Mínimo de campeonatos jogados para entrar no ranking. */
export const MIN_EVENTS_RANKED = 4;

export interface SeasonAwards {
  hltvTop: RankedPlayer[];
  /** Sua posição (1 = melhor do mundo); null quando jogou pouco para ranquear. */
  hltvRank: number | null;
  rookie: RankedPlayer | null;
  /** Você estreou em Major nesta temporada. */
  rookieEligible: boolean;
}

/** A sua nota da temporada (null se jogou menos de 4 campeonatos). */
export function seasonScore(results: TournamentResult[], level: number): number | null {
  const played = results.filter((result) => !result.skipped);
  if (played.length < MIN_EVENTS_RANKED) return null;
  const mean = played.reduce((sum, result) => sum + result.rating + tierBonus(result.tier, level) + (PLACE_BONUS[result.placement] ?? 0), 0) / played.length;
  const mvps = played.filter((result) => result.mvp?.you).length;
  return Number((mean + mvps * 0.015).toFixed(3));
}

/**
 * `playerTop`: o ranking de jogadores do fim do ano (playerRanking.ts, o mesmo da tela Mundo). Com ele, o Top 20, a sua
 * posição e o Rookie saem dessa lista: o Rookie é o estreante mais bem colocado nela. Sem ele (testes, saves sem o
 * circuito), vale a nota da temporada abaixo, com a força estimada pelo overall para a cena.
 */
export function seasonAwards(state: PlayerCareerState, orgLevel: number, orgName: string, playerTop: RankedPlayer[] | null = null): SeasonAwards {
  const results = (state.calendar ?? []).flatMap((entry) => (entry.result ? [entry.result] : []));
  const year = yearOfSeason(state.seasonNumber);
  // MVPs e títulos dos jogadores da cena nos SEUS campeonatos contam para eles também.
  const mvpOf = new Map<string, number>();
  const titlesOf = new Map<string, number>();
  for (const result of results) {
    if (result.mvp && !result.mvp.you) mvpOf.set(result.mvp.nick.toLowerCase(), (mvpOf.get(result.mvp.nick.toLowerCase()) ?? 0) + 1);
    if (result.champion && result.champion !== orgName) titlesOf.set(result.champion, (titlesOf.get(result.champion) ?? 0) + 1);
  }
  const replaced = new Set(state.seatsTaken.filter((seat) => seat.orgId === state.orgId).flatMap((seat) => seatedNicks(state, seat)));
  const best = new Map<string, RankedPlayer & { age: number | null; elite: boolean; debut: boolean }>();
  // Quem já apareceu num Top 20 ou já levou o Rookie não é mais estreante (a promessa de 31 anos não concorre).
  const veterans = new Set(state.history.flatMap((log) => [...(log.hltvTop ?? []).map((player) => player.nick.toLowerCase()), ...(log.rookie ? [log.rookie.nick.toLowerCase()] : [])]));
  const myRating = (() => {
    const played = results.filter((result) => !result.skipped);
    return played.length ? Number((played.reduce((sum, result) => sum + result.rating, 0) / played.length).toFixed(2)) : undefined;
  })();
  for (const org of sceneOrgs) {
    // O nível de hoje (tiers.ts): o time que você levou à Elite pesa como Elite no Top 20.
    const level = currentLevelOf(state, org.id);
    if (level > 2) continue;
    for (const member of rosterIn(state.seed, state.seasonNumber, org.id)) {
      const nick = memberNick(member);
      const key = nick.toLowerCase();
      if (member.generated || (org.id === state.orgId && replaced.has(key))) continue;
      const overall = member.overall ?? memberCatalogOverall(member) ?? org.power ?? 80;
      const noise = (createSeededRng(`${state.seed}:hltv:${state.seasonNumber}:${key}`)() - 0.5) * 0.1;
      const rating = Number((0.95 + (overall - 60) * 0.006 + noise * 0.6).toFixed(2));
      const score = 0.95 + (overall - 60) * 0.006 + (LEVEL_BONUS[level] ?? 0) + noise
        + (mvpOf.get(key) ?? 0) * 0.015 + Math.min(0.05, (titlesOf.get(org.name) ?? 0) * 0.01);
      const born = memberBirthYear(member);
      // Estreante: quem entrou no topo neste ano, ou a promessa até 22 anos que ainda não apareceu num Top 20.
      const age = born === null ? null : year - born;
      const debut = !veterans.has(key) && (memberDebutYear(member) === year || (Boolean(member.prospect) && age !== null && age <= 22));
      const entry = { nick, team: org.name, teamId: org.id, rating, score: Number(score.toFixed(3)), age: born === null ? null : year - born, elite: level <= 1, debut };
      if (!best.has(key) || best.get(key)!.score < entry.score) best.set(key, entry);
    }
  }
  const mine = seasonScore(results, orgLevel);
  const field = [...best.values()];
  const ranked: RankedPlayer[] = [...field.map(({ nick, team, teamId, score, rating, age }) => ({ nick, team, teamId, score, rating, age })), ...(mine === null ? [] : [{ nick: state.nick, team: orgName, teamId: state.orgId, score: mine, rating: myRating, age: state.age, you: true }])]
    .sort((a, b) => b.score - a.score || a.nick.localeCompare(b.nick));
  const hltvRank = mine === null ? null : ranked.findIndex((player) => player.you) + 1;

  // Rookie: você só concorre na temporada da sua estreia em Major; na cena, quem estreou no topo neste ano num time
  // de Major (promessa que subiu ou novato do catálogo).
  const playedMajorNow = results.some((result) => result.tier === 'Major' && !result.skipped);
  const playedMajorBefore = state.history.some((log) => log.tournaments.some((result) => result.tier === 'Major' && !result.skipped));
  const rookieEligible = playedMajorNow && !playedMajorBefore;
  if (playerTop) {
    const debutants = new Set(field.filter((player) => player.elite && player.debut).map((player) => player.nick.toLowerCase()));
    const mineAt = playerTop.findIndex((player) => player.you);
    const rookie = playerTop.find((player) => (player.you ? rookieEligible : debutants.has(player.nick.toLowerCase()))) ?? null;
    return { hltvTop: playerTop.slice(0, 20), hltvRank: mineAt >= 0 ? mineAt + 1 : null, rookie, rookieEligible };
  }
  const npcRookie = field.filter((player) => player.elite && player.debut).sort((a, b) => b.score - a.score)[0];
  const rookie: RankedPlayer | null = rookieEligible && mine !== null && (!npcRookie || mine >= npcRookie.score)
    ? { nick: state.nick, team: orgName, teamId: state.orgId, score: mine, rating: myRating, age: state.age, you: true }
    : npcRookie ? { nick: npcRookie.nick, team: npcRookie.team, teamId: npcRookie.teamId, score: npcRookie.score, rating: npcRookie.rating, age: npcRookie.age } : null;

  return { hltvTop: ranked.slice(0, 20), hltvRank, rookie, rookieEligible };
}
