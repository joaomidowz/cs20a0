// src/lib/game/playerCareer/live.ts
// A ponte entre a Carreira de Jogador e o motor de Major do jogo: cada campeonato é um evento de 8 no engine
// real (série a série, mapa a mapa, round a round — o mesmo do modo manager), com elencos da cena real
// convertidos pra entidades do motor. No ROUND DECISIVO do mapa (match point/prorrogação) a simulação PARA e a
// decisão vem pra VOCÊ: uma situação da matriz da sua função (decisions.ts), 3 alternativas — o edge inclina a
// probabilidade e o RNG do motor decide o round.
// Números de gameplay dos rivais são DERIVADOS da faixa do nível (mecânica, como no mundo gerado); identidade
// (nick/país/nascimento) vem da coleta real e nunca é inventada.
import {
  advanceCampaignMajor,
  autoDecideCampaign,
  campaignPlayedSeries,
  createCampaignMajor,
  currentCampaignSeries,
  pendingCampaignDecision,
  stepCampaignSeries,
  type CampaignMajorState
} from '../campaign-major';
import type { LiveSeriesState } from '../online/live-series';
import { armClutchCall, getCurrentSideA } from '../rounds';
import type { ClutchProfile, ClutchSituation } from './decisions';
import { drawClutchSituation, readOf, resolveClutchEdge, type ReadQuality, type RoundContext } from './decisions';
import { ACTIVE_DUTY_POOLS_BY_YEAR, getActiveDutyMapsForYear, MAP_NAMES } from '../maps';
import type { HistoricalTeam, OrgStyle, Player, PlayerRunStats, SelectedPlayer, SeriesResult, TeamSide } from '../types';
import { createRunStats } from '../runStats';
import { computeMajorAwards } from '../majorAwards';
import { toResult } from '../online/tournament-engine';
import { calculateHistoricalTeamPower, createSeededRng } from '../simulation';
import { orgIn, orgPowerIn } from './world';
import { regionOf, type Region } from './calendar';
import { npcLanguagePenalty } from './language';
import { randomNick } from './extraTeams';
import { applyCareerMapProfiles } from './careerMaps';
import { memberCatalogOverall, memberNick, ORG_BASE_POWER, orgLanguage, rosterBySlot, sceneOrgById, sceneOrgs, type SceneOrg } from './data';
import type { BracketLine, EventMvp, EventPlays, PlayerCareerState, PlayerRole, PlayHighlight, TournamentResult } from './engine';
import { levelIn, orgOf, playedCount } from './engine';
// Ciclo deliberado (só em nível de função): o squad é a fonte única dos parceiros (com sinergia).
import { matesOf, myPlayerOf } from './squad';

const LATEST_POOL_YEAR = Math.max(...Object.keys(ACTIVE_DUTY_POOLS_BY_YEAR).map(Number));

/** O pool de mapas do ano da carreira. A carreira anda além da tabela de active duty (2027, 2028…): sem
 *  pool o veto quebra, então o futuro herda o último pool conhecido. */
export const careerMapPool = (year: number) => getActiveDutyMapsForYear(Math.min(year, LATEST_POOL_YEAR));

/** Mesmo formato de evento da carreira manager: 8 times, tudo BO3. */
export const SCENE_EVENT_FORMAT = { quarterfinal: 3, semifinal: 3, final: 3 } as const;
/** Faixa do motor por nível de time. A Elite do Tier S (0) entra como 'S'; sem a chave, caía em 'underdog' fora do Major. */
const ENGINE_TIER: Record<number, string> = { 0: 'S', 1: 'contender', 2: 'contender', 3: 'playoff-team', 4: 'dangerous-underdog', 5: 'underdog' };
export const SLOTS: PlayerRole[] = ['igl', 'awper', 'entry', 'lurker', 'support'];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const ROLE_SHAPE: Record<PlayerRole, Partial<Record<'firepower' | 'clutch' | 'entry' | 'awp' | 'support' | 'igl' | 'experience' | 'consistency' | 'mental', number>>> = {
  awper: { awp: 14, firepower: 4, clutch: 5, igl: -10, support: -8, entry: -6 },
  rifler: { firepower: 6, consistency: 6, clutch: 2, igl: -3, awp: -6 },
  entry: { entry: 13, firepower: 8, igl: -8, awp: -10, support: -4, clutch: -3 },
  igl: { igl: 13, support: 5, mental: 8, experience: 6, firepower: -6, entry: -4, awp: -12 },
  lurker: { clutch: 12, firepower: 7, consistency: 5, igl: -6, support: -4, awp: -8 },
  support: { support: 13, igl: 4, mental: 4, entry: -6, awp: -8, firepower: -4 }
};

/** Um jogador do motor: overall + 9 atributos moldados pela função, determinístico por seed. */
export function enginePlayer(id: string, nick: string, overall: number, role: PlayerRole, rng: () => number): Player {
  const shape = ROLE_SHAPE[role];
  const noise = () => Math.round((rng() - 0.5) * 6);
  const attr = (key: keyof typeof shape) => clamp(overall + (shape[key] ?? 0) + noise(), 40, 99);
  return {
    id, nickname: nick, baseId: id, teamId: null, year: null,
    role, eligibleSlotRoles: [role], overall, rarity: 'rare',
    firepower: attr('firepower'), clutch: attr('clutch'), entry: attr('entry'), awp: attr('awp'),
    support: attr('support'), igl: attr('igl'), experience: clamp(overall - 4 + noise(), 40, 99),
    consistency: attr('consistency'), mental: attr('mental')
  };
}

/** Elenco do motor de uma org da cena: nicks REAIS onde a coleta trouxe, força derivada da faixa do nível. */
export function sceneOrgEnginePlayers(org: SceneOrg, seasonKey: string): Player[] {
  const rng = createSeededRng(`${seasonKey}:org:${org.id}`);
  // Base pelo ranking real (Vitality acima de Passion UA); sem ranking, a faixa do nível.
  const base = org.power ?? ORG_BASE_POWER[org.level] ?? 60;
  // Cada nick na posição da função real dele (ZywOo no AWP, apEX no IGL), não na ordem do elenco.
  const bySlot = rosterBySlot(org, SLOTS);
  // Elenco misto com inglês fraco se comunica pior: −1 de força para todos.
  const commsPenalty = npcLanguagePenalty(org.roster, orgLanguage(org));
  return SLOTS.map((role, index) => {
    const member = bySlot[index];
    const nick = member ? memberNick(member) : `${org.name} ${index + 1}`;
    const noise = Math.round((rng() - 0.5) * 8);
    // Quem está no catálogo joga perto do overall real dele (60% real, 40% a base do time); no mundo da carreira o
    // overall é o da temporada (o jovem cresce, o veterano cai).
    const real = member ? member.overall ?? memberCatalogOverall(member) : null;
    // Na temporada 1 a força do time (ranking real) puxa 40% da carta; com o mundo andando, o que vale é o jogador de
    // hoje (o peso do time cai até 15%): veterano de time forte não fica inflado pela força dos colegas.
    const season = org.season ?? 1;
    const teamWeight = Math.max(0.15, 0.4 - (season - 1) * 0.05);
    const overall = clamp((real !== null ? Math.round(real * (1 - teamWeight) + base * teamWeight) : Math.round(base) + noise) - commsPenalty, 40, 99);
    const player = enginePlayer(`${org.id}:${role}`, nick, overall, role, rng);
    // baseId do catálogo (ou o nick) para a foto licenciada aparecer na carta.
    return member && !member.generated ? { ...player, baseId: member.catalogBaseId ?? nick.toLowerCase() } : player;
  });
}

/** O time da cena no formato do motor; `level` é o nível de hoje (currentLevelOf). Sem ele, o do objeto. */
export function sceneOrgToEngineTeam(org: SceneOrg, players: Player[], level: number = org.level): HistoricalTeam {
  const preview = Math.round(players.reduce((sum, player) => sum + (player.overall ?? 60), 0) / Math.max(1, players.length));
  return { id: org.id, name: org.name, year: null, players: players.map((player) => player.id), tier: ENGINE_TIER[level] ?? 'underdog', teamPowerPreview: preview, style: null };
}

