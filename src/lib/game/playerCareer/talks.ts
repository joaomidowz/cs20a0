// src/lib/game/playerCareer/talks.ts
// Conversas fora de partida. As 160 falas de career-lines (por função e situação) aparecem quando você clica em
// Conversar (titular, reserva ou coach) e também sozinhas: no início da temporada, antes e depois de um campeonato.
// A fala vem da função real de quem fala e do SEU momento (mental, atrito, sequência de séries). Cada conversa tem 3
// respostas; a melhor muda com o contexto e a ordem embaralha. Efeitos pequenos, com limite, e a mesma fala não volta
// antes do cooldown. A memória guarda as últimas conversas e quem ficou atravessado com você.
import rawLines from '$lib/data/cs/career-lines.game.json';
import { createSeededRng } from '../simulation';
import { orgOf, type PlayerCareerState, type PlayerRole, type TournamentResult } from './engine';
import { lifeOf, type CareerLife } from './life';
import { coachOf, matesOf, myLanguageFit, planOf, relationshipOf } from './squad';
import { sceneOrgEnginePlayers } from './live';
import { orgIn } from './world';

export type TalkSituation = 'mental_baixo' | 'mental_alto' | 'conflito' | 'sequencia_derrotas' | 'sequencia_vitorias' | 'inicio_temporada' | 'match_point_perdido';
export type TalkMoment = 'click' | 'season' | 'pre' | 'post';
export type TalkAnswerKey = 'ouvir' | 'propor' | 'firme';

interface LineRow { situation: string; speaker: string; text: string; tone: string; relMin: number; relMax: number; mindMin: number; mindMax: number; cooldown: number; weight: number; effects: string }
const LINES = (rawLines as unknown as { contextual: LineRow[]; decisive: LineRow[] });
export const CONTEXT_LINES = LINES.contextual;
export const DECISIVE_LINES = LINES.decisive;

export interface TalkSpeaker { kind: 'mate' | 'coach' | 'reserve'; id: string; name: string; role: PlayerRole | 'coach' }
export interface TalkOption { key: TalkAnswerKey; text: string }
export interface Talk { speaker: TalkSpeaker; situation: TalkSituation; moment: TalkMoment; line: string; lineKey: string; options: TalkOption[]; eventIndex?: number }

export interface TalkMemoryEntry { season: number; who: string; name: string; situation: TalkSituation; answer: TalkAnswerKey; delta: number }
export interface TalkMemory {
  /** Relógio das conversas (cada conversa soma 1): é a unidade do cooldown das falas. */
  n: number;
  /** Fala → valor de n quando foi usada. */
  used: Record<string, number>;
  /** As últimas 30 conversas (quem, o quê, como você respondeu). */
  log: TalkMemoryEntry[];
  /** Quem ficou atravessado com você: id → temporada em que começou (dura até a próxima). */
  grudges: Record<string, number>;
  /** Temporada em que o coach já abriu o ano. */
  seasonOpened?: number;
}

export const EMPTY_MEMORY: TalkMemory = { n: 0, used: {}, log: [], grudges: {} };
const LOG_CAP = 30;
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
export const memoryOf = (state: PlayerCareerState): TalkMemory => ({ ...EMPTY_MEMORY, ...(state.talkMemory ?? {}) });

/** A função da fala: o anchor das planilhas é o suporte ou o rifler que segura bomb. */
const speakerKeys = (role: TalkSpeaker['role']): string[] => (role === 'support' ? ['support', 'anchor'] : role === 'rifler' ? ['rifler', 'anchor'] : [role]);

/** Os resultados da carreira, do mais novo para o mais velho (sem os que você não jogou). */
function recentResults(state: PlayerCareerState): TournamentResult[] {
  const played = (state.calendar ?? []).filter((entry) => entry.result && !entry.result.skipped && !entry.result.benched).map((entry) => entry.result!);
  return [...state.history.flatMap((log) => log.tournaments.filter((entry) => !entry.skipped && !entry.benched)), ...played].reverse();
}

