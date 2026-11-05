// src/lib/game/playerCareer/rivals.ts
// Provocação de rival: antes de um campeonato, o IGL ou o entry de um time da sua chave fala de você. A resposta
// mexe na forma, na moral, nos fãs e na reputação, e o confronto vira pessoal: ganhar dele dá moral e fãs, perder
// dói. O nome é de um jogador real da cena (o elenco da temporada no mundo da carreira).
import { createSeededRng } from '../simulation';
import { memberNick, memberRoles } from './data';
import { orgOf, playedCount, type PlayerCareerState, type TournamentResult } from './engine';
import { sceneEventField } from './live';
import { orgIn } from './world';

export interface Rival { nick: string; role: string; orgId: string; orgName: string; eventIndex: number; line: string; response?: 'focus' | 'social' | 'class' }

const ROLE_NAME: Record<string, string> = { igl: 'IGL', entry: 'entry', awper: 'AWPer', lurker: 'lurker', support: 'suporte', rifler: 'rifler' };

export const TRASH_TALK = [
  (rival: string, me: string) => `"${me}? Só joga bem em servidor de treino. No palco a gente resolve."`,
  (rival: string, me: string) => `"Time do ${me} é marketing. Quero ver segurar o nosso execute."`,
  (rival: string, me: string) => `"Vou fazer o ${me} pedir pause no primeiro mapa."`,
  (rival: string, me: string) => `"Respeito, mas ${me} ainda não ganhou nada que importa."`,
  (rival: string, me: string) => `"Se o ${me} ganhar um duelo meu, eu pago a janta do time inteiro."`,
  (rival: string, me: string) => `"Já assisti as demos do ${me}. Ele repete tudo. Fácil de ler."`,
  (rival: string, me: string) => `"Hype demais pra pouco resultado. Vamos ver o ${me} sob pressão."`,
  (rival: string, me: string) => `"O ${me} fala muito na stream. No servidor eu falo por ele."`
];

/** Chance de provocação antes do campeonato: 18%, mais com fama e em evento grande. */
export function rivalChance(state: PlayerCareerState, eventIndex: number): number {
  const entry = state.calendar?.[eventIndex];
  const big = entry?.format === 'major' || entry?.tier === 'Major' || entry?.tier === 'S';
  const fame = state.fame ?? 0;
  return Math.min(0.4, 0.18 + (big ? 0.1 : 0) + (fame >= 20000 ? 0.08 : fame >= 5000 ? 0.04 : 0));
}

/** Sorteia (ou não) a provocação de um IGL/entry da sua chave. Não acontece com outro acontecimento pendente. */
export function rollRival(state: PlayerCareerState, eventIndex: number): PlayerCareerState {
  if (state.status !== 'ACTIVE' || state.pendingRival || state.pendingHappening || state.orgId === 'lan-house') return state;
  const rng = createSeededRng(`${state.seed}:rival:${state.seasonNumber}:${eventIndex}:${playedCount(state)}`);
  if (rng() >= rivalChance(state, eventIndex)) return state;
  const field = sceneEventField(state, eventIndex).filter((team) => !team.isUser);
  const team = field[Math.floor(rng() * field.length)];
  if (!team) return state;
  const org = orgIn(state.seed, state.seasonNumber, team.orgId);
  if (!org) return state;
  const loud = org.roster.filter((member) => ['igl', 'entry'].includes(memberRoles(member)[0] ?? ''));
  const member = (loud.length ? loud : org.roster)[Math.floor(rng() * (loud.length ? loud.length : org.roster.length))];
  if (!member) return state;
  const nick = memberNick(member);
  const role = memberRoles(member)[0] ?? 'rifler';
  const line = TRASH_TALK[Math.floor(rng() * TRASH_TALK.length)](nick, state.nick);
  return { ...state, pendingRival: { nick, role: ROLE_NAME[role] ?? role, orgId: team.orgId, orgName: team.name, eventIndex, line } };
}

