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
import { armClutchCall } from '../rounds';
import type { ClutchProfile, ClutchSituation } from './decisions';
import { drawClutchSituation, resolveClutchEdge } from './decisions';
import { ACTIVE_DUTY_POOLS_BY_YEAR, getActiveDutyMapsForYear } from '../maps';
import type { HistoricalTeam, OrgStyle, Player, SelectedPlayer, TeamSide } from '../types';
import { createSeededRng } from '../simulation';
import { ORG_BASE_POWER, sceneOrgById, sceneOrgs, type SceneOrg } from './data';
import type { PlayerCareerState, PlayerRole } from './engine';
// Ciclo deliberado (só em nível de função): o squad é a fonte única dos parceiros (com sinergia).
import { matesOf, myPlayerOf } from './squad';

const LATEST_POOL_YEAR = Math.max(...Object.keys(ACTIVE_DUTY_POOLS_BY_YEAR).map(Number));

/** O pool de mapas do ano da carreira. A carreira anda além da tabela de active duty (2027, 2028…): sem
 *  pool o veto quebra, então o futuro herda o último pool conhecido. */
export const careerMapPool = (year: number) => getActiveDutyMapsForYear(Math.min(year, LATEST_POOL_YEAR));

/** Mesmo formato de evento da carreira manager: 8 times, tudo BO3. */
export const SCENE_EVENT_FORMAT = { quarterfinal: 3, semifinal: 3, final: 3 } as const;
const ENGINE_TIER: Record<number, string> = { 1: 'contender', 2: 'contender', 3: 'playoff-team', 4: 'dangerous-underdog', 5: 'underdog' };
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
  const base = ORG_BASE_POWER[org.level] ?? 60;
  return SLOTS.map((role, index) => {
    const nick = org.roster[index]?.nick ?? `${org.name} ${index + 1}`;
    const overall = clamp(base + Math.round((rng() - 0.5) * 8), 40, 99);
    return enginePlayer(`${org.id}:${role}`, nick, overall, role, rng);
  });
}

export function sceneOrgToEngineTeam(org: SceneOrg, players: Player[]): HistoricalTeam {
  const preview = Math.round(players.reduce((sum, player) => sum + (player.overall ?? 60), 0) / Math.max(1, players.length));
  return { id: org.id, name: org.name, year: null, players: players.map((player) => player.id), tier: ENGINE_TIER[org.level] ?? 'underdog', teamPowerPreview: preview, style: null };
}

/** O time do jogador criado: sua carta (com bônus de treino) + os 4 parceiros com sinergia aplicada. */
export function userEnginePlayers(state: PlayerCareerState): Player[] {
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
export function sceneEventOpponents(state: PlayerCareerState, eventIndex: number) {
  const seed = `${state.seed}:event:${state.seasonNumber}:${eventIndex}`;
  const rng = createSeededRng(`${seed}:field`);
  const userOrg = sceneOrgById.get(state.orgId);
  const level = userOrg?.level ?? 5;
  const pool = sceneOrgs.filter((org) => org.id !== state.orgId && Math.abs(org.level - level) <= 1);
  const picked: SceneOrg[] = [];
  while (picked.length < 7 && picked.length < pool.length) {
    const candidate = pool[Math.floor(rng() * pool.length)];
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  const rosters = new Map(picked.map((org) => [org.id, sceneOrgEnginePlayers(org, seed)]));
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

/** A chave de 8 do campeonato, do mais forte pro mais fraco — o que o detalhe do calendário mostra. */
export function sceneEventField(state: PlayerCareerState, eventIndex: number): SceneFieldTeam[] {
  const { picked, rosters } = sceneEventOpponents(state, eventIndex);
  const average = (players: Player[]) => Math.round(players.reduce((sum, player) => sum + (player.overall ?? 60), 0) / Math.max(1, players.length));
  const userOrg = sceneOrgById.get(state.orgId);
  const teams: SceneFieldTeam[] = [
    { orgId: state.orgId, name: userOrg?.name ?? 'Lan House do Bairro', level: userOrg?.level ?? 5, overall: average(userEnginePlayers(state)), isUser: true },
    ...picked.map((org) => ({ orgId: org.id, name: org.name, level: org.level, overall: average(rosters.get(org.id) ?? []), isUser: false }))
  ];
  return teams.sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
}

/** Um campeonato da temporada no motor de Major: chave de 8 com rivais reais do nível ±1. */
export function startSceneEvent(state: PlayerCareerState, eventIndex: number, played?: Record<string, unknown>): SceneEventField {
  const { seed, picked, rosters } = sceneEventOpponents(state, eventIndex);
  const userPlayers = userEnginePlayers(state);
  const opponents = picked.map((org) => sceneOrgToEngineTeam(org, rosters.get(org.id)!));
  const allPlayers = [...userPlayers, ...picked.flatMap((org) => rosters.get(org.id) ?? [])];
  const campaign = createCampaignMajor(userPlayers, 'balanced', opponents, allPlayers, seed, lineupOf(userPlayers), {
    playoffEntry: SCENE_EVENT_FORMAT,
    dynastyRules: 2,
    dynastyPlan: { style: 'balanced', tactic: 'standard', study: false },
    // O pool atual do CS2 do ano da carreira — mapas de verdade na chave, sem veto amador.
    neutralMapPool: careerMapPool(state.year),
    ...(played ? { played: played as never } : {})
  });
  // O SeriesViewer pinta "seu time" pelo isUser: marca a org no engine (vale pra TODAS as séries futuras,
  // que copiam o time da org) e a série que já abriu na criação da chave.
  const organization = campaign.engine.byId.get(campaign.userTeamId);
  if (organization) organization.team = { ...organization.team, isUser: true };
  const openSeries = currentCampaignSeries(campaign);
  if (openSeries) {
    if (openSeries.config.teamA.id === campaign.userTeamId) openSeries.config.teamA = { ...openSeries.config.teamA, isUser: true };
    else openSeries.config.teamB = { ...openSeries.config.teamB, isUser: true };
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
          situation: drawClutchSituation(ctx.role, drawSeed, ctx.usedSituationIds),
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
}

/** Sua call no round decisivo: arma o edge na probabilidade do round e ele roda no motor — RNG decide. */
export function playClutchRound(campaign: CampaignMajorState, moment: SceneClutchMoment, play: SceneClutchPlay): SceneClutchOutcome {
  const live = currentCampaignSeries(campaign);
  if (!live?.current) return { campaign, won: false, profile: 'solid', edge: 0, coin: null, kills: 0 };
  const userSide: TeamSide = live.config.teamA.id === campaign.userTeamId ? 'a' : 'b';
  const resolve = resolveClutchEdge({ ...play, situation: moment.situation, seed: moment.drawSeed });
  armClutchCall(live.current.state, userSide, resolve.edge);
  const stepped = stepCampaignSeries(campaign);
  const after = currentCampaignSeries(stepped) ?? live;
  const detail = after.current ? after.current.state.details.at(-1) : after.maps.at(-1)?.details?.at(-1) ?? null;
  const kills = detail ? detail.kills.filter((kill) => kill.killerSide === userSide && (!play.playerId || kill.killerId === play.playerId)).length : 0;
  return { campaign: stepped, won: detail ? detail.winner === userSide : false, profile: resolve.profile, edge: resolve.edge, coin: resolve.coin, kills };
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