/** Séries seguidas ganhas e perdidas, contando da última para trás. */
export function seriesStreaks(state: PlayerCareerState): { won: number; lost: number } {
  const games = recentResults(state).flatMap((result) => [...(result.opponents ?? [])].reverse());
  const first = games[0];
  if (!first) return { won: 0, lost: 0 };
  let count = 0;
  for (const game of games) { if (game.won !== first.won) break; count += 1; }
  return first.won ? { won: count, lost: 0 } : { won: 0, lost: count };
}

/** As situações que valem agora para quem fala (rel = a relação com ele; com o coach, a confiança dele em você). */
export function situationsNow(state: PlayerCareerState, rel: number): TalkSituation[] {
  const life = lifeOf(state);
  const streak = seriesStreaks(state);
  const list: TalkSituation[] = [];
  if (rel <= 35) list.push('conflito');
  if (life.mind <= 35) list.push('mental_baixo');
  if (streak.lost >= 3) list.push('sequencia_derrotas');
  if (streak.won >= 4) list.push('sequencia_vitorias');
  if (life.mind >= 75) list.push('mental_alto');
  return list;
}

/** As respostas de cada situação. O texto é seu; o efeito depende do momento (ver answerEffects). */
const ANSWERS: Record<TalkSituation, Record<TalkAnswerKey, string>> = {
  conflito: { ouvir: 'Ouvir até o fim e ajustar', propor: 'Propor um treino só vocês dois', firme: 'Bater de frente' },
  mental_baixo: { ouvir: 'Aceitar a ajuda e baixar a carga', propor: 'Pedir uma revisão curta de demo', firme: 'Dizer que está tudo bem' },
  mental_alto: { ouvir: 'Agradecer e manter a rotina', propor: 'Pedir mais responsabilidade', firme: 'Dizer que ainda dá para mais' },
  sequencia_derrotas: { ouvir: 'Concordar e rever a rotina', propor: 'Propor uma mudança no treino', firme: 'Dizer que é fase e manter tudo' },
  sequencia_vitorias: { ouvir: 'Concordar: os erros ainda estão lá', propor: 'Pedir uma folga curta', firme: 'Curtir o momento' },
  inicio_temporada: { ouvir: 'Topar a meta', propor: 'Pedir uma meta menor', firme: 'Pedir mais protagonismo' },
  match_point_perdido: { ouvir: 'Aceitar a pausa e conversar', propor: 'Rever só os dois rounds finais', firme: 'Esconder o desgaste e treinar até tarde' }
};

export const SITUATION_LABEL: Record<TalkSituation, string> = {
  conflito: 'Atrito', mental_baixo: 'Cabeça pesada', mental_alto: 'Cabeça boa', sequencia_derrotas: 'Sequência de derrotas',
  sequencia_vitorias: 'Sequência de vitórias', inicio_temporada: 'Início da temporada', match_point_perdido: 'Match point perdido'
};
export const MOMENT_LABEL: Record<TalkMoment, string> = { click: 'Conversa', season: 'Início da temporada', pre: 'Antes do campeonato', post: 'Depois do campeonato' };

/** A meta do coach no início do ano, pelo tier do time e pelo ano anterior. */
function seasonGoal(state: PlayerCareerState): string {
  const level = orgOf(state.orgId, state).level;
  const last = state.history[state.history.length - 1];
  const titles = last ? last.tournaments.filter((entry) => entry.placement === 'Campeão').length : 0;
  if (level <= 1) return titles >= 3 ? 'Ano passado foi grande. A meta é repetir: brigar por todo título.' : 'A meta é chegar nos playoffs dos grandes e brigar pelo Major.';
  if (level === 2) return 'A meta é ganhar campeonato de Tier A e chamar a atenção de quem está em cima.';
  if (level === 3) return 'A meta é subir: ganhar os regionais e entrar nas classificatórias grandes.';
  return 'A meta é simples: jogar todo campeonato que der e ser visto.';
}