/** O time do jogador criado: sua carta (com bônus de treino) + os 4 parceiros com sinergia aplicada. */
export function userEnginePlayers(state: PlayerCareerState): Player[] {
  // No banco: o substituto joga na sua função, um pouco abaixo do seu nível.
  if ((state.benchedEvents ?? 0) > 0) {
    const rng = createSeededRng(`${state.seed}:sub:${state.seasonNumber}`);
    const sub = enginePlayer(`${state.seed}:sub`, randomNick(`${state.seed}:sub:${state.seasonNumber}`), Math.max(45, state.overall - 2), state.role, rng);
    return [sub, ...matesOf(state).map((mate) => mate.player)];
  }
  return [myPlayerOf(state), ...matesOf(state).map((mate) => mate.player)];
}

export function lineupOf(players: Player[]): SelectedPlayer[] {
  return players.map((player) => ({ playerId: player.id, selectedSlotRole: (player.role ?? 'support') as SelectedPlayer['selectedSlotRole'] }));
}

export interface SceneEventField {
  campaign: CampaignMajorState;
  userPlayers: Player[];
}

/** Os 7 rivais de um campeonato (orgs reais do nível ±1) e seus elencos — sorteio por seed, então a chave é
 *  a mesma antes de jogar (detalhe do calendário) e na hora de jogar (startSceneEvent). */
export type MajorStageKey = 'stage1' | 'stage2' | 'stage3';
export const NEXT_STAGE: Record<MajorStageKey, MajorStageKey | null> = { stage1: 'stage2', stage2: 'stage3', stage3: null };
export const STAGE_NAME: Record<MajorStageKey, string> = { stage1: 'Stage 1', stage2: 'Stage 2', stage3: 'Stage 3' };

export interface EventSetup {
  /** Fase suíça de 16 antes (ou no lugar) do mata-mata. */
  swiss: boolean;
  /** Stage 1/2 do Major: só a suíça (3 vitórias avança, 3 derrotas cai). */
  swissOnly: boolean;
  opponents: number;
  /** Faixa da pirâmide de onde vêm os rivais. */
  levels: [number, number];
  finalBestOf: 3 | 5;
  stage: MajorStageKey | null;
}

/** Como o campeonato é disputado: mata-mata de 8, suíça de 16 ou o stage do Major. */
export function eventSetup(state: PlayerCareerState, eventIndex: number, stage: MajorStageKey | null = null): EventSetup {
  const entry = state.calendar?.[eventIndex];
  const level = orgOf(state.orgId, state).level;
  if (entry?.format === 'major') {
    // Um campeonato só com os 3 stages (o motor roda Stage 1, 2 e 3 e os playoffs); `stage` é onde você entra.
    const current = stage ?? 'stage3';
    const levels: [number, number] = current === 'stage3' ? [0, 1] : current === 'stage2' ? [1, 2] : [2, 3];
    return { swiss: true, swissOnly: false, opponents: 15, levels, finalBestOf: 5, stage: current };
  }
  if (entry?.format === 'swiss16') return { swiss: true, swissOnly: false, opponents: 15, levels: [level - 1, level + 1], finalBestOf: entry.finalBestOf ?? 5, stage: null };
  return { swiss: false, swissOnly: false, opponents: 7, levels: [level - 1, level + 1], finalBestOf: entry?.finalBestOf ?? 3, stage: null };
}

export function sceneEventOpponents(state: PlayerCareerState, eventIndex: number, stage: MajorStageKey | null = null) {
  const setup = eventSetup(state, eventIndex, stage);
  const seed = `${state.seed}:event:${state.seasonNumber}:${eventIndex}${stage ? `:${stage}` : ''}`;
  const rng = createSeededRng(`${seed}:field`);
  // Quanto do campo é da sua região: lan house e tier C só região; tier B maioria; tier A regional meio a meio;
  // elite internacional e Major, o mundo todo.
  const entry = state.calendar?.[eventIndex];
  const userLevel = orgOf(state.orgId, state).level;
  const share = entry?.format === 'major' ? 0
    : userLevel >= 4 ? 1
    : userLevel === 3 ? 0.7
    : userLevel === 2 ? 0.5
    : 0;
  const home = userRegion(state);
  const regional = Math.round(setup.opponents * share);
  const inBand = (low: number, high: number, local: boolean | null) => sceneOrgs.filter((org) =>
    org.id !== state.orgId && levelIn(state, org) >= low && levelIn(state, org) <= high && (local === null || (org.region === home) === local));
  // Rivais da faixa do evento; se faltar gente (Tier S tem 8 times), abre a faixa um degrau por vez.
  const widen = (local: boolean | null, needed: number) => {
    let [low, high] = setup.levels;
    let pool = inBand(low, high, local);
    while (pool.length < needed && (low > 0 || high < 4)) {
      low = Math.max(0, low - 1);
      high = Math.min(4, high + 1);
      pool = inBand(low, high, local);
    }
    return pool;
  };
  const picked: SceneOrg[] = [];
  // Major: cada stage pelo ranking, como no real (o top 8 só entra no Stage 3).
  if (entry?.format === 'major' && setup.stage) {
    picked.push(...majorStageField(state, setup.stage, rng));
    const rosters = new Map(picked.map((org) => [org.id, sceneOrgEnginePlayers(orgIn(state.seed, state.seasonNumber, org.id) ?? org, seed)]));
    return { seed, picked, rosters };
  }
  const draw = (pool: SceneOrg[], until: number) => {
    const available = pool.filter((org) => !picked.includes(org));
    while (picked.length < until && available.length) picked.push(available.splice(Math.floor(rng() * available.length), 1)[0]);
  };
  // Tier S chama os melhores: o ranking decide, com um pouco de sorteio (às vezes um top fica fora pelo calendário).
  if (entry?.tier === 'S' && share === 0) {
    const ranked = widen(null, setup.opponents)
      .map((org) => ({ org, score: (org.power ?? ORG_BASE_POWER[levelIn(state, org)] ?? 80) + rng() * 4 }))
      .sort((a, b) => b.score - a.score);
    picked.push(...ranked.slice(0, setup.opponents).map((item) => item.org));
  }
  if (regional > 0) draw(widen(true, regional), regional);
  // O resto vem de fora da região (ou de qualquer lugar, se a região não fechar a chave).
  if (share < 1) draw(widen(share > 0 ? false : null, setup.opponents - picked.length), setup.opponents);
  draw(widen(null, setup.opponents), setup.opponents);
  // Elencos da temporada (o mundo troca jogadores entre temporadas).
  const rosters = new Map(picked.map((org) => [org.id, sceneOrgEnginePlayers(orgIn(state.seed, state.seasonNumber, org.id) ?? org, seed)]));
  return { seed, picked, rosters };
}

export interface SceneFieldTeam {
  orgId: string;
  name: string;
  level: number;
  /** Média de overall dos 5 que entram em quadra (o seu time já com a sinergia). */
  overall: number;
  isUser: boolean;
}

/** Ranking do mundo para os convites do Major (VRS simulado: a força do time, com a oscilação da temporada). */
export function majorRanking(state: PlayerCareerState): SceneOrg[] {
  return sceneOrgs
    .filter((org) => org.id !== state.orgId && levelIn(state, org) <= 3)
    .map((org) => {
      // A força do elenco de hoje (o time que envelheceu cai, o que contratou bem sobe) e um pouco de sorte da temporada
      // no ranking: a ordem do Major e dos convidados muda de um ano para o outro.
      const power = orgPowerIn(state.seed, state.seasonNumber, org.id) ?? (orgOf(org.id, state) as SceneOrg).power ?? ORG_BASE_POWER[levelIn(state, org)] ?? 66;
      // O ranking anda a cada campeonato jogado (como o VRS): os dois Majors do ano não repetem a mesma ordem.
      return { org, score: power + createSeededRng(`${state.seed}:vrs:${state.seasonNumber}:${playedCount(state)}:${org.id}`)() * 3 };
    })
    .sort((a, b) => b.score - a.score || a.org.name.localeCompare(b.org.name))
    .map((entry) => entry.org);
}

