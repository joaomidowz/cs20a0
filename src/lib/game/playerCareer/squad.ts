// src/lib/game/playerCareer/squad.ts
// O elenco do seu time na Carreira de Jogador: os mesmos parceiros que entram em quadra, com
// relacionamento (sinergia) que dá bônus real de overall, conversas entre campeonatos e treino
// escolhido — o efeito do treino é o MESMO da Dinastia (dynasty/training.ts), aplicado como bônus
// por cima da carta derivada do overall.
import { createSeededRng } from '../simulation';
import { applyTraining } from '../dynasty/training';
import type { Coach, Player, TrainingFocus } from '../types';
import { memberBirthYear, memberRoles, ORG_BASE_POWER, resolvedRoster, sceneOrgById } from './data';
import { orgIn, seatMovesOf } from './world';
import { coachOfOrg, type CareerCoach } from './coaches';
import { randomNick } from './extraTeams';
import { MAP_TRAIN_CAP, MAP_TRAIN_STEP } from './careerMaps';
import { MAP_NAMES } from '../maps';
import type { MapId } from '../types';
import { mindBump } from './life';
import { languagePenalty, learn, myFluency, nativeLanguage, NON_NATIVE_MAX, teamLanguage, type Language } from './language';
// Ciclo deliberado (só em nível de função): o squad é a fonte única dos parceiros e o live consome.
import { enginePlayer, SLOTS, sceneOrgEnginePlayers } from './live';
import { orgOf, seatToTake, type BenchPlayer, type PlayerCareerState, type PlayerRole, type SquadPlan, type TrainedAttribute, type TrainedBonus } from './engine';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Teto do bônus de treino por atributo: treino afina, quem sobe de verdade é a temporada (aging). */
export const TRAIN_CAP = 6;
/** A cada 3 treinos o overall senta +1 — se ainda estiver abaixo do teto da carreira. */
const OVERALL_EVERY = 3;

/** Saves de antes da função vir do catálogo: a vaga do time atual é recalculada (ex.: AWPer na Vitality toma a
 *  vaga do ZywOo, não a do apEX). As vagas de times antigos ficam como estavam. */
function fixCurrentSeat(state: PlayerCareerState) {
  const seats = state.seatsTaken ?? [];
  const org = sceneOrgById.get(state.orgId);
  let index = -1;
  seats.forEach((seat, position) => { if (seat.orgId === state.orgId) index = position; });
  if (!org || index < 0) return seats;
  // Só corrige vaga claramente errada: o jogador guardado tem função conhecida e não é a sua (apEX ≠ AWPer).
  const stored = org.roster.find((member) => member.nick.toLowerCase() === seats[index].nick.toLowerCase());
  const roles = stored ? memberRoles(stored) : [];
  if (!stored || !roles.length || roles.includes(state.role)) return seats;
  const fixed = seatToTake(org, state.role);
  return fixed.nick === seats[index].nick ? seats : seats.map((seat, position) => (position === index ? fixed : seat));
}

/** Saves antigos ganham os campos do elenco com default; nunca recria o que já existe. */
export function ensureSquad(state: PlayerCareerState): PlayerCareerState {
  return {
    ...state,
    seatsTaken: fixCurrentSeat(state),
    relationships: state.relationships ?? {},
    talks: state.talks ?? {},
    trained: state.trained ?? {},
    trainedWindow: state.trainedWindow ?? null,
    trainCount: state.trainCount ?? 0,
    morale: state.morale ?? 60,
    form: state.form ?? 0,
    fame: state.fame ?? 0,
    fatigue: state.fatigue ?? 0
  };
}

/** Sua carta: o engine player da sua função com o bônus de treino em cima. */
export function applyTrained(player: Player, trained: TrainedBonus): Player {
  const boosted = { ...player };
  for (const [attribute, bonus] of Object.entries(trained) as Array<[TrainedAttribute, number]>) {
    if (!bonus) continue;
    (boosted as unknown as Record<string, number>)[attribute] = clamp(Number(player[attribute] ?? 60) + bonus, 40, 99);
  }
  return boosted;
}

/** Moral alta acalma (Mental +), baixa trava (Mental −): até 3 pontos pra cada lado. */
export const moraleBump = (morale: number | undefined): number => clamp(Math.round(((morale ?? 60) - 60) / 12), -3, 3);

/** Sua carta fora do servidor: a MESMA que entra em quadra (overall + forma da semana + função + treino + moral). */
export function myPlayerOf(state: PlayerCareerState): Player {
  const rng = createSeededRng(`${state.seed}:me:${state.seasonNumber}`);
  const overall = clamp(state.overall + clamp(state.form ?? 0, -3, 3) - fatiguePenalty(state.fatigue), 40, 99);
  const card = applyTrained(enginePlayer(`${state.seed}:me`, state.nick, overall, state.role, rng), state.trained ?? {});
  // Torcida joga junto: com 20 mil fãs +1 de Mental, com 100 mil +2 (a pressão vira combustível).
  // O Mental de fora do servidor (life.mind) puxa até 3 para cada lado.
  const mental = moraleBump(state.morale) + fanBoost(state.fame) + mindBump(state.life?.mind);
  return mental ? { ...card, mental: clamp(Number(card.mental ?? 60) + mental, 40, 99) } : card;
}

