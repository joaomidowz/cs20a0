// tests/helpers/soloLab.ts
// Laboratório do solo contra bots: joga Majors inteiros pela MESMA montagem de campo do servidor
// (`server/room-manager.ts`, `beginTournament`), para a dificuldade sair do motor e não de uma conta.
import { CHAMPION_TEAM_IDS } from '../../src/lib/game/online/major-champions';
import { botFieldPower, planBotField, soloFieldRelief } from '../../src/lib/game/online/bot-field';
import { courtPower } from '../../src/lib/game/courtPower';
import { createTournamentEngine, runTournamentToEnd, toResult, type TournamentOrganization } from '../../src/lib/game/online/tournament-engine';
import { calculateHistoricalTeamPower, createSeededRng } from '../../src/lib/game/simulation';
import { createBotMapStrategy, type MapSimulationContext } from '../../src/lib/game/map-veto';
import { players as corePlayers, teams as coreTeams } from '../../server/data';
import type { HistoricalTeam, Roster } from '../../src/lib/game/types';
import type { LabSide } from './balanceLab';

export interface SoloOutcome {
  /** Share of runs won, 0-100. */
  title: number;
  /** Share of runs that reached the final. */
  final: number;
  /** Share of runs that ended in the Swiss stage. */
  swissExit: number;
  level: number;
  relief: number;
}

const playerById = new Map(corePlayers.map((player) => [player.id, player]));

/** `runs` solo Majors of `me` against the field the server would draw; `relief` defaults to the table of `balance.ts`. */
export function soloMajors(me: LabSide, field: 'random' | 'champions', runs: number, reliefOverride?: number): SoloOutcome {
  const level = courtPower(me.team.power);
  const relief = reliefOverride ?? soloFieldRelief(level, field);
  let titles = 0; let finals = 0; let swiss = 0;
  for (let run = 0; run < runs; run += 1) {
    const seed = `solo-lab:${field}:${me.team.id}:${run}`;
    const shuffled = [...coreTeams].sort((left, right) => {
      const order = field === 'champions' ? Number(!CHAMPION_TEAM_IDS.has(left.id)) - Number(!CHAMPION_TEAM_IDS.has(right.id)) : 0;
      return order || createSeededRng(`${seed}:bot:${left.id}`)() - createSeededRng(`${seed}:bot:${right.id}`)() || left.id.localeCompare(right.id);
    }) as HistoricalTeam[];
    const plan = field === 'champions' ? { order: shuffled, zebraIds: new Set<string>() } : planBotField({ shuffled, playerById, seed, slots: 15 });
    const strategies: MapSimulationContext['strategies'] = new Map();
    const rosters = new Map<string, Roster>();
    strategies.set('me', { ...me.strategy, teamId: 'me' });
    rosters.set('me', me.roster);
    const organizations: TournamentOrganization[] = [{ id: 'me', name: 'me', seed: 1, team: { ...me.team, id: 'me' }, human: true }];
    const botPool: TournamentOrganization[] = plan.order.slice(0, 20).map((team, index) => {
      const combat = calculateHistoricalTeamPower(team, corePlayers);
      const id = `bot-${team.id}`;
      strategies.set(id, { ...createBotMapStrategy(team), teamId: id });
      rosters.set(id, { players: corePlayers.filter((player) => (team.players ?? []).includes(player.id)) });
      return { id, name: combat.name, seed: index + 2, team: { ...combat, id, power: botFieldPower(combat.power, team, plan.zebraIds.has(team.id), relief, playerById) }, human: false, sourceTeamId: team.id };
    });
    const engine = createTournamentEngine({ organizations, botPool, entryStage: 'stage3', seed, powerScale: 'court', swissBestOf: 3, mapContext: { mode: 'premier', seed: `${seed}:maps`, strategies, rosters }, controllerFor: () => 'bot', interactiveVeto: () => false });
    const result = toResult(runTournamentToEnd(engine));
    const mine = result.campaigns.find((campaign) => campaign.organizationId === 'me');
    const placement = String(mine?.placement ?? '');
    if (result.championId === 'me') titles += 1;
    if (placement === 'placementChampion' || placement === 'placementRunnerUp') finals += 1;
    if (/swiss|stage/i.test(placement)) swiss += 1;
  }
  const share = (count: number) => Math.round((count / runs) * 100);
  return { title: share(titles), final: share(finals), swissExit: share(swiss), level, relief };
}