/**
 * Os 15 rivais de cada stage do Major, como na Valve: Stage 3 tem o top 8 do ranking convidado direto e 7 que
 * vieram do Stage 2 (9º ao 24º); Stage 2 tem o 9º ao 16º e 7 que vieram do Stage 1; Stage 1 tem o 17º ao 26º e 5
 * das qualificatórias regionais.
 */
const MAJOR_FIELD: Record<MajorStageKey, { direct: [number, number]; rest: [number, number] }> = {
  stage3: { direct: [0, 8], rest: [8, 24] },
  stage2: { direct: [8, 16], rest: [16, 40] },
  stage1: { direct: [16, 26], rest: [26, 64] }
};

export function majorStageField(state: PlayerCareerState, stage: MajorStageKey, rng: () => number): SceneOrg[] {
  const ranking = majorRanking(state);
  const { direct, rest } = MAJOR_FIELD[stage];
  const picked = ranking.slice(direct[0], direct[1]);
  const pool = ranking.slice(rest[0], rest[1]);
  while (picked.length < 15 && pool.length) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return picked;
}

/** Os times de um campeonato para a tela de detalhe: a chave (8 ou 16) ou, no Major, os 3 stages pelo ranking. */
export function eventTeams(state: PlayerCareerState, eventIndex: number): Array<{ label: string; teams: SceneFieldTeam[] }> {
  const entry = state.calendar?.[eventIndex];
  if (entry?.format !== 'major') return [{ label: 'A chave', teams: sceneEventField(state, eventIndex) }];
  const entryStage = majorEntryStage(state);
  const ranking = majorRanking(state);
  const seed = `${state.seed}:event:${state.seasonNumber}:${eventIndex}:major`;
  const average = (org: SceneOrg) => {
    const players = sceneOrgEnginePlayers(orgIn(state.seed, state.seasonNumber, org.id) ?? org, seed);
    return Math.round(players.reduce((sum, player) => sum + (player.overall ?? 60), 0) / Math.max(1, players.length));
  };
  const userOrg = orgOf(state.orgId, state);
  const me: SceneFieldTeam = { orgId: state.orgId, name: userOrg.name, level: userOrg.level, overall: Math.round(userEnginePlayers(state).reduce((sum, player) => sum + (player.overall ?? 60), 0) / 5), isUser: true };
  const groups: Array<{ stage: MajorStageKey; size: number }> = [{ stage: 'stage3', size: 8 }, { stage: 'stage2', size: 8 }, { stage: 'stage1', size: 16 }];
  let cursor = 0;
  return groups.map(({ stage, size }) => {
    const take = size - (entryStage === stage ? 1 : 0);
    const teams = ranking.slice(cursor, cursor + take).map((org) => ({ orgId: org.id, name: org.name, level: levelIn(state, org), overall: average(org), isUser: false }));
    cursor += take;
    const label = stage === 'stage3' ? 'Stage 3 · convidados direto (top 8 do ranking)' : stage === 'stage2' ? 'Stage 2 · do 9º ao 16º' : 'Stage 1 · quem abre o Major';
    return { label, teams: (entryStage === stage ? [...teams, me] : teams).sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name)) };
  });
}

/** Posição do time no ranking mundial da carreira (força da temporada, sem a oscilação do VRS). */
export function worldRankOf(state: PlayerCareerState, orgId: string): number {
  const powerOf = (id: string) => (orgOf(id, state) as SceneOrg).power ?? ORG_BASE_POWER[orgOf(id, state).level] ?? 60;
  const mine = powerOf(orgId);
  return 1 + sceneOrgs.filter((org) => org.id !== orgId && powerOf(org.id) > mine).length;
}

/** Quem espera direto no Stage 3 (o top 8 do ranking). */
export const majorInvites = (state: PlayerCareerState): SceneOrg[] => majorRanking(state).slice(0, 8);

/** A região do seu time (lan house: a do seu país). */
export function userRegion(state: PlayerCareerState): Region {
  const org = sceneOrgById.get(state.orgId);
  return org?.region ?? regionOf(org?.country ?? state.country);
}

/** A chave de 8 do campeonato, do mais forte pro mais fraco — o que o detalhe do calendário mostra. */
export function sceneEventField(state: PlayerCareerState, eventIndex: number, stage: MajorStageKey | null = null): SceneFieldTeam[] {
  const { picked, rosters } = sceneEventOpponents(state, eventIndex, stage);
  const average = (players: Player[]) => Math.round(players.reduce((sum, player) => sum + (player.overall ?? 60), 0) / Math.max(1, players.length));
  const userOrg = orgOf(state.orgId, state);
  const teams: SceneFieldTeam[] = [
    { orgId: state.orgId, name: userOrg.name, level: userOrg.level, overall: average(userEnginePlayers(state)), isUser: true },
    ...picked.map((org) => ({ orgId: org.id, name: org.name, level: levelIn(state, org), overall: average(rosters.get(org.id) ?? []), isUser: false }))
  ];
  return teams.sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
}

/** Um campeonato da temporada no motor de Major: chave de 8 com rivais reais do nível ±1. */
/** O Major inteiro pelo ranking: quantos times entram em cada stage (o seu lugar sai da conta do seu stage). */
function majorFullField(state: PlayerCareerState, entryStage: MajorStageKey, seed: string) {
  // Folga: o motor às vezes derruba um gigante um stage abaixo (até 2 por stage) e repõe com o de baixo; 2 times a
  // mais no Stage 2 e 3 no Stage 1 cobrem qualquer sorteio.
  const counts = { stage3: 8 - (entryStage === 'stage3' ? 1 : 0), stage2: 8 - (entryStage === 'stage2' ? 1 : 0) + 2, stage1: 16 - (entryStage === 'stage1' ? 1 : 0) + 3 };
  const picked = majorRanking(state).slice(0, counts.stage3 + counts.stage2 + counts.stage1);
  const rosters = new Map(picked.map((org) => [org.id, sceneOrgEnginePlayers(orgIn(state.seed, state.seasonNumber, org.id) ?? org, seed)]));
  // O stage de cada um sai do ranking: top 8 no Stage 3, do 9º ao 16º no Stage 2, o resto abre no Stage 1.
  const tierAt = (rank: number) => (rank < counts.stage3 ? 'S' : rank < counts.stage3 + counts.stage2 ? 'contender' : 'underdog');
  return { picked, rosters, tierAt };
}

/** Força de time que vem da relação média com os parceiros: (média − 60) × 0.04, de −1.5 a +1.2. */
export function chemistryEdge(state: PlayerCareerState): number {
  const mates = matesOf(state);
  if (!mates.length) return 0;
  const average = mates.reduce((sum, mate) => sum + mate.relationship, 0) / mates.length;
  return Math.max(-1.5, Math.min(1.2, (average - 60) * 0.04));
}

/** Quanto a forma de um campeonato muda a força de cada time (±). */
export const EVENT_FORM_SWING = 3.5;
/** Até quanto o mais forte do campeonato abre do segundo sem desconto, e quanto vale o que passar disso. */
export const SUPERTEAM_EDGE = 1.5;
export const SUPERTEAM_DAMPING = 0.35;