/** Quanto a torcida soma no Mental em quadra. */
export const fanBoost = (fame: number | undefined): number => ((fame ?? 0) >= 100000 ? 2 : (fame ?? 0) >= 20000 ? 1 : 0);

/** Entrosada joga junto: relação alta dá até +3 de overall pro parceiro, baixa tira até 2. */
export const synergyBump = (relationship: number): number => (relationship >= 85 ? 2 : relationship >= 70 ? 1 : relationship < 25 ? -2 : relationship < 40 ? -1 : 0);

export interface SquadMate {
  player: Player;
  /** Relacionamento com você (0-100). */
  relationship: number;
  /** Sinergia pra exibir na carta: o relacionamento escalado pelo que a função entrega ao time. */
  synergy: number;
}

/** Relacionamento inicial sorteado por seed (35-65) — o resto a carreira constrói. */
export function relationshipOf(state: PlayerCareerState, mateId: string): number {
  const stored = state.relationships?.[mateId];
  return typeof stored === 'number' ? stored : 35 + Math.floor(createSeededRng(`${state.seed}:bond:${mateId}`)() * 31);
}

/** As vagas com a temporada em que você as tomou (saves antigos não guardavam: a do time inicial é a 1; as outras,
 *  a primeira temporada em que você aparece naquele time, ou a atual). */
export function seatsWithSeason(state: PlayerCareerState): Array<PlayerCareerState['seatsTaken'][number] & { season: number }> {
  return (state.seatsTaken ?? []).map((seat, index) => ({
    ...seat,
    season: seat.season ?? (index === 0 ? 1 : state.history.find((log) => log.orgId === seat.orgId)?.seasonNumber ?? state.seasonNumber)
  }));
}

/** Os nicks que a sua vaga tirou do time: quem cedeu e, se ele trocou de time, quem veio no lugar. */
export function seatedNicks(state: PlayerCareerState, seat: { orgId: string; nick: string }): string[] {
  const move = seatMovesOf(state.seed).find((entry) => entry.fromId === seat.orgId && entry.nick.toLowerCase() === seat.nick.toLowerCase());
  return [seat.nick.toLowerCase(), ...(move ? [move.standIn.toLowerCase()] : [])];
}

/** Sai do elenco quem cedeu a vaga (agora na posição da função real dele); sem vaga registrada, sai o da sua
 *  função. Os 4 que ficam são os seus parceiros. */
function withoutSeat(players: Player[], state: PlayerCareerState): Player[] {
  const seat = [...state.seatsTaken].reverse().find((taken) => taken.orgId === state.orgId);
  // Quem cedeu a vaga pode ter ido para outro time; aí quem fica no banco é quem veio no lugar dele.
  const nicks = seat ? seatedNicks(state, seat) : [];
  const bySeat = players.find((player) => nicks.includes((player.nickname ?? '').toLowerCase()));
  const leaving = bySeat ?? players.find((player) => player.role === state.role) ?? players.at(-1);
  return players.filter((player) => player !== leaving).slice(0, 4);
}

/** O idioma da call do seu time e o quanto você fala (lan house: a galera fala o seu idioma). */
export function myLanguageFit(state: PlayerCareerState): { language: Language; fluency: number; penalty: number } {
  const org = orgIn(state.seed, state.seasonNumber, state.orgId);
  const language = org ? teamLanguage(resolvedRoster(org)) : nativeLanguage(state.country);
  const fluency = myFluency(state, language);
  return { language, fluency, penalty: languagePenalty(fluency) };
}

/** Quanto um parceiro perde jogando fora da função natural dele. */
export const OFF_ROLE_PENALTY = 2;

