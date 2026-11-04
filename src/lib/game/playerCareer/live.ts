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
import type { HistoricalTeam, OrgStyle, Player, PlayerRunStats, SelectedPlayer, SeriesResult, TeamSide } from '../types';
import { createRunStats } from '../runStats';
import { computeMajorAwards } from '../majorAwards';
import { toResult } from '../online/tournament-engine';
import { createSeededRng } from '../simulation';
import { orgIn } from './world';
import { regionOf, type Region } from './calendar';
import { memberCatalogOverall, memberNick, ORG_BASE_POWER, rosterBySlot, sceneOrgById, sceneOrgs, type SceneOrg } from './data';
import type { BracketLine, EventMvp, EventPlays, PlayerCareerState, PlayerRole, TournamentResult } from './engine';
import { levelIn, orgOf } from './engine';
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
  // Base pelo ranking real (Vitality acima de Passion UA); sem ranking, a faixa do nível.
  const base = org.power ?? ORG_BASE_POWER[org.level] ?? 60;
  // Cada nick na posição da função real dele (ZywOo no AWP, apEX no IGL), não na ordem do elenco.
  const bySlot = rosterBySlot(org, SLOTS);
  return SLOTS.map((role, index) => {
    const member = bySlot[index];
    const nick = member ? memberNick(member) : `${org.name} ${index + 1}`;
    const noise = Math.round((rng() - 0.5) * 8);
    // Quem está no catálogo joga perto do overall real dele (60% real, 40% a base do time); no mundo da carreira o
    // overall é o da temporada (o jovem cresce, o veterano cai).
    const real = member ? member.overall ?? memberCatalogOverall(member) : null;
    const overall = clamp(real !== null ? Math.round(real * 0.6 + base * 0.4) : Math.round(base) + noise, 40, 99);
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
    const current = stage ?? 'stage3';
    const levels: [number, number] = current === 'stage3' ? [0, 1] : current === 'stage2' ? [1, 2] : [2, 3];
    return { swiss: true, swissOnly: current !== 'stage3', opponents: 15, levels, finalBestOf: 5, stage: current };
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
    : userLevel >= 4 || entry?.tier === 'C' ? 1
    : entry?.tier === 'B' ? 0.7
    : entry?.tier === 'A' && userLevel >= 2 ? 0.5
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
  const draw = (pool: SceneOrg[], until: number) => {
    const available = pool.filter((org) => !picked.includes(org));
    while (picked.length < until && available.length) picked.push(available.splice(Math.floor(rng() * available.length), 1)[0]);
  };
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
export function startSceneEvent(state: PlayerCareerState, eventIndex: number, played?: Record<string, unknown>, stage: MajorStageKey | null = null): SceneEventField {
  const setup = eventSetup(state, eventIndex, stage);
  const { seed, picked, rosters } = sceneEventOpponents(state, eventIndex, stage);
  const userPlayers = userEnginePlayers(state);
  const opponents = picked.map((org) => sceneOrgToEngineTeam(org, rosters.get(org.id)!));
  const allPlayers = [...userPlayers, ...picked.flatMap((org) => rosters.get(org.id) ?? [])];
  const campaign = createCampaignMajor(userPlayers, 'balanced', opponents, allPlayers, seed, lineupOf(userPlayers), {
    // Suíça de 16 (mata-mata depois, final MD5) ou direto no mata-mata de 8 com a final do evento.
    ...(setup.swiss ? {} : { playoffEntry: { ...SCENE_EVENT_FORMAT, final: setup.finalBestOf } }),
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

/** Colocação do run do motor → rótulo da carreira. */
export function placementLabel(placement: string): TournamentResult['placement'] {
  if (placement === 'placementChampion') return 'Campeão';
  if (placement === 'placementRunnerUp') return 'Vice';
  if (placement === 'placement3to4') return 'Semis';
  if (placement === 'placementStage3') return 'Fase suíça';
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

export interface EventAwards { champion?: string; mvp?: EventMvp; plays?: EventPlays; bracket?: BracketLine[] }

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
    ...(bracket.length ? { bracket } : {})
  };
}

/** Ace, quad e clutch seus, contados direto dos destaques dos rounds do kill feed. */
function countPlays(series: SeriesResult[], playerId: string): EventPlays {
  const plays = { aces: 0, quads: 0, clutches: 0 };
  for (const item of series) for (const map of item.maps) for (const round of map.details ?? []) {
    const highlight = round.highlight;
    if (!highlight || highlight.playerId !== playerId) continue;
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
  const placement = stage && stage !== 'stage3' && !campaign.finished ? STAGE_NAME[stage] : placementLabel(campaign.run.placement);
  return {
    result: {
      name: state.calendar?.[eventIndex]?.name ?? `Campeonato ${eventIndex + 1}`,
      placement,
      rating: Number((mine?.runRating ?? 0.95).toFixed(2)),
      seriesWins: wins + carry.wins,
      seriesLosses: decided.length - wins + carry.losses,
      ...(state.calendar?.[eventIndex]?.tier ? { tier: state.calendar[eventIndex].tier } : {}),
      ...eventAwards(state, campaign)
    },
    stats,
    players
  };
}

/** Roda o resto do campeonato sem pausas (o time decide os rounds decisivos sozinho). */
export function finishSceneEvent(campaign: CampaignMajorState, maxSteps = 8000): CampaignMajorState {
  let current = campaign;
  for (let guard = 0; guard < maxSteps && !current.finished; guard += 1) current = stepSceneEvent(current).campaign;
  return current;
}

/** Simula um campeonato inteiro (ou o resto dele, a partir de um save) e devolve o fechamento. */
export function simulateSceneEvent(state: PlayerCareerState, eventIndex: number, played?: Record<string, unknown>, fromStage: MajorStageKey | null = null, carry: StageCarry = { wins: 0, losses: 0 }): SceneEventOutcome & { campaign: CampaignMajorState | null } {
  const entry = state.calendar?.[eventIndex];
  if (entry?.format === 'major') {
    let stage: MajorStageKey | null = fromStage ?? majorEntryStage(state);
    if (!stage) return { ...notQualified(state, eventIndex), campaign: null };
    let total = { ...carry };
    let restore = played;
    for (;;) {
      const setup = eventSetup(state, eventIndex, stage);
      const campaign = finishSceneStage(startSceneEvent(state, eventIndex, restore, stage).campaign, setup);
      restore = undefined;
      const next: MajorStageKey | null = NEXT_STAGE[stage];
      if (setup.swissOnly && advancedFromSwiss(campaign) && next) {
        const record = swissRecord(campaign);
        total = { wins: total.wins + record.wins, losses: total.losses + record.losses };
        stage = next;
        continue;
      }
      return { ...sceneEventResult(state, eventIndex, campaign, stage, total), campaign };
    }
  }
  const campaign = finishSceneEvent(startSceneEvent(state, eventIndex, played).campaign);
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
  const live = currentCampaignSeries(campaign);
  const done = new Map<string, SeriesResult>();
  for (const series of campaign.run.matches) {
    // Só séries decididas: a que está rolando (ou mal abriu) aparece como "ao vivo", não como derrota.
    if (!series.winnerId || (live && series.id === live.config.id)) continue;
    if (isUserTeam(campaign, series.teamA.id) || isUserTeam(campaign, series.teamB.id)) done.set(series.phase, series);
  }
  let eliminated = false;
  // Eventos com suíça: o primeiro passo é a campanha (3 vitórias classifica, 3 derrotas cai).
  const swissSeries = campaign.run.matches.filter((series) => series.phase === 'stage3' && (isUserTeam(campaign, series.teamA.id) || isUserTeam(campaign, series.teamB.id)));
  const swissSteps: BracketStep[] = [];
  if (swissSeries.length || (live && live.config.phase === 'stage3')) {
    const record = swissRecord(campaign);
    const inSwiss = live && live.config.phase === 'stage3' && isUserSeries(campaign, live);
    const status: BracketStep['status'] = record.losses >= 3 ? 'lost' : record.wins >= 3 ? 'won' : inSwiss ? 'live' : 'next';
    if (status === 'lost') eliminated = true;
    swissSteps.push({ stage: 'swiss', label: STAGE_LABEL.swiss, status, opponent: inSwiss ? (live!.config.teamA.id === campaign.userTeamId ? live!.config.teamB.name : live!.config.teamA.name) : null, score: `${record.wins}-${record.losses}` });
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

/** Sua campanha na fase suíça (Major e eventos de 16). */
export function swissRecord(campaign: CampaignMajorState): { wins: number; losses: number } {
  return { wins: campaign.run.stage3?.wins ?? 0, losses: campaign.run.stage3?.losses ?? 0 };
}

/** O campeonato (ou o stage do Major) acabou para você? Stage 1/2 terminam na suíça. */
export function eventDone(campaign: CampaignMajorState, setup: EventSetup): boolean {
  if (campaign.finished) return true;
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
  const rank = 1 + sceneOrgs.filter((other) => other.id !== org.id && (other.power ?? ORG_BASE_POWER[other.level] ?? 60) > score).length;
  return rank <= 8 ? 'stage3' : rank <= 16 ? 'stage2' : rank <= 32 ? 'stage1' : null;
}