export function startSceneEvent(state: PlayerCareerState, eventIndex: number, played?: Record<string, unknown>, stage: MajorStageKey | null = null): SceneEventField {
  const setup = eventSetup(state, eventIndex, stage);
  const entry = state.calendar?.[eventIndex];
  const isMajor = entry?.format === 'major' && Boolean(setup.stage);
  const regular = isMajor ? null : sceneEventOpponents(state, eventIndex, stage);
  const seed = regular?.seed ?? `${state.seed}:event:${state.seasonNumber}:${eventIndex}:major`;
  const major = isMajor ? majorFullField(state, setup.stage!, seed) : null;
  const picked = major?.picked ?? regular!.picked;
  const rosters = major?.rosters ?? regular!.rosters;
  const userPlayers = userEnginePlayers(state);
  const opponents = picked.map((org, rank) => {
    const team = sceneOrgToEngineTeam(org, rosters.get(org.id)!, levelIn(state, org));
    return major ? { ...team, tier: major.tierAt(rank) } : team;
  });
  const allPlayers = [...userPlayers, ...picked.flatMap((org) => rosters.get(org.id) ?? [])];
  const campaign = createCampaignMajor(userPlayers, 'balanced', opponents, allPlayers, seed, lineupOf(userPlayers), {
    // Suíça de 16 (mata-mata depois, final MD5) ou direto no mata-mata de 8 com a final do evento.
    ...(setup.swiss ? {} : { playoffEntry: { ...SCENE_EVENT_FORMAT, final: setup.finalBestOf } }),
    ...(isMajor ? { dynastyEntryStage: setup.stage! } : {}),
    dynastyRules: 2,
    dynastyPlan: { style: 'balanced', tactic: 'standard', study: false },
    // O pool atual do CS2 do ano da carreira — mapas de verdade na chave, sem veto amador.
    neutralMapPool: careerMapPool(state.year),
    ...(played ? { played: played as never } : {})
  });
  // Cada time com o seu perfil de mapas (o seu com o treino): veto e bônus de força no mapa jogado.
  applyCareerMapProfiles(campaign, state.orgId, state.year, careerMapPool(state.year), state.mapTraining ?? {});
  // O SeriesViewer pinta "seu time" pelo isUser: marca a org no engine (vale pra TODAS as séries futuras,
  // que copiam o time da org) e a série que já abriu na criação da chave.
  const organization = campaign.engine.byId.get(campaign.userTeamId);
  // O seu time com o nome da sua org em todas as telas (tabela, chave, visão do Major), não o "yourOrg" do motor.
  const userOrg = orgOf(state.orgId, state);
  const userName = userOrg.name;
  // O seu time na MESMA régua dos rivais: a força sai da conta dos times da cena (média dos jogadores, química
  // padrão, elenco completo). Antes saía da conta da Dinastia, que deixava o time do jogador 5 a 8 pontos acima de
  // um time do computador com os mesmos jogadores (FURIA com você ganhava 72% dos Tier S; sem você, uns 40%).
  const fair = calculateHistoricalTeamPower(sceneOrgToEngineTeam({ ...(userOrg as SceneOrg), id: campaign.userTeamId, name: userName }, userPlayers), allPlayers);
  // Sem estilo, como os rivais: o 'balanced' da Dinastia dava ao seu time pistol e dia ruim melhores que os deles.
  // Química do elenco: o que você constrói com os parceiros vale força de time (relação média 60 é neutra; 90 dá
  // +1.2; abaixo de 40 tira). É a alavanca que fica na sua mão, junto com as calls e o próprio overall.
  const level = { name: userName, isUser: true, power: fair.power + chemistryEdge(state), mental: fair.mental, clutch: fair.clutch, experience: fair.experience, consistency: fair.consistency, style: undefined };
  if (organization) {
    organization.name = userName;
    organization.team = { ...organization.team, ...level };
  }
  // Forma do campeonato: cada time (o seu também) chega um pouco acima ou abaixo, fixo pela seed. Gera zebra e
  // impede que o mais forte ganhe sempre.
  const formOf = (teamId: string) => (createSeededRng(`${seed}:form:${teamId}`)() - 0.5) * 2 * EVENT_FORM_SWING;
  for (const org of campaign.engine.byId.values()) org.team = { ...org.team, power: org.team.power + formOf(org.id) };
  // Supertime não ganha tudo: o que o mais forte abre acima de 2 pontos sobre o segundo conta pela metade
  // (vale para qualquer time, o seu ou um da cena).
  const ranked = [...campaign.engine.byId.values()].sort((a, b) => b.team.power - a.team.power);
  const ceiling = (ranked[1]?.team.power ?? 0) + SUPERTEAM_EDGE;
  if (ranked[0] && ranked[1] && ranked[0].team.power > ceiling) ranked[0].team = { ...ranked[0].team, power: ceiling + (ranked[0].team.power - ceiling) * SUPERTEAM_DAMPING };
  for (const standing of campaign.engine.standings) if (standing.organizationId === campaign.userTeamId) standing.name = userName;
  const openSeries = currentCampaignSeries(campaign);
  if (openSeries) {
    const synced = (team: typeof openSeries.config.teamA) => {
      const current = campaign.engine.byId.get(team.id)?.team;
      return team.id === campaign.userTeamId ? { ...team, ...level, power: current?.power ?? team.power } : current ? { ...team, power: current.power } : team;
    };
    openSeries.config.teamA = synced(openSeries.config.teamA);
    openSeries.config.teamB = synced(openSeries.config.teamB);
  }
  return { campaign, userPlayers };
}

/** Quão crítico é o round que vai rolar: 3 fecha o mapa; 2 é sequência de 3+ em andamento (virada/ataque);
 *  1 é mapa faca no fim (rounds 16+ a até 2 de diferença); 0 é round comum, a simulação segue sozinha. */
export type RoundCriticality = 0 | 1 | 2 | 3;

export function roundCriticality(live: LiveSeriesState): RoundCriticality {
  if (!live?.current || live.phase !== 'live') return 0;
  const map = live.current.state;
  if (map.pendingClutchCall) return 0; // este round já tem call armada
  const rounds = map.rounds.length;
  const diff = Math.abs(map.scoreA - map.scoreB);
  if (rounds >= 24) {
    // Prorrogação: bloco de 6, primeiro a 4 — 3 no bloco é o match point do bloco.
    const blockStart = 24 + Math.floor((rounds - 24) / 6) * 6;
    const before = map.rounds[blockStart - 1];
    return map.scoreA - (before?.a ?? 0) === 3 || map.scoreB - (before?.b ?? 0) === 3 ? 3 : 0;
  }
  if (map.scoreA === 12 || map.scoreB === 12) return 3; // match point do mapa
  if (rounds >= 6) {
    const winnerOf = (index: number): 'a' | 'b' => (map.rounds[index].a > (index > 0 ? map.rounds[index - 1].a : 0) ? 'a' : 'b');
    let streak = 1;
    for (let index = rounds - 2; index >= 0; index -= 1) {
      if (winnerOf(index) === winnerOf(rounds - 1)) streak += 1;
      else break;
    }
    if (streak >= 3 && diff <= 5) return 2; // quebra a sequência ou ela vira virada
  }
  if (rounds >= 16 && diff <= 2) return 1; // mapa faca: qualquer round desses inclina o mapa
  return 0;
}

/**
 * O portão da decisão: no máximo 2 situações por mapa na regulagem — a crítica de sequência/virada e a de
 * mapa faca só valem como PRIMEIRA; o match point sempre para (até o teto). Na prorrogação o teto afrouxa:
 * todo 3-no-bloco e toda sequência param.
 */
export function clutchGate(criticality: RoundCriticality, used: number, overtime: boolean): boolean {
  if (criticality <= 0) return false;
  if (overtime) return criticality >= 2;
  return criticality === 3 ? used < 2 : used < 1;
}

const isUserSeries = (campaign: CampaignMajorState, live: LiveSeriesState) =>
  live.config.teamA.id === campaign.userTeamId || live.config.teamB.id === campaign.userTeamId;

/** O que a temporada sabe sobre você no momento do clutch: função, seed da carreira e situações já usadas. */
export interface SceneClutchContext {
  role: PlayerRole;
  seed: string;
  usedSituationIds: string[];
}

/** A pausa do round decisivo: a situação sorteada da sua função, na sua série, no round que fecha o mapa. */
export interface SceneClutchMoment {
  situation: ClutchSituation;
  series: LiveSeriesState;
  mapIndex: number;
  roundNumber: number;
  /** Seed do sorteio/resolve: mesma carreira, mesmo round, mesma consequência. */
  drawSeed: string;
}

