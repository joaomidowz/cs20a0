// src/lib/game/playerCareer/squad.ts
// O elenco do seu time na Carreira de Jogador: os mesmos parceiros que entram em quadra, com
// relacionamento (sinergia) que dá bônus real de overall, conversas entre campeonatos e treino
// escolhido — o efeito do treino é o MESMO da Dinastia (dynasty/training.ts), aplicado como bônus
// por cima da carta derivada do overall.
import { createSeededRng } from '../simulation';
import { applyTraining } from '../dynasty/training';
import type { Coach, Player, TrainingFocus } from '../types';
import { ORG_BASE_POWER } from './data';
// Ciclo deliberado (só em nível de função): o squad é a fonte única dos parceiros e o live consome.
import { enginePlayer, SLOTS, sceneOrgEnginePlayers } from './live';
import { orgOf, type PlayerCareerState, type TrainedAttribute, type TrainedBonus } from './engine';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Teto do bônus de treino por atributo: treino afina, quem sobe de verdade é a temporada (aging). */
export const TRAIN_CAP = 6;
/** A cada 3 treinos o overall senta +1 — se ainda estiver abaixo do teto da carreira. */
const OVERALL_EVERY = 3;

/** Saves antigos ganham os campos do elenco com default — nunca recria o que já existe. */
export function ensureSquad(state: PlayerCareerState): PlayerCareerState {
  return {
    ...state,
    relationships: state.relationships ?? {},
    talks: state.talks ?? {},
    trained: state.trained ?? {},
    trainedWindow: state.trainedWindow ?? null,
    trainCount: state.trainCount ?? 0,
    morale: state.morale ?? 60,
    form: state.form ?? 0,
    fame: state.fame ?? 0
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
  const overall = clamp(state.overall + clamp(state.form ?? 0, -3, 3), 40, 99);
  const card = applyTrained(enginePlayer(`${state.seed}:me`, state.nick, overall, state.role, rng), state.trained ?? {});
  const mental = moraleBump(state.morale);
  return mental ? { ...card, mental: clamp(Number(card.mental ?? 60) + mental, 40, 99) } : card;
}

/** Entrosada joga junto: relação alta dá até +3 de overall pro parceiro, baixa tira até 2. */
export const synergyBump = (relationship: number): number => clamp(Math.round((relationship - 55) / 15), -2, 3);

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

/** Sai do elenco o slot da SUA função — e quem cedeu a vaga (seatToTake lê roles da coleta, o motor distribui
 *  nicks por slot) troca de nick com esse slot, pra nunca sobrar em quadra quem você substituiu. */
function withoutSeat(players: Player[], state: PlayerCareerState): Player[] {
  const leaving = players.find((player) => player.role === state.role);
  const mates = players.filter((player) => player !== leaving).slice(0, 4);
  const seat = [...state.seatsTaken].reverse().find((taken) => taken.orgId === state.orgId);
  const seatIndex = seat && leaving ? mates.findIndex((player) => player.nickname === seat.nick) : -1;
  if (seatIndex < 0 || !leaving) return mates;
  return mates.map((player, index) => (index === seatIndex ? { ...player, nickname: leaving.nickname } : player));
}

/** Os 4 parceiros da temporada — exatamente quem entra em quadra com você, com o bônus de sinergia no overall. */
export function matesOf(state: PlayerCareerState): SquadMate[] {
  const org = orgOf(state.orgId);
  const seasonKey = `${state.seed}:season:${state.seasonNumber}`;
  const roster: Player[] = org.id === 'lan-house'
    ? SLOTS.filter((role) => role !== state.role)
        .map((role, index) => enginePlayer(`${state.seed}:mate:${role}`, `Mate ${index + 1}`, ORG_BASE_POWER[5], role, createSeededRng(`${state.seed}:mates:${seasonKey}`)))
    : withoutSeat(sceneOrgEnginePlayers(org as never, seasonKey), state);
  return roster.map((player) => {
    const relationship = relationshipOf(state, player.id);
    return { player: { ...player, overall: clamp((player.overall ?? 60) + synergyBump(relationship), 40, 99) }, relationship, synergy: clamp(relationship, 0, 100) };
  });
}

/** Conversa entre campeonatos: na maioria um bom papo; repetir com o mesmo no mesmo dia rende menos. */
export interface TalkResult {
  state: PlayerCareerState;
  mateId: string;
  delta: number;
  line: string;
}

const TALK_LINES = {
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
  const kind = roll < 0.62 ? 'good' : roll < 0.92 ? 'neutral' : 'friction';
  const base = kind === 'good' ? 3 + Math.floor(rng() * 4) : kind === 'neutral' ? 1 : -2;
  const delta = talked >= 2 ? 0 : Math.round(base * (talked === 1 ? 0.5 : 1));
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
export function celebrateResult(state: PlayerCareerState, placement: string): PlayerCareerState {
  const delta = placement === 'Campeão' ? 5 : placement === 'Vice' ? 3 : placement === 'Semis' ? 1 : -1;
  const relationships: Record<string, number> = { ...state.relationships };
  for (const mate of matesOf(state)) relationships[mate.player.id] = clamp(relationshipOf(state, mate.player.id) + delta, 0, 100);
  // Resultado mexe na moral: título levanta, cair nas quartas pesa.
  const moraleDelta = placement === 'Campeão' ? 8 : placement === 'Vice' ? 4 : placement === 'Semis' ? 1 : -4;
  return { ...state, relationships, morale: clamp((state.morale ?? 60) + moraleDelta, 0, 100) };
}

/** Janela atual de treino: uma por intervalo entre campeonatos (nenhuma se a temporada acabou). */
export function trainingWindowOf(state: PlayerCareerState): string | null {
  const next = state.calendar?.find((entry) => entry.status === 'UPCOMING');
  return next ? `${state.seasonNumber}:${next.index}` : null;
}

/**
 * O treinador da sua org: atributos derivados do nível (mecânica declarada, como o poder dos rivais) —
 * identidade de coach não foi coletada, então é placeholder no padrão de honestidade do jogo.
 */
export function coachOf(state: PlayerCareerState): Coach {
  const org = orgOf(state.orgId);
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