/** Os 4 parceiros da temporada — exatamente quem entra em quadra com você, com o bônus de sinergia no overall. */
export function matesOf(state: PlayerCareerState): SquadMate[] {
  const org = orgOf(state.orgId, state);
  const seasonKey = `${state.seed}:season:${state.seasonNumber}`;
  // Lan house: você + 4 da galera (as funções que faltam; quem é rifler empurra o suporte para fora), com nicks
  // gerados fixos pela seed da carreira.
  const roster: Player[] = org.id === 'lan-house'
    ? SLOTS.filter((role) => role !== state.role).slice(0, 4)
        .map((role) => enginePlayer(`${state.seed}:mate:${role}`, randomNick(`${state.seed}:lan:${role}`), ORG_BASE_POWER[5], role, createSeededRng(`${state.seed}:mates:${seasonKey}:${role}`)))
    : withoutSeat(sceneOrgEnginePlayers(orgIn(state.seed, state.seasonNumber, org.id) ?? (org as never), seasonKey), state);
  // Call num idioma que você não domina custa sinergia: os parceiros perdem até 2 de overall em quadra.
  const { penalty } = myLanguageFit(state);
  // Quem saiu a seu pedido dá lugar ao substituto (mesma função, um pouco melhor ou pior).
  const kicked = state.kickedMates?.[state.orgId] ?? [];
  const plan = state.squadPlan && state.squadPlan.orgId === state.orgId ? state.squadPlan : null;
  // Cada titular com a função natural dele (a da vaga; quem veio do banco traz a dele).
  let lineup = roster.map((player) => {
    const key = (player.nickname ?? '').toLowerCase();
    const gone = kicked.find((entry) => entry.nick.toLowerCase() === key);
    const slotRole = (player.role ?? 'support') as PlayerRole;
    let current: Player = gone
      ? enginePlayer(`${state.orgId}:sub:${gone.replacement}`, gone.replacement, replacementOverall(Number(player.overall ?? 70), teamFloor(roster, player), gone.delta), slotRole, createSeededRng(`${state.seed}:replacement:${gone.replacement}`))
      : player;
    let natural = slotRole;
    // Banco: quem entrou no lugar dele (promovido por você ou por um acontecimento).
    const sub = plan?.lineup[key];
    if (sub) {
      current = enginePlayer(`${state.orgId}:bench:${sub.nick.toLowerCase()}`, sub.nick, sub.overall, slotRole, createSeededRng(`${state.seed}:bench:${sub.nick}`));
      natural = sub.role;
    }
    // O IGL trocou a função dele.
    const assigned = plan?.roles[(current.nickname ?? '').toLowerCase()];
    return { player: current, natural, role: assigned ?? slotRole };
  });
  // A função que ficou vaga (a de quem cedeu a vaga). Se você joga em outra, o parceiro dela vai para a vaga.
  const taken = lineup.map((item) => item.role);
  const vacant = SLOTS.find((role) => role !== state.role && !taken.includes(role)) ?? null;
  if (vacant) lineup = lineup.map((item) => (item.role === state.role ? { ...item, role: vacant } : item));
  // Fora da função natural ele rende menos.
  const adjusted = lineup.map(({ player, natural, role }) => {
    if (role === player.role && role === natural) return player;
    const overall = clamp((player.overall ?? 70) - (role === natural ? 0 : OFF_ROLE_PENALTY), 40, 99);
    const reshaped = enginePlayer(player.id, player.nickname ?? player.id, overall, role, createSeededRng(`${state.seed}:role:${player.id}:${role}`));
    return { ...reshaped, baseId: player.baseId ?? reshaped.baseId };
  });
  return adjusted.map((player) => {
    const relationship = relationshipOf(state, player.id);
    return { player: { ...player, overall: clamp((player.overall ?? 60) + synergyBump(relationship) - penalty, 40, 99) }, relationship, synergy: clamp(relationship, 0, 100) };
  });
}

/** Conversa entre campeonatos: na maioria um bom papo; repetir com o mesmo no mesmo dia rende menos. */
export interface TalkResult {
  state: PlayerCareerState;
  mateId: string;
  delta: number;
  line: string;
}

export const TALK_LINES = {
  good: [
    'Papo reto: ele te mostrou a demo do próximo adversário.',
    'Ficou até tarde treinando mira com você.',
    'Pizza depois do treino. O time está leve.',
    'Ele está sentindo pressão, mas confia na call.'
  ],
  neutral: [
    'Trocou ideia rápida sobre o mapa da semana.',
    'Conversa rápida de aquecimento.',
    'Ele preferiu focar no aquecimento.'
  ],
  friction: [
    'Vocês discordaram sobre a execução do A. Ficou um clima.',
    'Ele ainda cobra o round em que você não esperou o trade.'
  ]
} as const;

export function talkTo(state: PlayerCareerState, mateId: string): TalkResult {
  const talked = state.talks[mateId] ?? 0;
  const rng = createSeededRng(`${state.seed}:talk:${mateId}:${talked}`);
  const roll = rng();
  // Conversa nem sempre ajuda: 15% de atrito, e quem já é parceiro (85+) quase não sobe mais.
  const kind = roll < 0.55 ? 'good' : roll < 0.85 ? 'neutral' : 'friction';
  const current0 = relationshipOf(state, mateId);
  const good = current0 >= 85 ? 1 : 3 + Math.floor(rng() * 4);
  const base = kind === 'good' ? good : kind === 'neutral' ? 1 : -3;
  // Sem falar o idioma do time, a conversa rende menos (básico 75%, não fala 50%).
  const barrier = [1, 0.75, 0.5][myLanguageFit(state).penalty] ?? 1;
  const delta = talked >= 2 ? 0 : Math.round(base * (talked === 1 ? 0.5 : 1) * (base > 0 ? barrier : 1));
  const lines = TALK_LINES[kind];
  const line = delta === 0 && talked >= 2 ? 'Vocês já conversaram bastante esta semana. Foco no servidor.' : lines[Math.floor(rng() * lines.length)];
  const current = relationshipOf(state, mateId);
  return {
    state: {
      ...state,
      relationships: { ...state.relationships, [mateId]: clamp(current + delta, 0, 100) },
      talks: { ...state.talks, [mateId]: talked + 1 }
    },
    mateId,
    delta,
    line
  };
}

/** Resultado de campeonato aperta o elenco: título cria laço, eliminação cobra um preço pequeno. */
export interface ResultExtras { mvp?: boolean; aces?: number; quads?: number; clutches?: number }