export interface SceneStepResult {
  campaign: CampaignMajorState;
  /** Decisão sua pendente no round decisivo (o bot NÃO decide por você no close). */
  clutch: SceneClutchMoment | null;
}

/** O lado do seu time no próximo round da série (CT ou TR). */
function userSideOf(campaign: CampaignMajorState, live: LiveSeriesState): 't' | 'ct' | null {
  const map = live.current?.state;
  if (!map) return null;
  const sideA = getCurrentSideA(map);
  if (!sideA) return null;
  const userIsA = live.config.teamA.id === campaign.userTeamId;
  return userIsA ? sideA : sideA === 'ct' ? 't' : 'ct';
}

/** O momento do mapa para a call: round, placar, sequência e dinheiro de cada lado (do ponto de vista do seu time). */
export function roundContextOf(campaign: CampaignMajorState, live: LiveSeriesState): RoundContext | null {
  const map = live.current?.state;
  if (!map) return null;
  const mine: 'a' | 'b' = live.config.teamA.id === campaign.userTeamId ? 'a' : 'b';
  const theirs: 'a' | 'b' = mine === 'a' ? 'b' : 'a';
  const won = map.rounds.map((round, index) => round[mine] > (map.rounds[index - 1]?.[mine] ?? 0));
  const streak = (value: boolean) => {
    let count = 0;
    for (let index = won.length - 1; index >= 0 && won[index] === value; index -= 1) count += 1;
    return count;
  };
  return {
    round: map.rounds.length + 1,
    us: mine === 'a' ? map.scoreA : map.scoreB,
    them: mine === 'a' ? map.scoreB : map.scoreA,
    winStreak: streak(true),
    lossStreak: streak(false),
    lastWon: won.length ? won[won.length - 1] : null,
    money: map.teams[mine]?.money ?? null,
    theirMoney: map.teams[theirs]?.money ?? null
  };
}

/** Um passo do evento: rounds das outras séries rodam sozinhos; a sua anda um round por vez. */
export function stepSceneEvent(campaign: CampaignMajorState, ctx?: SceneClutchContext): SceneStepResult {
  let next = campaign;
  for (let guard = 0; guard < 40; guard += 1) {
    const pending = pendingCampaignDecision(next);
    if (!pending) break;
    next = autoDecideCampaign(next);
  }
  const live = currentCampaignSeries(next);
  if (live && live.phase !== 'finished') {
    const criticality = roundCriticality(live);
    const map = live.current?.state;
    if (ctx && map && isUserSeries(next, live) && clutchGate(criticality, map.clutchCallsUsed, map.rounds.length >= 24)) {
      const roundNumber = map.rounds.length + 1;
      const drawSeed = `${ctx.seed}:${live.config.id}:R${roundNumber}`;
      return {
        campaign: next,
        clutch: {
          situation: drawClutchSituation(ctx.role, drawSeed, ctx.usedSituationIds, userSideOf(next, live), roundContextOf(next, live)),
          series: live,
          mapIndex: live.current?.index ?? 0,
          roundNumber,
          drawSeed
        }
      };
    }
    next = stepCampaignSeries(next);
    return { campaign: next, clutch: null };
  }
  return { campaign: advanceCampaignMajor(next), clutch: null };
}

export interface SceneClutchPlay {
  choice: 0 | 1 | 2;
  /** Id do seu jogador no motor: a história só conta as kills dele, não as do time. */
  playerId?: string;
  playerOverall: number;
  matesOverall: number;
  opponentOverall: number;
  /** Relação média com os parceiros (0-100). */
  chemistry?: number | null;
}

export interface SceneClutchOutcome {
  campaign: CampaignMajorState;
  /** O round decisivo foi seu? O RNG do motor respondeu. */
  won: boolean;
  profile: ClutchProfile;
  edge: number;
  coin: 'heads' | 'tails' | null;
  /** Suas eliminações no round decisivo (do kill feed real, só as do SEU jogador). */
  kills: number;
  /** A leitura foi certa, razoável ou errada; qual era a certa e por quê. */
  quality: ReadQuality;
  best: 0 | 1 | 2;
  reason: string;
}

/** O embalo da call no round seguinte: leitura certa ajuda, errada atrapalha. */
export const CALL_CARRY_GOOD = 0.05;
export const CALL_CARRY_BAD = 0.03;

/** Sua call no round decisivo: arma o edge na probabilidade do round e ele roda no motor — RNG decide. */
export function playClutchRound(campaign: CampaignMajorState, moment: SceneClutchMoment, play: SceneClutchPlay): SceneClutchOutcome {
  const live = currentCampaignSeries(campaign);
  if (!live?.current) return { campaign, won: false, profile: 'solid', edge: 0, coin: null, kills: 0, quality: 'ok', best: 0, reason: '' };
  const userSide: TeamSide = live.config.teamA.id === campaign.userTeamId ? 'a' : 'b';
  const resolve = resolveClutchEdge({ ...play, situation: moment.situation, seed: moment.drawSeed, round: roundContextOf(campaign, live) });
  armClutchCall(live.current.state, userSide, resolve.edge);
  const stepped = stepCampaignSeries(campaign);
  const after = currentCampaignSeries(stepped) ?? live;
  // A leitura certa embala o time no round seguinte; a errada abala (sem gastar call: só o round que vem).
  const carry = resolve.quality === 'good' ? CALL_CARRY_GOOD : resolve.quality === 'bad' ? -CALL_CARRY_BAD : 0;
  if (carry && after.current && after.current.index === moment.mapIndex && !after.current.state.finished && !after.current.state.pendingClutchCall) after.current.state.pendingClutchCall = { side: userSide, edge: carry };
  const detail = after.current ? after.current.state.details.at(-1) : after.maps.at(-1)?.details?.at(-1) ?? null;
  const kills = detail ? detail.kills.filter((kill) => kill.killerSide === userSide && (!play.playerId || kill.killerId === play.playerId)).length : 0;
  return { campaign: stepped, won: detail ? detail.winner === userSide : false, profile: resolve.profile, edge: resolve.edge, coin: resolve.coin, kills, quality: resolve.quality, best: resolve.best, reason: resolve.reason };
}

export interface SceneRunResult extends SceneStepResult {
  /** Rounds corridos até a pausa (clutch) ou o fim do evento/série do usuário. */
  roundsPlayed: number;
}

/**
 * O fluxo do 13a0: o campeonato CORRE sozinho, round a round, e só PARA no round decisivo do mapa — a
 * situação da sua função chega com 3 alternativas e o RNG decide o round. Sem ctx (bots), roda até o fim.
 */
export function runSceneEvent(campaign: CampaignMajorState, ctx?: SceneClutchContext, maxRounds = 4000): SceneRunResult {
  let current = campaign;
  let roundsPlayed = 0;
  for (let guard = 0; guard < maxRounds; guard += 1) {
    const step = stepSceneEvent(current, ctx);
    current = step.campaign;
    if (step.clutch) return { ...step, roundsPlayed };
    if (current.finished) return { campaign: current, clutch: null, roundsPlayed };
    roundsPlayed += 1;
  }
  return { campaign: current, clutch: null, roundsPlayed };
}

/** Serialização do evento em andamento no padrão do modo manager (séries fechadas → rebuild determinístico). */
export const serializeSceneEvent = (campaign: CampaignMajorState): Record<string, unknown> => campaignPlayedSeries(campaign) as unknown as Record<string, unknown>;

/** Colocação do run do motor → rótulo da carreira. */
export function placementLabel(placement: string): TournamentResult['placement'] {
  if (placement === 'placementChampion') return 'Campeão';
  if (placement === 'placementRunnerUp') return 'Vice';
  if (placement === 'placement3to4') return 'Semis';
  if (placement === 'placementStage3') return 'Fase suíça';
  if (placement === 'placementStage2') return 'Stage 2';
  if (placement === 'placementStage1') return 'Stage 1';
  return 'Quartas';
}

/** Ordem das colocações, da pior para a melhor (cores e comparação). */
export const PLACEMENT_ORDER = ['Não classificado', 'Stage 1', 'Stage 2', 'Fase suíça', 'Quartas', 'Semis', 'Vice', 'Campeão'];