export const RIVAL_CHOICES: Array<{ key: NonNullable<Rival['response']>; text: string; hint: string }> = [
  { key: 'focus', text: 'Guardar a raiva para o servidor', hint: 'Forma +2, moral +2. Ganhar dele vale o dobro de moral.' },
  { key: 'social', text: 'Responder nas redes', hint: 'Fãs e forma sobem, reputação cai. Perder para ele pesa mais.' },
  { key: 'class', text: 'Ignorar com classe', hint: 'Reputação +4, moral +1.' }
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const FAME_UNIT: Record<number, number> = { 5: 20, 4: 60, 3: 150, 2: 400, 1: 1000, 0: 2500 };

/** A sua resposta à provocação (fica guardada até o campeonato acabar). */
export function answerRival(state: PlayerCareerState, response: NonNullable<Rival['response']>): { state: PlayerCareerState; line: string } {
  const rival = state.pendingRival;
  if (!rival) return { state, line: '' };
  const level = orgOf(state.orgId, state).level;
  const base = { ...state, pendingRival: null, rival: { ...rival, response } };
  if (response === 'focus') {
    return { state: { ...base, form: clamp((state.form ?? 0) + 2, -3, 3), morale: clamp((state.morale ?? 60) + 2, 0, 100) }, line: `Você não respondeu. Mas anotou o nome: ${rival.nick}.` };
  }
  if (response === 'social') {
    const fame = 4 * (FAME_UNIT[level] ?? 100);
    return {
      state: { ...base, form: clamp((state.form ?? 0) + 1, -3, 3), morale: clamp((state.morale ?? 60) + 1, 0, 100), fame: (state.fame ?? 0) + fame, reputation: clamp((state.reputation ?? 50) - 4, 0, 100) },
      line: `A resposta viralizou: +${fame.toLocaleString('pt-BR')} fãs. Agora todo mundo quer ver ${state.nick} x ${rival.nick}.`
    };
  }
  return { state: { ...base, reputation: clamp((state.reputation ?? 50) + 4, 0, 100), morale: clamp((state.morale ?? 60) + 1, 0, 100) }, line: 'Resposta curta e educada. A imprensa gostou.' };
}

/** Depois do campeonato: enfrentou o time do rival? Ganhou ou perdeu dele? */
export function settleRival(state: PlayerCareerState, eventIndex: number, result: TournamentResult): { state: PlayerCareerState; line: string | null } {
  const rival = state.rival;
  if (!rival || rival.eventIndex !== eventIndex) return { state, line: null };
  const games = (result.opponents ?? []).filter((game) => game.team === rival.orgName);
  const cleared = { ...state, rival: null };
  if (!games.length) return { state: cleared, line: `${rival.nick} e ${rival.orgName} ficaram pelo caminho. Fica para a próxima.` };
  const won = games.some((game) => game.won);
  const level = orgOf(state.orgId, state).level;
  if (won) {
    const morale = rival.response === 'focus' ? 10 : 6;
    const fame = (rival.response === 'social' ? 6 : 3) * (FAME_UNIT[level] ?? 100);
    return {
      state: { ...cleared, morale: clamp((state.morale ?? 60) + morale, 0, 100), fame: (state.fame ?? 0) + fame, reputation: clamp((state.reputation ?? 50) + 2, 0, 100) },
      line: `Você calou o ${rival.nick}: vitória sobre a ${rival.orgName}. Moral +${morale}, +${fame.toLocaleString('pt-BR')} fãs.`
    };
  }
  const morale = rival.response === 'social' ? 10 : 6;
  return {
    state: { ...cleared, morale: clamp((state.morale ?? 60) - morale, 0, 100), ...(rival.response === 'social' ? { reputation: clamp((state.reputation ?? 50) - 3, 0, 100) } : {}) },
    line: `${rival.nick} riu por último: a ${rival.orgName} ganhou de vocês. Moral −${morale}.`
  };
}