export function celebrateResult(state: PlayerCareerState, placement: string, level = 4, extras: ResultExtras = {}): PlayerCareerState {
  const delta = placement === 'Campeão' ? 3 : placement === 'Vice' ? 2 : placement === 'Semis' ? 0 : -3;
  const relationships: Record<string, number> = { ...state.relationships };
  // Laço não fica no teto sozinho: depois do resultado, a relação volta 8% em direção a 60.
  for (const mate of matesOf(state)) {
    const after = clamp(relationshipOf(state, mate.player.id) + delta, 0, 100);
    relationships[mate.player.id] = clamp(Math.round(after - (after - 60) * 0.08), 0, 100);
  }
  // Moral: título levanta, cair nas quartas pesa, e tudo volta 15% para o normal (60).
  const moraleDelta = placement === 'Campeão' ? 8 : placement === 'Vice' ? 3 : placement === 'Semis' ? 0 : -6;
  const moraleAfter = clamp((state.morale ?? 60) + moraleDelta + (extras.mvp ? 3 : 0), 0, 100);
  // Jogar campeonato cansa (+8); fãs vêm de resultado, mais no tier alto.
  const tierWeight = Math.max(1, 6 - level);
  const placeFame = placement === 'Campeão' ? 120 * tierWeight * tierWeight : placement === 'Vice' ? 50 * tierWeight * tierWeight : placement === 'Semis' ? 15 * tierWeight * tierWeight : 0;
  // MVP e jogada absurda (ace, quad, clutch) viralizam: rendem fãs mesmo sem título.
  const playFame = ((extras.aces ?? 0) * 25 + (extras.quads ?? 0) * 8 + (extras.clutches ?? 0) * 4) * tierWeight;
  const fameGain = placeFame + (extras.mvp ? 60 * tierWeight * tierWeight : 0) + playFame;
  // O campeonato cansa (+8 no pico); a semana até o próximo recupera 12 sozinha. Sem treino pesado, o cansaço cai.
  const peak = clamp((state.fatigue ?? 0) + EVENT_FATIGUE, 0, 100);
  const fatigue = clamp(peak - WEEK_RECOVERY, 0, 100);
  // Corpo no limite (85+ no pico): metade das vezes vem uma pancada leve e a forma cai 2 até o próximo campeonato.
  const rng = createSeededRng(`${state.seed}:knock:${state.seasonNumber}:${(state.calendar ?? []).filter((entry) => entry.result).length}`);
  const knocked = peak >= 85 && rng() < 0.5;
  // Imersão: cada campeonato no time ensina um pouco do idioma da call.
  const fit = myLanguageFit(state);
  const languages = fit.fluency < NON_NATIVE_MAX ? learn(state, fit.language, 5) : state.languages;
  return {
    ...state,
    ...(languages ? { languages } : {}),
    relationships,
    morale: clamp(Math.round(moraleAfter - (moraleAfter - 60) * 0.15), 0, 100),
    fatigue,
    fame: (state.fame ?? 0) + fameGain,
    ...(knocked ? { form: clamp((state.form ?? 0) - 2, -3, 3), knock: 'Dor no punho de tanto treinar: forma −2 no próximo campeonato.' } : {})
  };
}

/** Treina um mapa com o time (uma vez por semana): +8 no mapa (até +30), cansa 5. */
export function trainMap(state: PlayerCareerState, mapId: MapId): { state: PlayerCareerState; line: string } {
  const window = trainingWindowOf(state);
  if (!window || state.mapTrainedWindow === window) return { state, line: 'O treino de mapa da semana já foi feito.' };
  const before = state.mapTraining?.[mapId] ?? 0;
  const after = Math.min(MAP_TRAIN_CAP, before + MAP_TRAIN_STEP);
  const name = MAP_NAMES[mapId] ?? mapId;
  return {
    state: { ...state, mapTraining: { ...(state.mapTraining ?? {}), [mapId]: after }, mapTrainedWindow: window, fatigue: clamp((state.fatigue ?? 0) + 5, 0, 100) },
    line: after > before ? `${name}: +${after - before} de entrosamento no mapa. Cansaço +5.` : `${name} já está no máximo de treino.`
  };
}

/** Pode trocar de função agora? (uma vez por temporada, temporada em andamento) */
export const canChangeRole = (state: PlayerCareerState): boolean =>
  state.status === 'ACTIVE' && Boolean(state.calendar?.some((entry) => entry.status === 'UPCOMING')) && state.roleChange?.season !== state.seasonNumber;

/**
 * Troca de função: você passa a jogar `role` e o parceiro dela assume a sua antiga. É aposta: a chance de dar certo
 * sobe com os atributos da nova função; deu certo, +1 de overall; deu errado, −2 até o fim da temporada.
 */
export function changeRole(state: PlayerCareerState, role: PlayerRole): { state: PlayerCareerState; good: boolean; line: string } {
  if (!canChangeRole(state) || role === state.role) return { state, good: false, line: '' };
  return takeRole(state, role, false);
}