/** O que a campanha anterior do Major (stages já jogados) soma ao fechamento. */
export interface StageCarry { wins: number; losses: number }

export interface SceneEventOutcome {
  result: TournamentResult;
  stats: PlayerRunStats[];
  players: Player[];
}

const isUserTeam = (campaign: CampaignMajorState, id: string) => id === 'user' || id === campaign.userTeamId;

/** Os prêmios do campeonato até agora (MVP e os melhores pelo kill feed de tudo que já foi jogado). */
export function awardsSoFar(campaign: CampaignMajorState) {
  const result = toResult(campaign.engine);
  return computeMajorAwards(result.rounds, result.championId);
}

export interface EventAwards { champion?: string; mvp?: EventMvp; plays?: EventPlays; bracket?: BracketLine[]; highlights?: PlayHighlight[]; opponents?: TournamentResult['opponents']; stages?: TournamentResult['stages'] }

/**
 * Prêmios do evento pelo kill feed de TODAS as séries (o motor joga o campo inteiro): campeão, MVP (o mesmo
 * cálculo do modo online), suas jogadas e o mata-mata completo. Stage 1/2 do Major não têm final: só jogadas.
 */
export function eventAwards(state: PlayerCareerState, campaign: CampaignMajorState): EventAwards {
  const result = toResult(campaign.engine);
  const myTeam = sceneOrgById.get(state.orgId)?.name ?? 'Lan House do Bairro';
  const nameOf = (team: { id: string; name: string }) => (isUserTeam(campaign, team.id) ? myTeam : team.name);
  const series = result.rounds.flatMap((round) => round.series);
  const final = series.find((item) => item.phase === 'final');
  const championId = final ? final.winnerId : null;
  const awards = computeMajorAwards(result.rounds, championId);
  const me = `${state.seed}:me`;
  const plays = countPlays(series, me);
  const highlights = playHighlights(series, me, campaign, myTeam);
  const opponents = series
    .filter((item) => item.winnerId && (isUserTeam(campaign, item.teamA.id) || isUserTeam(campaign, item.teamB.id)))
    .map((item) => {
      const userIsA = isUserTeam(campaign, item.teamA.id);
      return {
        team: userIsA ? item.teamB.name : item.teamA.name, won: isUserTeam(campaign, item.winnerId), phase: item.phase,
        score: userIsA ? `${item.scoreA}-${item.scoreB}` : `${item.scoreB}-${item.scoreA}`
      };
    });
  // Major: a tabela final de cada stage (para rever o Major depois).
  const stages = result.stages?.map((entry) => ({
    stage: entry.stage,
    standings: entry.standings.map((standing) => ({
      name: isUserTeam(campaign, standing.organizationId) ? myTeam : standing.name, wins: standing.wins, losses: standing.losses, status: standing.status,
      ...(isUserTeam(campaign, standing.organizationId) ? { you: true } : {})
    }))
  }));
  const bracket: BracketLine[] = series
    .filter((item): item is typeof item & { phase: BracketLine['phase'] } => item.phase === 'quarterfinal' || item.phase === 'semifinal' || item.phase === 'final')
    .map((item) => ({
      phase: item.phase, a: nameOf(item.teamA), b: nameOf(item.teamB), scoreA: item.scoreA, scoreB: item.scoreB,
      aWon: item.winnerId === item.teamA.id,
      ...(isUserTeam(campaign, item.teamA.id) ? { you: 'a' as const } : isUserTeam(campaign, item.teamB.id) ? { you: 'b' as const } : {})
    }));
  // MVP de evento sai do campeão; o vice só leva se jogou muito mais (0.15 de rating acima do melhor campeão).
  const ranked = awards?.topPlayers ?? [];
  const runnerUpId = final ? (final.winnerId === final.teamA.id ? final.teamB.id : final.teamA.id) : null;
  const bestChampion = ranked.find((award) => award.teamId === championId);
  const bestRunnerUp = ranked.find((award) => award.teamId === runnerUpId);
  const pick = bestChampion && bestRunnerUp && bestRunnerUp.rating >= bestChampion.rating + 0.15 ? bestRunnerUp : bestChampion ?? bestRunnerUp ?? awards?.mvp ?? null;
  const mvp = final && pick
    ? { nick: pick.playerId === me ? state.nick : pick.name, team: isUserTeam(campaign, pick.teamId) ? myTeam : pick.teamName, rating: pick.rating, ...(pick.playerId === me ? { you: true } : {}) }
    : undefined;
  return {
    ...(final ? { champion: nameOf(final.winnerId === final.teamA.id ? final.teamA : final.teamB) } : {}),
    ...(mvp ? { mvp } : {}),
    ...(plays.aces + plays.quads + plays.clutches > 0 ? { plays } : {}),
    ...(bracket.length ? { bracket } : {}),
    ...(highlights.length ? { highlights } : {}),
    ...(opponents.length ? { opponents } : {}),
    ...(stages?.length ? { stages } : {})
  };
}

const HIGHLIGHT_WEIGHT = (highlight: PlayHighlight) =>
  highlight.kind === 'ace' ? 100 : highlight.kind === 'clutch' ? 40 + (highlight.against ?? 1) * 12 : highlight.kind === 'quad' ? 50 : 20;

/** As suas melhores jogadas do evento: tipo, mapa, round e contra quem (ace primeiro, depois clutch difícil, quad). */
function playHighlights(series: SeriesResult[], playerId: string, campaign: CampaignMajorState, myTeam: string): PlayHighlight[] {
  const list: PlayHighlight[] = [];
  for (const item of series) {
    const opponent = isUserTeam(campaign, item.teamA.id) ? item.teamB.name : isUserTeam(campaign, item.teamB.id) ? item.teamA.name : null;
    if (!opponent) continue;
    for (const map of item.maps) for (const round of map.details ?? []) {
      const highlight = round.highlight;
      if (!highlight || highlight.playerId !== playerId) continue;
      // Ganhar no relógio não é clutch de verdade.
      if (highlight.kind === 'clutch' && round.ending === 'time') continue;
      list.push({
        kind: highlight.kind, kills: highlight.kills, ...(highlight.against ? { against: highlight.against } : {}),
        map: map.mapId ? MAP_NAMES[map.mapId] ?? map.mapId : `Mapa ${map.map}`, round: round.number, opponent: opponent === myTeam ? item.teamB.name : opponent
      });
    }
  }
  return list.filter((highlight) => highlight.kind !== 'triple').sort((a, b) => HIGHLIGHT_WEIGHT(b) - HIGHLIGHT_WEIGHT(a)).slice(0, 8);
}

/** Ace, quad e clutch seus, contados direto dos destaques dos rounds do kill feed. */
function countPlays(series: SeriesResult[], playerId: string): EventPlays {
  const plays = { aces: 0, quads: 0, clutches: 0 };
  for (const item of series) for (const map of item.maps) for (const round of map.details ?? []) {
    const highlight = round.highlight;
    if (!highlight || highlight.playerId !== playerId) continue;
    if (highlight.kind === 'clutch' && round.ending === 'time') continue;
    if (highlight.kind === 'ace') plays.aces += 1;
    else if (highlight.kind === 'quad') plays.quads += 1;
    else if (highlight.kind === 'clutch') plays.clutches += 1;
  }
  return plays;
}