/** Quem fala: titular pelo id, reserva pelo nick, ou o coach. */
export function speakerOf(state: PlayerCareerState, kind: TalkSpeaker['kind'], id?: string): TalkSpeaker | null {
  if (state.orgId === 'lan-house') return null;
  if (kind === 'coach') { const coach = coachOf(state); return { kind, id: 'coach', name: coach.name, role: 'coach' }; }
  if (kind === 'reserve') {
    const reserve = planOf(state).reserve;
    if (!reserve) return null;
    // Titular que foi para o banco continua com a mesma relação (o id dele no elenco); jovem do banco tem o próprio.
    const org = orgIn(state.seed, state.seasonNumber, state.orgId);
    const original = org ? sceneOrgEnginePlayers(org, `${state.seed}:season:${state.seasonNumber}`).find((player) => (player.nickname ?? '').toLowerCase() === reserve.nick.toLowerCase()) : null;
    return { kind, id: original?.id ?? `${state.orgId}:bench:${reserve.nick.toLowerCase()}`, name: reserve.nick, role: reserve.role };
  }
  const mate = matesOf(state).find((candidate) => candidate.player.id === id);
  return mate ? { kind, id: mate.player.id, name: mate.player.nickname ?? 'Parceiro', role: (mate.player.role as PlayerRole) ?? 'rifler' } : null;
}

/** A relação com quem fala (coach: a confiança dele em você). */
export const relationWith = (state: PlayerCareerState, speaker: TalkSpeaker) => (speaker.kind === 'coach' ? lifeOf(state).coachTrust : relationshipOf(state, speaker.id));