/** A função que você joga melhor fora a atual (pelo atributo da função na sua carta). */
export function bestOtherRole(state: PlayerCareerState): PlayerRole {
  const me = myPlayerOf(state);
  const skillOf = (role: PlayerRole) => Number((role === 'awper' ? me.awp : role === 'igl' ? me.igl : role === 'entry' ? me.entry : role === 'support' ? me.support : role === 'lurker' ? me.clutch : me.firepower) ?? 60);
  return SLOTS.filter((role) => role !== state.role).sort((a, b) => skillOf(b) - skillOf(a))[0];
}

/** Assume uma função (pedido seu, do coach ou do time): encaixa ou não pela sua carta na função nova. Vale mesmo
 *  que você já tenha trocado nesta temporada (a troca pedida pelo time não conta como o seu pedido). */
export function takeRole(state: PlayerCareerState, role: PlayerRole, byTeam = true): { state: PlayerCareerState; good: boolean; line: string } {
  if (role === state.role) return { state, good: true, line: '' };
  const me = myPlayerOf(state);
  const skill = role === 'awper' ? me.awp : role === 'igl' ? me.igl : role === 'entry' ? me.entry : role === 'support' ? me.support : role === 'lurker' ? me.clutch : me.firepower;
  const chance = clamp(0.45 + ((Number(skill ?? 60) - Number(me.overall ?? 70)) / 40) + ((state.morale ?? 60) - 60) / 200, 0.2, 0.85);
  const good = createSeededRng(`${state.seed}:role:${state.seasonNumber}:${role}`)() < chance;
  const from = state.role;
  const next: PlayerCareerState = {
    ...state,
    role,
    overall: clamp(state.overall + (good ? 1 : -2), 40, 99),
    // A troca pedida pelo time não gasta a sua troca da temporada.
    roleChange: byTeam ? state.roleChange : { from, season: state.seasonNumber, outcome: good ? 'good' : 'bad' },
    morale: clamp((state.morale ?? 60) + (good ? 3 : -4), 0, 100)
  };
  const line = good
    ? `Encaixou: você virou ${ROLE_NAME[role]} e o time gostou. +1 de overall.`
    : `Ainda não encaixou: ${ROLE_NAME[role]} exige outra leitura. −2 de overall até se adaptar.`;
  return { state: next, good, line };
}

const ROLE_NAME: Record<PlayerRole, string> = { awper: 'AWPer', igl: 'IGL', entry: 'entry', support: 'suporte', lurker: 'lurker', rifler: 'rifler' };

/** Pode pedir a saída de um parceiro agora? (time de verdade, uma vez por temporada) */
export const canKickMate = (state: PlayerCareerState): boolean =>
  state.status === 'ACTIVE' && state.orgId !== 'lan-house' && state.kickRequestedSeason !== state.seasonNumber;

/**
 * Você pede à diretoria a saída de um parceiro. Pesa a sua força contra a dele, reputação, fãs e a relação com
 * ele. Aceitou: entra um substituto (às vezes melhor, às vezes pior) e o elenco sente (−3 com todos). Recusou: a
 * relação com ele despenca (−25), moral −5.
 */
/** O nível do time sem um jogador: a média dos outros, 2 abaixo (quem a diretoria consegue contratar para a vaga). */
export function teamFloor(roster: Player[], leaving: Player): number {
  const others = roster.filter((other) => other !== leaving);
  return others.length ? Math.round(others.reduce((sum, other) => sum + Number(other.overall ?? 70), 0) / others.length - 2) : Number(leaving.overall ?? 70);
}

/** Quem entra no lugar de quem saiu a seu pedido: no nível do time (não no de quem saiu), com uma variação. */
export const replacementOverall = (leavingOverall: number, floor: number, delta: number) => clamp(Math.max(leavingOverall, floor) + delta, 40, 99);

export function kickMate(state: PlayerCareerState, mateId: string): { state: PlayerCareerState; accepted: boolean; line: string } {
  if (!canKickMate(state)) return { state, accepted: false, line: '' };
  const mates = matesOf(state);
  const mate = mates.find((candidate) => candidate.player.id === mateId);
  if (!mate) return { state, accepted: false, line: '' };
  const rng = createSeededRng(`${state.seed}:kick:${state.seasonNumber}:${mateId}`);
  const fame = state.fame ?? 0;
  const chance = clamp(0.3 + (state.overall - Number(mate.player.overall ?? 70)) / 30 + ((state.reputation ?? 50) - 50) / 150 + (fame >= 50000 ? 0.15 : fame >= 10000 ? 0.07 : 0) - mate.relationship / 400, 0.08, 0.85);
  const accepted = rng() < chance;
  const nick = mate.player.nickname ?? 'parceiro';
  const base = { ...state, kickRequestedSeason: state.seasonNumber };
  if (!accepted) {
    return {
      state: { ...base, relationships: { ...state.relationships, [mateId]: clamp(mate.relationship - 25, 0, 100) }, morale: clamp((state.morale ?? 60) - 5, 0, 100) },
      accepted, line: `A diretoria segurou ${nick}. Ele soube do pedido: a relação despencou.`
    };
  }
  const replacement = randomNick(`${state.seed}:replacement:${state.seasonNumber}:${mateId}`);
  const delta = Math.round((rng() - 0.45) * 8);
  // O substituto vem no nível do time (média dos outros, 2 abaixo), não no de quem saiu.
  const raw = Number(mate.player.overall ?? 70) - synergyBump(mate.relationship);
  const others = mates.filter((other) => other.player.id !== mateId);
  const floor = others.length ? Math.round(others.reduce((sum, other) => sum + Number(other.player.overall ?? 70) - synergyBump(other.relationship), 0) / others.length - 2) : raw;
  const arriving = replacementOverall(raw, floor, delta);
  const relationships = Object.fromEntries(mates.filter((other) => other.player.id !== mateId).map((other) => [other.player.id, clamp(other.relationship - 3, 0, 100)]));
  const kicked = { ...(state.kickedMates ?? {}) };
  kicked[state.orgId] = [...(kicked[state.orgId] ?? []), { nick, replacement, delta }];
  return {
    state: { ...base, kickedMates: kicked, relationships: { ...state.relationships, ...relationships } },
    accepted, line: `${nick} saiu. Entra ${replacement}, overall ${arriving}, no nível do time. O vestiário sentiu.`
  };
}