/** O fechamento de um campeonato jogado (ao vivo ou simulado): colocação, seu rating do kill feed e W-L. */
export function sceneEventResult(state: PlayerCareerState, eventIndex: number, campaign: CampaignMajorState, stage: MajorStageKey | null = null, carry: StageCarry = { wins: 0, losses: 0 }): SceneEventOutcome {
  const players = userEnginePlayers(state);
  const userSeries = campaign.run.matches.filter((series) => isUserTeam(campaign, series.teamA.id) || isUserTeam(campaign, series.teamB.id));
  const stats = createRunStats(players, campaign.run, `${state.seed}:event:${state.seasonNumber}:${eventIndex}`, lineupOf(players));
  const mine = stats.find((stat) => stat.playerId === `${state.seed}:me`);
  const decided = userSeries.filter((series) => series.winnerId);
  const wins = decided.filter((series) => isUserTeam(campaign, series.winnerId)).length;
  // Stage 1/2 do Major acabam na suíça: a colocação é o stage em que você caiu.
  const placement = placementLabel(campaign.run.placement);
  return {
    result: {
      name: state.calendar?.[eventIndex]?.name ?? `Campeonato ${eventIndex + 1}`,
      placement,
      rating: Number((mine?.runRating ?? 0.95).toFixed(2)),
      seriesWins: wins + carry.wins,
      seriesLosses: decided.length - wins + carry.losses,
      ...(state.calendar?.[eventIndex]?.tier ? { tier: state.calendar[eventIndex].tier } : {}),
      ...eventAwards(state, campaign),
      // No banco: o time jogou sem você; não conta no seu rating, no HLTV nem no prêmio.
      ...((state.benchedEvents ?? 0) > 0 ? { benched: true, skipped: true } : {})
    },
    stats,
    players
  };
}

/** Roda o resto do campeonato sem pausas (o time decide os rounds decisivos sozinho). */
export function finishSceneEvent(campaign: CampaignMajorState, maxSteps = 8000, calls?: HeadlessCalls): CampaignMajorState {
  let current = campaign;
  if (!calls || calls.policy === 'none') {
    for (let guard = 0; guard < maxSteps && !current.finished; guard += 1) current = stepSceneEvent(current).campaign;
    return current;
  }
  // Com política: o campeonato para nas suas calls e a política escolhe (medição/calibração, sem tela).
  const used: string[] = [];
  for (let guard = 0; guard < maxSteps && !current.finished; guard += 1) {
    const step = stepSceneEvent(current, { role: calls.role, seed: calls.seed, usedSituationIds: used });
    if (!step.clutch) { current = step.campaign; continue; }
    used.push(step.clutch.situation.id);
    current = playClutchRound(step.campaign, step.clutch, { ...headlessPlay(calls, step.campaign, step.clutch) }).campaign;
  }
  return current;
}

/** Como a medição decide as calls: sem call, ao acaso, sempre a certa, sempre a errada ou sempre o mesmo estilo. */
export type CallPolicy = 'none' | 'random' | 'best' | 'worst' | 'style';
export interface HeadlessCalls {
  policy: CallPolicy;
  role: PlayerRole;
  seed: string;
  playerOverall: number;
  matesOverall: number;
  chemistry: number | null;
  /** Para 'style': o perfil que você sempre escolhe. */
  style?: ClutchSituation['alternatives'][number]['profile'];
}

function headlessPlay(calls: HeadlessCalls, campaign: CampaignMajorState, moment: SceneClutchMoment): SceneClutchPlay {
  const opponent = moment.series.config.teamA.id === campaign.userTeamId ? moment.series.config.teamB : moment.series.config.teamA;
  const base = { playerOverall: calls.playerOverall, matesOverall: calls.matesOverall, opponentOverall: Math.round(opponent.power), chemistry: calls.chemistry };
  const read = readOf({ ...base, situation: moment.situation, seed: moment.drawSeed, round: roundContextOf(campaign, moment.series) });
  const alternatives = moment.situation.alternatives;
  let choice: 0 | 1 | 2 = 0;
  if (calls.policy === 'best') choice = read.best;
  else if (calls.policy === 'worst') choice = read.worst;
  else if (calls.policy === 'style') choice = Math.max(0, alternatives.findIndex((alternative) => alternative.profile === (calls.style ?? 'solid'))) as 0 | 1 | 2;
  else choice = Math.floor(createSeededRng(`${moment.drawSeed}:policy`)() * 3) as 0 | 1 | 2;
  return { ...base, choice };
}

/** Simula um campeonato inteiro (ou o resto dele, a partir de um save) e devolve o fechamento. */
export function simulateSceneEvent(state: PlayerCareerState, eventIndex: number, played?: Record<string, unknown>, fromStage: MajorStageKey | null = null, carry: StageCarry = { wins: 0, losses: 0 }, calls?: HeadlessCalls): SceneEventOutcome & { campaign: CampaignMajorState | null } {
  const entry = state.calendar?.[eventIndex];
  if (entry?.format === 'major') {
    const stage: MajorStageKey | null = fromStage ?? majorEntryStage(state);
    if (!stage) return { ...notQualified(state, eventIndex), campaign: null };
    const campaign = finishSceneEvent(startSceneEvent(state, eventIndex, played, stage).campaign, 8000, calls);
    return { ...sceneEventResult(state, eventIndex, campaign, stage, carry), campaign };
  }
  const campaign = finishSceneEvent(startSceneEvent(state, eventIndex, played).campaign, 8000, calls);
  return { ...sceneEventResult(state, eventIndex, campaign), campaign };
}

/** Major sem vaga: o time não chegou no ranking; fica no calendário como "Não classificado". */
export function notQualified(state: PlayerCareerState, eventIndex: number): SceneEventOutcome {
  return {
    result: { name: state.calendar?.[eventIndex]?.name ?? 'Major', placement: 'Não classificado', rating: 0, seriesWins: 0, seriesLosses: 0, skipped: true, tier: 'Major' },
    stats: [],
    players: []
  };
}

/** "Só as finais": simula até a sua série da final começar; se você cair antes, o campeonato acaba ali. */
export function advanceToFinal(campaign: CampaignMajorState, maxSteps = 8000): CampaignMajorState {
  let current = campaign;
  for (let guard = 0; guard < maxSteps && !current.finished; guard += 1) {
    const live = currentCampaignSeries(current);
    if (live && live.config.phase === 'final' && isUserSeries(current, live)) return current;
    current = stepSceneEvent(current).campaign;
  }
  return current;
}

export type BracketStage = 'swiss' | 'quarterfinal' | 'semifinal' | 'final';
export interface BracketStep {
  stage: BracketStage;
  label: string;
  status: 'won' | 'lost' | 'live' | 'next' | 'out';
  opponent: string | null;
  /** Placar em mapas do seu lado primeiro ("2-1"). */
  score: string | null;
}

const STAGE_LABEL: Record<BracketStage, string> = { swiss: 'Suíça', quarterfinal: 'Quartas', semifinal: 'Semis', final: 'Final' };