/** Ordem das respostas: fixa por conversa (seed), nunca "a primeira é a certa". */
function shuffled(state: PlayerCareerState, situation: TalkSituation, salt: string): TalkOption[] {
  const rng = createSeededRng(`${state.seed}:talk-order:${salt}`);
  const keys: TalkAnswerKey[] = ['ouvir', 'propor', 'firme'];
  for (let i = keys.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
  return keys.map((key) => ({ key, text: ANSWERS[situation][key] }));
}

function pickLine(state: PlayerCareerState, speaker: TalkSpeaker, situations: TalkSituation[], rel: number, salt: string): { situation: TalkSituation; text: string; key: string } | null {
  const memory = memoryOf(state);
  const mind = lifeOf(state).mind;
  const keys = speakerKeys(speaker.role);
  // Prioridade: atrito, mental baixo, derrotas, vitórias, mental alto (a ordem de situationsNow).
  for (const situation of situations) {
    const pool = CONTEXT_LINES.flatMap((line, index) => (line.situation === situation && keys.includes(line.speaker) && rel >= line.relMin && rel <= line.relMax
      && mind >= line.mindMin && mind <= line.mindMax && memory.n - (memory.used[`c${index}`] ?? -999) >= line.cooldown ? [{ line, key: `c${index}` }] : []));
    if (!pool.length) continue;
    const rng = createSeededRng(`${state.seed}:talk-line:${salt}`);
    const pick = pool[Math.floor(rng() * pool.length)];
    return { situation, text: pick.line.text, key: pick.key };
  }
  return null;
}

/** Uma conversa com alguém do time agora, ou null (sem situação: vira o papo rápido de sempre). */
export function startTalk(state: PlayerCareerState, speaker: TalkSpeaker, moment: TalkMoment = 'click', eventIndex?: number): Talk | null {
  // Duas conversas por semana com a mesma pessoa; a terceira não rende (como no papo rápido).
  if (speaker.kind !== 'coach' && (state.talks?.[speaker.id] ?? 0) >= 2) return null;
  const rel = relationWith(state, speaker);
  const memory = memoryOf(state);
  const salt = `${speaker.id}:${memory.n}:${state.seasonNumber}`;
  const picked = pickLine(state, speaker, situationsNow(state, rel), rel, salt);
  if (!picked) return null;
  return { speaker, situation: picked.situation, moment, line: picked.text, lineKey: picked.key, options: shuffled(state, picked.situation, salt), eventIndex };
}

/** O coach abre a temporada (uma vez por ano, com time de verdade e antes do primeiro campeonato). */
export function seasonTalk(state: PlayerCareerState): Talk | null {
  if (state.status !== 'ACTIVE' || state.orgId === 'lan-house' || !state.calendar?.length) return null;
  if (state.calendar.some((entry) => entry.status === 'PLAYED') || memoryOf(state).seasonOpened === state.seasonNumber) return null;
  const speaker = speakerOf(state, 'coach');
  if (!speaker) return null;
  return { speaker, situation: 'inicio_temporada', moment: 'season', line: seasonGoal(state), lineKey: `season:${state.seasonNumber}`, options: shuffled(state, 'inicio_temporada', `season:${state.seasonNumber}`) };
}

/** Marca que o ano já foi aberto sem conversa (lan house, ou o coach já falou). */
export const markSeasonOpened = (state: PlayerCareerState): PlayerCareerState => ({ ...state, talkMemory: { ...memoryOf(state), seasonOpened: state.seasonNumber } });

/**
 * Antes ou depois do campeonato alguém do time pode puxar conversa (pre 30%, post 45%), se houver situação.
 * Depois de um match point perdido com o mental baixo, quem fala é o coach (D09 das planilhas: fato conferido).
 */
export function momentTalk(state: PlayerCareerState, moment: 'pre' | 'post', eventIndex: number, lostMatchPoint = false): Talk | null {
  if (state.status !== 'ACTIVE' || state.orgId === 'lan-house' || state.pendingTalk) return null;
  const memory = memoryOf(state);
  const rng = createSeededRng(`${state.seed}:talk-moment:${state.seasonNumber}:${eventIndex}:${moment}`);
  const life = lifeOf(state);
  if (moment === 'post' && lostMatchPoint && life.mind <= 35 && memory.n - (memory.used.d09 ?? -999) >= 8) {
    const speaker = speakerOf(state, 'coach');
    if (speaker) {
      return { speaker, situation: 'match_point_perdido', moment, line: 'O coach percebe que você está se cobrando depois do match point perdido.', lineKey: 'd09', options: shuffled(state, 'match_point_perdido', `d09:${memory.n}`), eventIndex };
    }
  }
  if (rng() >= (moment === 'pre' ? 0.3 : 0.45)) return null;
  const mates = matesOf(state);
  // Quem puxa: com atrito, quem está mais distante; senão um sorteio entre titulares e coach.
  const coldest = [...mates].sort((a, b) => a.relationship - b.relationship)[0];
  const candidates: TalkSpeaker[] = [];
  if (coldest && coldest.relationship <= 35) candidates.push({ kind: 'mate', id: coldest.player.id, name: coldest.player.nickname ?? 'Parceiro', role: (coldest.player.role as PlayerRole) ?? 'rifler' });
  const coach = speakerOf(state, 'coach');
  const pool = [...mates.map((mate) => ({ kind: 'mate' as const, id: mate.player.id, name: mate.player.nickname ?? 'Parceiro', role: (mate.player.role as PlayerRole) ?? 'rifler' })), ...(coach ? [coach] : [])];
  for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  for (const speaker of [...candidates, ...pool]) {
    const talk = startTalk(state, speaker, moment, eventIndex);
    if (talk) return talk;
  }
  return null;
}

export interface TalkEffects { rel: number; mind: number; morale: number; fatigue: number; form: number; pressure: number; coachTrust: number }
const NONE: TalkEffects = { rel: 0, mind: 0, morale: 0, fatigue: 0, form: 0, pressure: 0, coachTrust: 0 };

/**
 * O que cada resposta faz, pelo momento. A melhor muda: com cansaço alto, baixar a carga; descansado, trabalhar;
 * com relação boa, pedir protagonismo; sem idioma, treino em dupla rende menos; bater de frente só cola quando você
 * está claramente em alta. Valores pequenos (no máximo ±5 por conversa).
 */
export function answerEffects(state: PlayerCareerState, talk: Talk, key: TalkAnswerKey): TalkEffects {
  const life = lifeOf(state);
  const rel = relationWith(state, talk.speaker);
  const fatigue = state.fatigue ?? 0;
  const languageOk = myLanguageFit(state).penalty === 0;
  const streak = seriesStreaks(state);
  const hot = streak.won >= 3 || life.mind >= 70;
  const effects: Partial<TalkEffects> = (() => {
    switch (talk.situation) {
      case 'conflito':
        if (key === 'ouvir') return { rel: 4, mind: 1 };
        if (key === 'propor') return languageOk ? { rel: 3, fatigue: 2, form: 1 } : { rel: 1, fatigue: 2 };
        return hot ? { rel: -1, morale: 1 } : { rel: -4, mind: -1 };
      case 'mental_baixo':
        if (key === 'ouvir') return fatigue >= 50 ? { mind: 5, fatigue: -6, rel: 1 } : { mind: 2, rel: 1 };
        if (key === 'propor') return fatigue >= 50 ? { mind: 1, fatigue: 2 } : { mind: 4, form: 1 };
        return { mind: -3, rel: -1 };
      case 'mental_alto':
        if (key === 'ouvir') return { mind: 1, rel: 2 };
        if (key === 'propor') return rel >= 60 ? { coachTrust: 4, pressure: 3, rel: 1 } : { rel: -2, pressure: 2 };
        return streak.won >= 3 ? { mind: 2, form: 1, pressure: 2 } : { rel: -1, pressure: 3 };
      case 'sequencia_derrotas':
        if (key === 'ouvir') return { mind: 2, morale: 1, rel: 1 };
        if (key === 'propor') return rel >= 55 ? { form: 1, rel: 2, fatigue: 2 } : { rel: -1, fatigue: 2 };
        return life.mind >= 60 ? { morale: 2, mind: 1 } : { mind: -2, morale: -1 };
      case 'sequencia_vitorias':
        if (key === 'ouvir') return { form: 1, fatigue: 1, rel: 1 };
        if (key === 'propor') return fatigue >= 50 ? { fatigue: -8, morale: 2 } : { morale: 1, form: -1 };
        return { morale: 3, mind: 1, pressure: 3 };
      case 'inicio_temporada':
        if (key === 'ouvir') return { pressure: 4, coachTrust: 3 };
        if (key === 'propor') return { pressure: -5, coachTrust: -2 };
        return state.overall >= averageMate(state) ? { coachTrust: 2, pressure: 3, morale: 1 } : { coachTrust: -3, pressure: 3 };
      case 'match_point_perdido':
        if (key === 'ouvir') return { mind: 4, fatigue: -2 };
        if (key === 'propor') return { mind: 1, form: 1 };
        return { fatigue: 4, mind: -3 };
    }
  })();
  // Quem está atravessado com você: o que é bom rende metade até o fim da próxima temporada.
  const grudge = memoryOf(state).grudges[talk.speaker.id];
  const grudgeOn = grudge !== undefined && state.seasonNumber - grudge <= 1;
  // A segunda conversa da semana com a mesma pessoa rende metade.
  const repeat = talk.speaker.kind !== 'coach' && (state.talks?.[talk.speaker.id] ?? 0) >= 1;
  const scale = (value: number | undefined) => {
    const base = value ?? 0;
    const halved = base > 0 && (grudgeOn || repeat) ? base / 2 : base;
    return Math.round(halved);
  };
  return { ...NONE, rel: scale(effects.rel), mind: scale(effects.mind), morale: scale(effects.morale), fatigue: effects.fatigue ?? 0, form: scale(effects.form), pressure: effects.pressure ?? 0, coachTrust: scale(effects.coachTrust) };
}

function averageMate(state: PlayerCareerState): number {
  const mates = matesOf(state);
  return mates.length ? mates.reduce((sum, mate) => sum + Number(mate.player.overall ?? 70), 0) / mates.length : 70;
}

/** O efeito da própria fala (planilha: "quimica:+1" vira +1 de relação, "mental:+1" vira +1 de Mental). */
function lineEffect(talk: Talk): Partial<TalkEffects> {
  const index = talk.lineKey.startsWith('c') ? Number(talk.lineKey.slice(1)) : NaN;
  const effects = Number.isFinite(index) ? CONTEXT_LINES[index]?.effects ?? '' : '';
  const out: Partial<TalkEffects> = {};
  for (const token of effects.split(';').filter(Boolean)) {
    const [name, raw] = token.split(':');
    const value = Number(raw);
    if (name === 'quimica') out.rel = value;
    if (name === 'mental') out.mind = value;
  }
  return out;
}

export interface TalkChip { label: string; value: number }
export interface TalkAnswer { state: PlayerCareerState; line: string; chips: TalkChip[]; good: boolean }

const REPLY: Record<TalkAnswerKey, { good: string; bad: string }> = {
  ouvir: { good: 'A conversa assentou. Vocês saem na mesma página.', bad: 'Ouviu, mas pouca coisa mudou.' },
  propor: { good: 'Proposta aceita.', bad: 'A proposta não colou agora.' },
  firme: { good: 'Você bancou a posição e foi respeitado.', bad: 'Ficou um clima. Isso vai ser lembrado.' }
};

/** Responde a conversa pendente: aplica os efeitos (com limite), guarda na memória e solta a fala de volta. */
export function answerTalk(state: PlayerCareerState, key: TalkAnswerKey): TalkAnswer {
  const talk = state.pendingTalk;
  if (!talk) return { state, line: '', chips: [], good: false };
  const base = answerEffects(state, talk, key);
  const extra = lineEffect(talk);
  const effects: TalkEffects = { ...base, rel: base.rel + (extra.rel ?? 0), mind: base.mind + (extra.mind ?? 0) };
  const life = lifeOf(state);
  const coachTalk = talk.speaker.kind === 'coach';
  const nextLife: CareerLife = {
    ...life,
    mind: clamp(life.mind + effects.mind),
    pressure: clamp(life.pressure + effects.pressure),
    coachTrust: clamp(life.coachTrust + effects.coachTrust + (coachTalk ? effects.rel : 0))
  };
  const relationships = { ...state.relationships };
  if (!coachTalk && effects.rel) relationships[talk.speaker.id] = clamp(relationshipOf(state, talk.speaker.id) + effects.rel);
  const memory = memoryOf(state);
  const score = effects.rel + effects.mind + effects.morale + effects.form * 2 + effects.coachTrust / 2 - effects.fatigue / 3 - effects.pressure / 3;
  const good = score > 0;
  const grudges = { ...memory.grudges };
  if (!coachTalk && effects.rel <= -3) grudges[talk.speaker.id] = state.seasonNumber;
  else if (!coachTalk && effects.rel >= 3) delete grudges[talk.speaker.id];
  const entry: TalkMemoryEntry = { season: state.seasonNumber, who: talk.speaker.id, name: talk.speaker.name, situation: talk.situation, answer: key, delta: effects.rel };
  const nextMemory: TalkMemory = {
    ...memory,
    n: memory.n + 1,
    used: { ...memory.used, [talk.lineKey]: memory.n },
    log: [...memory.log, entry].slice(-LOG_CAP),
    grudges,
    seasonOpened: talk.situation === 'inicio_temporada' ? state.seasonNumber : memory.seasonOpened
  };
  const chips: TalkChip[] = [];
  if (!coachTalk && effects.rel) chips.push({ label: `Relação com ${talk.speaker.name}`, value: effects.rel });
  const trust = effects.coachTrust + (coachTalk ? effects.rel : 0);
  if (trust) chips.push({ label: 'Confiança do coach', value: trust });
  if (effects.mind) chips.push({ label: 'Cabeça', value: effects.mind });
  if (effects.morale) chips.push({ label: 'Moral', value: effects.morale });
  if (effects.form) chips.push({ label: 'Forma', value: effects.form });
  if (effects.fatigue) chips.push({ label: 'Cansaço', value: effects.fatigue });
  if (effects.pressure) chips.push({ label: 'Pressão', value: effects.pressure });
  const next: PlayerCareerState = {
    ...state,
    life: nextLife,
    relationships,
    morale: clamp((state.morale ?? 60) + effects.morale),
    fatigue: clamp((state.fatigue ?? 0) + effects.fatigue),
    form: clamp((state.form ?? 0) + effects.form, -3, 3),
    talks: coachTalk ? state.talks : { ...state.talks, [talk.speaker.id]: (state.talks?.[talk.speaker.id] ?? 0) + 1 },
    talkMemory: nextMemory,
    pendingTalk: null
  };
  return { state: next, line: good ? REPLY[key].good : REPLY[key].bad, chips: chips.filter((chip) => chip.value !== 0), good };
}

/** Fecha a conversa sem responder (conta como conversa, não muda nada). */
export function dismissTalk(state: PlayerCareerState): PlayerCareerState {
  const memory = memoryOf(state);
  const talk = state.pendingTalk;
  if (!talk) return state;
  return {
    ...state,
    pendingTalk: null,
    talkMemory: { ...memory, n: memory.n + 1, used: { ...memory.used, [talk.lineKey]: memory.n }, seasonOpened: talk.situation === 'inicio_temporada' ? state.seasonNumber : memory.seasonOpened }
  };
}

/**
 * Depois da sua call no round decisivo, alguém do time comenta (career-lines: 48 falas de round decisivo).
 * Lines sobre overtime só no overtime. Mesmo cooldown das conversas.
 */
export function decisiveLine(state: PlayerCareerState, won: boolean, overtime: boolean, salt: string): { who: string; text: string; key: string } | null {
  if (state.orgId === 'lan-house') return null;
  const memory = memoryOf(state);
  const situation = won ? 'round_decisivo_vitoria' : 'round_decisivo_derrota';
  const mates = matesOf(state);
  const coach = coachOf(state);
  const people = [...mates.map((mate) => ({ name: mate.player.nickname ?? 'Parceiro', role: (mate.player.role as string) ?? 'rifler', rel: mate.relationship })), { name: coach.name, role: 'coach', rel: lifeOf(state).coachTrust }];
  const pool = DECISIVE_LINES.flatMap((line, index) => {
    if (line.situation !== situation || (!overtime && /overtime/i.test(line.text))) return [];
    if (memory.n - (memory.used[`r${index}`] ?? -999) < line.cooldown) return [];
    const person = people.find((candidate) => speakerKeys(candidate.role as TalkSpeaker['role']).includes(line.speaker) && candidate.rel >= line.relMin && candidate.rel <= line.relMax);
    return person ? [{ person, line, key: `r${index}` }] : [];
  });
  if (!pool.length) return null;
  const pick = pool[Math.floor(createSeededRng(`${state.seed}:decisive-line:${salt}`)() * pool.length)];
  return { who: pick.person.name, text: pick.line.text, key: pick.key };
}

/** Marca a fala do round decisivo como usada (para o cooldown). */
export const markLineUsed = (state: PlayerCareerState, key: string): PlayerCareerState => {
  const memory = memoryOf(state);
  return { ...state, talkMemory: { ...memory, n: memory.n + 1, used: { ...memory.used, [key]: memory.n } } };
};

/** O texto da resposta que você deu (para o histórico). */
export const answerText = (situation: TalkSituation, key: TalkAnswerKey) => ANSWERS[situation]?.[key] ?? key;