/** Cansaço do campeonato e a recuperação natural da semana seguinte. */
export const EVENT_FATIGUE = 8;
export const WEEK_RECOVERY = 12;

/** Quanto o cansaço tira de overall em quadra: 1 a partir de 60, 2 a partir de 80. */
export const fatiguePenalty = (fatigue: number | undefined): number => ((fatigue ?? 0) >= 80 ? 2 : (fatigue ?? 0) >= 60 ? 1 : 0);

/** Janela atual de treino: uma por intervalo entre campeonatos (nenhuma se a temporada acabou). */
export function trainingWindowOf(state: PlayerCareerState): string | null {
  const next = state.calendar?.find((entry) => entry.status === 'UPCOMING');
  return next ? `${state.seasonNumber}:${next.index}` : null;
}

/**
 * O treinador da sua org: atributos derivados do nível (mecânica declarada, como o poder dos rivais) —
 * identidade de coach não foi coletada, então é placeholder no padrão de honestidade do jogo.
 */
/** O coach do seu time no mundo da carreira (real do catálogo, gerado ou ex-jogador); null na lan house. */
export const careerCoachOf = (state: PlayerCareerState): CareerCoach | null =>
  state.orgId === 'lan-house' ? null : coachOfOrg(state.seed, state.seasonNumber, state.orgId);

export function coachOf(state: PlayerCareerState): Coach {
  const org = orgOf(state.orgId, state);
  const world = careerCoachOf(state);
  if (world) {
    return {
      id: world.id, baseId: world.id, name: world.name, teamId: org.id, year: state.year, game: null,
      tactics: world.tactics, discipline: world.discipline, aggression: world.aggression, development: world.development, overall: world.overall,
      rarity: 'rare', confidence: world.real ? 'high' : 'placeholder', needsReview: false,
      source: { page: null, url: null, year: null, note: world.real ? 'Coach real do catálogo; idade estimada.' : 'Coach do mundo da carreira (gerado ou ex-jogador).' }
    };
  }
  const rng = createSeededRng(`${state.seed}:coach:${org.id}`);
  const band = ORG_BASE_POWER[org.level] ?? 60;
  const attr = () => Math.max(40, Math.min(99, band + Math.round((rng() - 0.5) * 14)));
  const tactics = attr();
  const discipline = attr();
  const aggression = attr();
  const development = attr();
  return {
    id: `${org.id}:coach`,
    baseId: `${org.id}:coach`,
    name: 'Treinador',
    teamId: org.id,
    year: state.year,
    game: null,
    tactics,
    discipline,
    aggression,
    development,
    overall: Math.round((tactics + discipline + aggression + development) / 4),
    rarity: 'rare',
    confidence: 'placeholder',
    needsReview: false,
    source: { page: null, url: null, year: null, note: 'Atributos derivados do nível da org (mecânica da Carreira de Jogador); identidade de coach não coletada.' }
  };
}

export interface TrainResult {
  state: PlayerCareerState;
  focus: TrainingFocus;
  /** O que subiu na carta (efeitos da Dinastia, respeitando o teto por atributo). */
  gained: Partial<Record<TrainedAttribute, number>>;
  overallUp: boolean;
  line: string;
}

const TRAIN_LINES: Record<TrainingFocus, string> = {
  aim: 'Uma hora de deathmatch e treino de mira: o spray tá outro.',
  utility: 'Smoke e flash no servidor vazio: o utilitário ficou limpo.',
  clutch: 'Retake 1vX no treino: cabeça fria nas finais de round.',
  opening: 'Entrada em bombsite com o coach: timing de entry afiado.',
  recovery: 'Alongamento, respiração e uma boa noite de sono: cabeça renovada.'
};