/** Onde você está na chave: as 3 fases com adversário, placar e o que já passou. */
export function userBracketPath(campaign: CampaignMajorState): BracketStep[] {
  // Série que acabou mas ainda não foi confirmada conta como decidida, não como "ao vivo".
  const current = currentCampaignSeries(campaign);
  const live = current && current.phase !== 'finished' ? current : null;
  const done = new Map<string, SeriesResult>();
  for (const series of campaign.run.matches) {
    // Só séries decididas: a que está rolando (ou mal abriu) aparece como "ao vivo", não como derrota.
    if (!series.winnerId || (live && series.id === live.config.id)) continue;
    if (isUserTeam(campaign, series.teamA.id) || isUserTeam(campaign, series.teamB.id)) done.set(series.phase, series);
  }
  let eliminated = false;
  // Suíça jogo a jogo enquanto o stage corre (3 vitórias classifica, 3 derrotas cai). No Major, os stages já
  // jogados viram um bloco cada ("Stage 1 · 3-1"); passou para o mata-mata, a suíça toda vira bloco.
  const multiStage = Boolean(campaign.run.entryStage);
  const userMatches = campaign.run.matches.filter((series) => isUserTeam(campaign, series.teamA.id) || isUserTeam(campaign, series.teamB.id));
  const inSwiss = Boolean(live && SWISS_PHASES.includes(live.config.phase as MajorStageKey) && isUserSeries(campaign, live));
  const reachedPlayoffs = userMatches.some((series) => !SWISS_PHASES.includes(series.phase as MajorStageKey)) || Boolean(live && isUserSeries(campaign, live) && !inSwiss);
  const swissSteps: BracketStep[] = [];
  const stagesPlayed = SWISS_PHASES.filter((phase) => userMatches.some((series) => series.phase === phase) || (inSwiss && live!.config.phase === phase));
  const nowStage = userStage(campaign);
  for (const phase of stagesPlayed) {
    const record = swissRecord(campaign, phase);
    const stageLabel = multiStage ? STAGE_NAME[phase] : STAGE_LABEL.swiss;
    if (record.losses >= 3) eliminated = true;
    const finishedStage = record.wins >= 3 || record.losses >= 3;
    if (phase !== nowStage || (finishedStage && (reachedPlayoffs || record.wins >= 3) && !(inSwiss && live!.config.phase === phase))) {
      swissSteps.push({ stage: 'swiss', label: stageLabel, status: record.wins >= 3 ? 'won' : 'lost', opponent: record.wins >= 3 ? 'Classificado' : 'Eliminado', score: `${record.wins}-${record.losses}` });
      continue;
    }
    const decided = userMatches.filter((series) => series.phase === phase && series.winnerId && !(live && series.id === live.config.id));
    decided.forEach((series, index) => {
      const userIsA = isUserTeam(campaign, series.teamA.id);
      swissSteps.push({
        stage: 'swiss', label: `${multiStage ? `${stageLabel} · ` : ''}Rodada ${index + 1}`, status: isUserTeam(campaign, series.winnerId) ? 'won' : 'lost',
        opponent: userIsA ? series.teamB.name : series.teamA.name,
        score: userIsA ? `${series.scoreA}-${series.scoreB}` : `${series.scoreB}-${series.scoreA}`
      });
    });
    if (inSwiss && live!.config.phase === phase) {
      const userIsA = live!.config.teamA.id === campaign.userTeamId;
      swissSteps.push({
        stage: 'swiss', label: `${multiStage ? `${stageLabel} · ` : ''}Rodada ${decided.length + 1} · ${record.wins}-${record.losses}`, status: 'live',
        opponent: userIsA ? live!.config.teamB.name : live!.config.teamA.name,
        score: userIsA ? `${live!.scoreA}-${live!.scoreB}` : `${live!.scoreB}-${live!.scoreA}`
      });
    }
  }
  return [...swissSteps, ...(['quarterfinal', 'semifinal', 'final'] as BracketStage[]).map((stage): BracketStep => {
    const series = done.get(stage);
    if (series) {
      const userIsA = isUserTeam(campaign, series.teamA.id);
      const won = isUserTeam(campaign, series.winnerId);
      if (!won) eliminated = true;
      return {
        stage, label: STAGE_LABEL[stage], status: won ? 'won' : 'lost',
        opponent: userIsA ? series.teamB.name : series.teamA.name,
        score: userIsA ? `${series.scoreA}-${series.scoreB}` : `${series.scoreB}-${series.scoreA}`
      };
    }
    if (live && live.config.phase === stage && isUserSeries(campaign, live)) {
      const userIsA = live.config.teamA.id === campaign.userTeamId;
      return {
        stage, label: STAGE_LABEL[stage], status: 'live',
        opponent: userIsA ? live.config.teamB.name : live.config.teamA.name,
        score: userIsA ? `${live.scoreA}-${live.scoreB}` : `${live.scoreB}-${live.scoreA}`
      };
    }
    return { stage, label: STAGE_LABEL[stage], status: eliminated ? 'out' : 'next', opponent: null, score: null };
  })];
}

const SWISS_PHASES: MajorStageKey[] = ['stage1', 'stage2', 'stage3'];

/** O stage suíço em que você está (ou o último que jogou); null fora da suíça. */
export function userStage(campaign: CampaignMajorState): MajorStageKey | null {
  const live = currentCampaignSeries(campaign);
  if (live && isUserSeries(campaign, live) && SWISS_PHASES.includes(live.config.phase as MajorStageKey)) return live.config.phase as MajorStageKey;
  const mine = campaign.run.matches.filter((series) => SWISS_PHASES.includes(series.phase as MajorStageKey) && (isUserTeam(campaign, series.teamA.id) || isUserTeam(campaign, series.teamB.id)));
  return (mine.at(-1)?.phase as MajorStageKey | undefined) ?? null;
}

/** Você já saiu do campeonato (3 derrotas num stage ou derrota no mata-mata)? O resto roda sem você. */
export function userOut(campaign: CampaignMajorState): boolean {
  if (campaign.finished) return true;
  const live = currentCampaignSeries(campaign);
  if (live && isUserSeries(campaign, live) && live.phase !== 'finished') return false;
  const mine = campaign.run.matches.filter((series) => series.winnerId && (isUserTeam(campaign, series.teamA.id) || isUserTeam(campaign, series.teamB.id)));
  if (mine.some((series) => !SWISS_PHASES.includes(series.phase as MajorStageKey) && !isUserTeam(campaign, series.winnerId))) return true;
  const stage = userStage(campaign);
  return stage ? swissRecord(campaign, stage).losses >= 3 : false;
}

/** Sua campanha num stage suíço (Major e eventos de 16): só séries decididas (a que está rolando não conta). */
export function swissRecord(campaign: CampaignMajorState, stage: MajorStageKey = userStage(campaign) ?? 'stage3'): { wins: number; losses: number } {
  const live = currentCampaignSeries(campaign);
  const decided = campaign.run.matches.filter((series) => series.phase === stage && series.winnerId
    && !(live && series.id === live.config.id && live.phase !== 'finished')
    && (isUserTeam(campaign, series.teamA.id) || isUserTeam(campaign, series.teamB.id)));
  const wins = decided.filter((series) => isUserTeam(campaign, series.winnerId)).length;
  return { wins, losses: decided.length - wins };
}

/** O campeonato (ou o stage do Major) acabou para você? Stage 1/2 terminam na suíça. */
export function eventDone(campaign: CampaignMajorState, setup: EventSetup): boolean {
  if (campaign.finished) return true;
  // Major: caiu num stage (ou no mata-mata), o resto do Major roda sem tela no fechamento.
  if (setup.stage && !setup.swissOnly) return userOut(campaign);
  if (!setup.swissOnly) return false;
  const record = swissRecord(campaign);
  return record.wins >= 3 || record.losses >= 3;
}

/** Saiu da suíça classificado (3 vitórias)? */
export const advancedFromSwiss = (campaign: CampaignMajorState): boolean => swissRecord(campaign).wins >= 3;

/** Roda até o fim do stage (suíça) ou do campeonato, sem pausas. */
export function finishSceneStage(campaign: CampaignMajorState, setup: EventSetup, maxSteps = 12000): CampaignMajorState {
  let current = campaign;
  for (let guard = 0; guard < maxSteps && !eventDone(current, setup); guard += 1) current = stepSceneEvent(current).campaign;
  return current;
}

/**
 * Entrada no Major por um ranking simulado (VRS): a força do time pelo ranking real mais o que ele fez na
 * temporada (títulos, finais, rating). Top 8 entra no Stage 3, até o 16º no Stage 2, até o 32º no Stage 1.
 */
export function majorEntryStage(state: PlayerCareerState): MajorStageKey | null {
  if (!sceneOrgById.get(state.orgId)) return null;
  const org = orgOf(state.orgId, state) as SceneOrg;
  const results = (state.calendar ?? []).flatMap((entry) => (entry.result && !entry.result.skipped ? [entry.result] : []));
  const titles = results.filter((result) => result.placement === 'Campeão').length;
  const finals = results.filter((result) => result.placement === 'Vice').length;
  const rating = results.length ? results.reduce((sum, result) => sum + result.rating, 0) / results.length : 1;
  const base = org.power ?? ORG_BASE_POWER[org.level] ?? 60;
  const score = base + titles * 2.5 + finals + (rating - 1) * 15;
  const rank = 1 + sceneOrgs.filter((other) => other.id !== org.id && (other.power ?? ORG_BASE_POWER[levelIn(state, other)] ?? 60) > score).length;
  return rank <= 8 ? 'stage3' : rank <= 16 ? 'stage2' : rank <= 32 ? 'stage1' : null;
}
