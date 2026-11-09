// src/lib/game/playerCareer/honors.ts
// Os símbolos das cartas: quantos títulos, MVPs e Majors cada jogador tem na carreira. Somam os seus campeonatos (o seu
// time campeão dá título a você e aos parceiros; outro campeão dá título aos 5 dele; e o MVP) e o circuito do mundo
// que já aconteceu no seu calendário, sem spoiler. O título fica preso ao nick: quem troca de time leva junto. O
// índice é montado uma vez por estado do mundo e serve todas as cartas da tela.
import type { WorldEventResult } from './circuit';
import { memberNick, rosterBySlot } from './data';
import { playedCount, type PlayerCareerState } from './engine';
import { SLOTS } from './live';
import { matesOf } from './squad';
import { orgIn, seatMovesOf } from './world';
import { careerClock, careerResults, circuitSource, orgIdOfName, seenWorldResults, type WorldSource } from './worldView';

export interface PlayerHonors { titles: number; mvps: number; majors: number }

const EMPTY: PlayerHonors = { titles: 0, mvps: 0, majors: 0 };

/** "3 títulos (1 Major), 2 MVPs": o rótulo acessível dos símbolos. Vazio quando não há nada. */
export function honorsLabel(honors: PlayerHonors): string {
  const parts: string[] = [];
  if (honors.titles > 0) {
    const majors = honors.majors > 0 ? ` (${honors.majors} Major${honors.majors === 1 ? '' : 's'})` : '';
    parts.push(`${honors.titles} título${honors.titles === 1 ? '' : 's'}${majors}`);
  }
  if (honors.mvps > 0) parts.push(`${honors.mvps} MVP${honors.mvps === 1 ? '' : 's'}`);
  return parts.join(', ');
}

/** Os 5 que entraram em quadra pelo time na temporada: no seu time, você e os parceiros daquele ano; nos outros, o
 *  elenco nas posições do motor (a mesma escalação que a simulação usa). */
export function fiveOf(state: PlayerCareerState, season: number, orgId: string): string[] {
  const yours = season === state.seasonNumber ? state.orgId : state.history.find((log) => log.seasonNumber === season)?.orgId;
  if (yours === orgId) {
    const then = season === state.seasonNumber ? state : { ...state, orgId, seasonNumber: season };
    return [state.nick, ...matesOf(then).map((mate) => mate.player.nickname ?? '')].filter(Boolean);
  }
  const org = orgIn(state.seed, season, orgId);
  return org ? rosterBySlot(org, SLOTS).flatMap((member) => (member ? [memberNick(member)] : [])) : [];
}

function buildIndex(state: PlayerCareerState, world: WorldEventResult[]): Map<string, PlayerHonors> {
  const index = new Map<string, PlayerHonors>();
  const add = (nick: string, field: keyof PlayerHonors) => {
    const key = nick.toLowerCase();
    const current = index.get(key) ?? { ...EMPTY };
    current[field] += 1;
    index.set(key, current);
  };
  const lineups = new Map<string, string[]>();
  const crown = (season: number, orgId: string, major: boolean) => {
    const key = `${season}:${orgId}`;
    if (!lineups.has(key)) lineups.set(key, fiveOf(state, season, orgId));
    for (const nick of lineups.get(key)!) {
      add(nick, 'titles');
      if (major) add(nick, 'majors');
    }
  };
  // 1) Os seus campeonatos: o seu time campeão (você e os parceiros) ou o time que ganhou; e o MVP.
  for (const { season, orgId, result } of careerResults(state)) {
    if (result.skipped) continue;
    const major = result.tier === 'Major';
    if (result.placement === 'Campeão') crown(season, orgId, major);
    else if (result.champion) {
      const champion = orgIdOfName(result.champion);
      if (champion) crown(season, champion, major);
    }
    if (result.mvp) add(result.mvp.you ? state.nick : result.mvp.nick, 'mvps');
  }
  // 2) O circuito do mundo que já aconteceu (o que você jogou com campeão conhecido já contou acima).
  for (const result of world) {
    crown(result.season, result.champion, result.tier === 'Major');
    if (result.mvp) add(result.mvp.nick, 'mvps');
  }
  return index;
}

let memo: { signature: string; index: Map<string, PlayerHonors> } | null = null;

/** Títulos, MVPs e Majors de todo mundo, por nick em minúsculas. Remonta só quando o mundo visível muda. */
export function honorsIndex(state: PlayerCareerState, source: WorldSource = circuitSource(state)): Map<string, PlayerHonors> {
  const world = seenWorldResults(state, source);
  const signature = [
    state.seed,
    state.nick,
    state.seasonNumber,
    state.orgId,
    careerClock(state).month,
    state.history.length,
    playedCount(state),
    seatMovesOf(state.seed).length,
    matesOf(state).map((mate) => mate.player.nickname ?? '').join(','),
    world.map((result) => result.key).join(',')
  ].join('|');
  if (memo?.signature !== signature) memo = { signature, index: buildIndex(state, world) };
  return memo.index;
}

/** Contrato da spec: as honras de um jogador na carreira (zero quando ele não tem nenhuma). */
export function playerHonors(state: PlayerCareerState, nick: string): PlayerHonors {
  return { ...(honorsIndex(state).get(nick.toLowerCase()) ?? EMPTY) };
}