export function trainMe(state: PlayerCareerState, meBase: Player, focus: TrainingFocus): TrainResult {
  const window = trainingWindowOf(state);
  if (!window || state.trainedWindow === window) {
    return { state, focus, gained: {}, overallUp: false, line: 'Já treinou nesta semana. O próximo treino abre depois do campeonato.' };
  }
  const trained = applyTraining(meBase, focus);
  const gained: Partial<Record<TrainedAttribute, number>> = {};
  const nextTrained: TrainedBonus = { ...state.trained };
  for (const [key, value] of Object.entries(trained) as Array<[TrainedAttribute, number]>) {
    const attr = key as TrainedAttribute;
    const before = Number(meBase[attr] ?? 60);
    const rose = Math.max(0, Number(trained[attr] ?? before) - before);
    if (!rose) continue;
    const already = state.trained[attr] ?? 0;
    const room = Math.max(0, TRAIN_CAP - already);
    const apply = Math.min(rose, room);
    if (apply > 0) {
      gained[attr] = (gained[attr] ?? 0) + apply;
      nextTrained[attr] = already + apply;
    }
  }
  const trainCount = state.trainCount + 1;
  const overallUp = trainCount % OVERALL_EVERY === 0 && state.overall < state.truePotential;
  const anyGain = Object.keys(gained).length > 0 || overallUp;
  return {
    state: {
      ...state,
      trained: nextTrained,
      trainedWindow: window,
      trainCount,
      ...(overallUp ? { overall: state.overall + 1 } : {})
    },
    focus,
    gained,
    overallUp,
    line: anyGain ? TRAIN_LINES[focus] + (overallUp ? ' Treino em dia: overall +1.' : '') : 'Esse atributo já está no teto do treino. O resto vem jogando.'
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Banco e escalação: um reserva por time (jovem da base, alguém dos pugs, stand-in), promover a titular (quem sai
// vai para o banco e não gosta) e, sendo IGL, trocar a função de dois parceiros (cada um aceita ou não).

/** O plano do time atual (vazio se você mudou de time). */
export function planOf(state: PlayerCareerState): SquadPlan {
  return state.squadPlan && state.squadPlan.orgId === state.orgId ? state.squadPlan : { orgId: state.orgId, lineup: {}, reserve: null, roles: {} };
}

export type ReserveKind = 'jovem' | 'pugs' | 'stand-in';

/** Um reserva novo no banco: o jovem chega bem abaixo e com teto alto; o dos pugs um pouco abaixo; o stand-in
 *  quase no nível, sem crescer. Substitui o reserva anterior (que sai do time). */
export function addReserve(state: PlayerCareerState, kind: ReserveKind, role?: PlayerRole): { state: PlayerCareerState; reserve: BenchPlayer; line: string } {
  const plan = planOf(state);
  const mates = matesOf(state);
  const average = mates.reduce((sum, mate) => sum + (mate.player.overall ?? 70) - synergyBump(mate.relationship), 0) / Math.max(1, mates.length);
  const rng = createSeededRng(`${state.seed}:reserve:${state.seasonNumber}:${kind}:${state.calendar?.filter((entry) => entry.status === 'PLAYED').length ?? 0}`);
  const year = state.year;
  const age = kind === 'jovem' ? 17 + Math.floor(rng() * 3) : kind === 'pugs' ? 18 + Math.floor(rng() * 5) : 22 + Math.floor(rng() * 6);
  const overall = Math.round(clamp(average - (kind === 'jovem' ? 9 : kind === 'pugs' ? 5 : 3) + (rng() - 0.5) * 4, 40, 95));
  const potential = kind === 'stand-in' ? overall : clamp(overall + (kind === 'jovem' ? 12 + Math.floor(rng() * 10) : 5 + Math.floor(rng() * 6)), overall, 97);
  const org = orgIn(state.seed, state.seasonNumber, state.orgId);
  const counts = new Map<string, number>();
  for (const member of org?.roster ?? []) if (member.country) counts.set(member.country, (counts.get(member.country) ?? 0) + 1);
  const country = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? state.country;
  const reserve: BenchPlayer = {
    nick: randomNick(`${state.seed}:reserve-nick:${state.seasonNumber}:${kind}:${Math.floor(rng() * 1e6)}`),
    role: role ?? SLOTS[Math.floor(rng() * SLOTS.length)], overall, potential, born: year - age, country
  };
  const label = kind === 'jovem' ? 'jovem da base' : kind === 'pugs' ? 'veio dos pugs' : 'stand-in';
  return { state: { ...state, squadPlan: { ...plan, reserve } }, reserve, line: `${reserve.nick} (${label}, ${age} anos, ${reserve.overall}) está no banco.` };
}

/** O reserva entra no lugar do parceiro; o parceiro vai para o banco. Ele não gosta (relação −12); se o reserva é
 *  claramente melhor, o resto do elenco entende (+1). */
export function promoteReserve(state: PlayerCareerState, mateId: string): { state: PlayerCareerState; line: string } {
  const plan = planOf(state);
  const reserve = plan.reserve;
  const mates = matesOf(state);
  const mate = mates.find((candidate) => candidate.player.id === mateId);
  if (!reserve || !mate) return { state, line: '' };
  const nick = mate.player.nickname ?? 'parceiro';
  const occupant = nick.toLowerCase();
  // A vaga: o titular original daquele lugar (quem está nela pode já ser alguém do banco).
  const slotKey = Object.entries(plan.lineup).find(([, sub]) => sub.nick.toLowerCase() === occupant)?.[0] ?? occupant;
  const lineup = { ...plan.lineup };
  if (reserve.nick.toLowerCase() === slotKey) delete lineup[slotKey];
  else lineup[slotKey] = reserve;
  const raw = (mate.player.overall ?? 70) - synergyBump(mate.relationship);
  const benched: BenchPlayer = plan.lineup[slotKey] && plan.lineup[slotKey].nick.toLowerCase() === occupant
    ? plan.lineup[slotKey]
    : (() => {
      const member = orgIn(state.seed, state.seasonNumber, state.orgId)?.roster.find((candidate) => candidate.nick.toLowerCase() === occupant);
      const born = member ? memberBirthYear(member) : null;
      return { nick, role: naturalRoleOf(state, mate), overall: Math.round(raw), potential: Math.round(raw), born: born ?? state.year - 26, country: member?.country ?? null };
    })();
  const better = reserve.overall >= raw + 3;
  const relationships: Record<string, number> = { ...state.relationships, [mateId]: clamp(mate.relationship - 12, 0, 100) };
  if (better) for (const other of mates) if (other.player.id !== mateId) relationships[other.player.id] = clamp(other.relationship + 1, 0, 100);
  return {
    state: { ...state, relationships, squadPlan: { ...plan, lineup, reserve: benched } },
    line: `${reserve.nick} entra no lugar de ${nick}, que vai para o banco${better ? '. O elenco entendeu a troca.' : ' e não gostou nada.'}`
  };
}

/** Sendo IGL, uma vez por semana você pede para dois parceiros trocarem de função. Cada um aceita mais fácil se
 *  gosta de você e se a função nova é a dele; quem recusa fica chateado. */
export function canSwapRoles(state: PlayerCareerState): boolean {
  const window = trainingWindowOf(state);
  return state.role === 'igl' && state.orgId !== 'lan-house' && Boolean(window) && planOf(state).swapWindow !== window;
}

export function swapMateRoles(state: PlayerCareerState, mateIdA: string, mateIdB: string): { state: PlayerCareerState; done: boolean; line: string } {
  if (!canSwapRoles(state) || mateIdA === mateIdB) return { state, done: false, line: '' };
  const plan = planOf(state);
  const mates = matesOf(state);
  const a = mates.find((mate) => mate.player.id === mateIdA);
  const b = mates.find((mate) => mate.player.id === mateIdB);
  if (!a || !b) return { state, done: false, line: '' };
  const roleA = (a.player.role ?? 'support') as PlayerRole;
  const roleB = (b.player.role ?? 'support') as PlayerRole;
  const rng = createSeededRng(`${state.seed}:swap:${state.seasonNumber}:${trainingWindowOf(state)}:${mateIdA}:${mateIdB}`);
  const accepts = (mate: SquadMate, role: PlayerRole) => rng() < clamp(0.35 + mate.relationship / 150 + (naturalRoleOf(state, mate) === role ? 0.25 : 0), 0.1, 0.95);
  const okA = accepts(a, roleB);
  const okB = accepts(b, roleA);
  const nickA = a.player.nickname ?? 'parceiro';
  const nickB = b.player.nickname ?? 'parceiro';
  const base = { ...plan, swapWindow: trainingWindowOf(state) };
  if (okA && okB) {
    const relationships = { ...state.relationships, [mateIdA]: clamp(a.relationship + 2, 0, 100), [mateIdB]: clamp(b.relationship + 2, 0, 100) };
    return {
      state: { ...state, relationships, squadPlan: { ...base, roles: { ...plan.roles, [nickA.toLowerCase()]: roleB, [nickB.toLowerCase()]: roleA } } },
      done: true,
      line: `${nickA} vai de ${ROLE_NAME[roleB]} e ${nickB} de ${ROLE_NAME[roleA]}. Os dois toparam.`
    };
  }
  const relationships = { ...state.relationships };
  if (!okA) relationships[mateIdA] = clamp(a.relationship - 8, 0, 100);
  if (!okB) relationships[mateIdB] = clamp(b.relationship - 8, 0, 100);
  const refused = [!okA ? nickA : null, !okB ? nickB : null].filter(Boolean).join(' e ');
  return { state: { ...state, relationships, squadPlan: base }, done: false, line: `${refused} não ${!okA && !okB ? 'toparam' : 'topou'} a troca. Ficou um clima.` };
}

/** A função natural do parceiro: a da vaga dele no elenco (ou a de quem veio do banco). */
export function naturalRoleOf(state: PlayerCareerState, mate: SquadMate): PlayerRole {
  const plan = planOf(state);
  const nick = (mate.player.nickname ?? '').toLowerCase();
  const fromBench = Object.values(plan.lineup).find((sub) => sub.nick.toLowerCase() === nick);
  if (fromBench) return fromBench.role;
  const org = orgIn(state.seed, state.seasonNumber, state.orgId);
  const member = org?.roster.find((candidate) => candidate.nick.toLowerCase() === nick);
  const role = member ? memberRoles(member)[0] : null;
  return (role && (SLOTS as string[]).includes(role) ? role : mate.player.role ?? 'support') as PlayerRole;
}
