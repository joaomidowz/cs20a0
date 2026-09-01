import { createSeededRng } from '../simulation';
import type { CombatTeam, SeriesResult } from '../types';
import type {
  ReplayEventV1,
  ReplayGrenadeType,
  ReplayLoadoutV1,
  ReplayPlanV1,
  ReplayPlayerV1,
  ReplayRouteV1,
  ReplayTacticalRole,
  ReplayTSplit,
  ReplayWeapon
} from './types';
import { assignGoldenSquadResponsibilities, selectGoldenStrategy } from './golden/tactics';
import { getMapGraph } from './topology/maps';
import { findMapRoute } from './topology/routes';

const organizationId = (team: CombatTeam) => team.organizationId ?? team.id;
type UnsequencedReplayEvent<Event extends ReplayEventV1 = ReplayEventV1> =
  Event extends ReplayEventV1 ? Omit<Event, 'sequence'> : never;

function replayPlayers(team: CombatTeam): ReplayPlayerV1[] {
  const lineup = team.lineup?.length === 5
    ? team.lineup
    : Array.from({ length: 5 }, (_, index) => ({
        playerId: `${team.id}:player:${index + 1}`,
        selectedSlotRole: index === 0 ? 'awper' as const : index === 1 ? 'igl' as const : index === 2 ? 'entry' as const : index === 3 ? 'support' as const : 'rifler' as const
      }));
  const directRole = (role: typeof lineup[number]['selectedSlotRole']): ReplayTacticalRole =>
    role === 'awper' ? 'awp'
      : role === 'igl' ? 'igl'
        : role === 'lurker' ? 'lurk'
          : role === 'entry' ? 'entry'
            : role === 'support' ? 'support'
              : 'rifler';
  return lineup.map((selected, index) => ({
    id: selected.playerId,
    organizationId: organizationId(team),
    role: selected.selectedSlotRole,
    tacticalRole: directRole(selected.selectedSlotRole)
  }));
}

const T_SPLITS: ReplayTSplit[] = ['5-0', '4-1', '3-2', '2-1-2'];
const CT_SETUPS = [
  { a: 2, b: 2, mid: 1 },
  { a: 2, b: 1, mid: 2 },
  { a: 1, b: 2, mid: 2 }
] as const;

export function getRoundSides(series: SeriesResult, roundNumber: number) {
  const teamAId = organizationId(series.teamA);
  const teamBId = organizationId(series.teamB);
  const teamAStartsT = roundNumber <= 24
    ? roundNumber <= 12
    : Math.floor((roundNumber - 25) / 3) % 2 === 0;
  return teamAStartsT
    ? { tOrganizationId: teamAId, ctOrganizationId: teamBId }
    : { tOrganizationId: teamBId, ctOrganizationId: teamAId };
}

function primaryWeapon(player: ReplayPlayerV1, side: 'T' | 'CT'): ReplayWeapon {
  if (player.role === 'awper') return 'awp';
  return side === 'T' ? 'ak47' : 'm4a1';
}

function loadoutFor(player: ReplayPlayerV1, side: 'T' | 'CT', index: number): ReplayLoadoutV1 {
  const grenades: ReplayGrenadeType[] = index === 0
    ? ['smoke', 'flash']
    : index === 1 ? ['flash', 'he'] : index === 2 ? ['molotov'] : ['flash'];
  return { playerId: player.id, primary: primaryWeapon(player, side), grenades };
}

function eventPriority(event: ReplayEventV1) {
  const priorities: Record<ReplayEventV1['type'], number> = {
    grenade: 0,
    shot: 1,
    damage: 2,
    kill: 3,
    plant: 4,
    defuse: 5,
    explosion: 5,
    'round-end': 6
  };
  return priorities[event.type];
}

function finalizeEvents(events: UnsequencedReplayEvent[]): ReplayEventV1[] {
  return events
    .sort((left, right) => left.atMs - right.atMs || eventPriority(left as ReplayEventV1) - eventPriority(right as ReplayEventV1) || left.id.localeCompare(right.id))
    .map((event, sequence) => ({ ...event, sequence } as ReplayEventV1));
}

export function createReplayPlan(series: SeriesResult, mapIndex: number): ReplayPlanV1 {
  const map = series.maps[mapIndex];
  if (!map?.mapId) throw new Error(`Series ${series.id} map ${mapIndex} has no mapId`);
  const graph = getMapGraph(map.mapId);
  const players = [...replayPlayers(series.teamA), ...replayPlayers(series.teamB)];
  const playersByOrganization = new Map([
    [organizationId(series.teamA), players.filter((player) => player.organizationId === organizationId(series.teamA))],
    [organizationId(series.teamB), players.filter((player) => player.organizationId === organizationId(series.teamB))]
  ]);
  const styleByOrganization = new Map([
    [organizationId(series.teamA), series.teamA.style ?? 'balanced'],
    [organizationId(series.teamB), series.teamB.style ?? 'balanced']
  ]);
  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }

  let previousA = 0;
  let previousB = 0;
  const rounds = map.rounds.map((score, roundIndex) => {
    const number = roundIndex + 1;
    const sides = getRoundSides(series, number);
    const winnerOrganizationId = score.a > previousA ? organizationId(series.teamA) : organizationId(series.teamB);
    previousA = score.a;
    previousB = score.b;
    const roundSeed = `${series.id}:${mapIndex}:round:${number}`;
    const rng = createSeededRng(roundSeed);
    const durationMs = 72_000 + Math.floor(rng() * 38_000);
    const siteNodeId = (rng() < 0.5 ? 'a_site' : 'b_site') as 'a_site' | 'b_site';
    const tSplit = T_SPLITS[(number - 1) % T_SPLITS.length];
    const ctSetup = CT_SETUPS[(number - 1) % CT_SETUPS.length];
    const executeAtMs = Math.floor(durationMs * (0.47 + rng() * 0.12));
    const tPlayers = [...(playersByOrganization.get(sides.tOrganizationId) ?? [])]
      .sort((left, right) => {
        const priority: Record<ReplayTacticalRole, number> = {
          entry: 0,
          support: 1,
          igl: 2,
          trade: 2,
          rifler: 3,
          awp: 4,
          lurk: 5
        };
        return priority[left.tacticalRole] - priority[right.tacticalRole] || left.id.localeCompare(right.id);
      });
    const ctPlayers = playersByOrganization.get(sides.ctOrganizationId) ?? [];
    const siteTargets = (site: 'a_site' | 'b_site') => [site, ...(adjacency.get(site) ?? [])];
    const aTargets = siteTargets('a_site');
    const bTargets = siteTargets('b_site');
    const primaryTargets = siteNodeId === 'a_site' ? aTargets : bTargets;
    const secondaryTargets = siteNodeId === 'a_site' ? bTargets : aTargets;
    const midTargets = graph.nodes
      .filter((node) => node.id.includes('mid') && node.kind !== 'spawn:T' && node.kind !== 'spawn:CT')
      .map((node) => node.id);
    if (!midTargets.length) {
      midTargets.push(...graph.nodes.filter((node) => node.kind === 'lane').map((node) => node.id));
    }
    const angleTargets = graph.nodes.filter((node) => node.kind === 'angle').map((node) => node.id);
    const pickTarget = (targets: string[], index: number) => targets[index % Math.max(1, targets.length)] ?? siteNodeId;
    const tTarget = (index: number) => {
      if (tSplit === '5-0') return pickTarget(primaryTargets, index);
      if (tSplit === '4-1') return index === tPlayers.length - 1
        ? pickTarget(secondaryTargets, index)
        : pickTarget(primaryTargets, index);
      if (tSplit === '3-2') return index >= 3
        ? pickTarget(secondaryTargets, index)
        : pickTarget(primaryTargets, index);
      if (index < 2) return pickTarget(aTargets, index);
      if (index === 2) return pickTarget(midTargets, index);
      return pickTarget(bTargets, index);
    };
    const ctTargets = [
      ...Array.from({ length: ctSetup.a }, (_, index) => pickTarget(aTargets, index)),
      ...Array.from({ length: ctSetup.b }, (_, index) => pickTarget(bTargets, index)),
      ...Array.from({ length: ctSetup.mid }, (_, index) => pickTarget(midTargets, index))
    ];
    const hasLurk = tPlayers.some((player) => player.tacticalRole === 'lurk');
    const createRoute = (player: ReplayPlayerV1, playerIndex: number, side: 'T' | 'CT'): ReplayRouteV1 => {
      const startId = side === 'T' ? 't_spawn' : 'ct_spawn';
      const assignedTarget = side === 'T' ? tTarget(playerIndex) : pickTarget(ctTargets, playerIndex);
      const targetId = player.tacticalRole === 'awp' && angleTargets.length
        ? pickTarget(angleTargets, number + playerIndex)
        : assignedTarget;
      const lateRotation = player.tacticalRole === 'lurk' || (side === 'T' && player.tacticalRole === 'support' && !hasLurk);
      const startAtMs = lateRotation
        ? 6_000 + Math.floor(rng() * 4_001)
        : player.tacticalRole === 'entry' ? 0
          : player.tacticalRole === 'awp' ? 500 + Math.floor(rng() * 600)
            : player.tacticalRole === 'trade' || player.tacticalRole === 'rifler' ? 1_600 + Math.floor(rng() * 900)
              : 2_400 + Math.floor(rng() * 1_200);
      const executeNoiseMs = Math.floor((rng() - 0.5) * 8_000);
      return {
        playerId: player.id,
        tacticalRole: player.tacticalRole,
        nodeIds: findMapRoute(graph, startId, targetId, `${roundSeed}:${player.id}`),
        startAtMs,
        endAtMs: Math.max(startAtMs + 1_000, Math.min(Math.floor(durationMs * 0.78), executeAtMs + executeNoiseMs)),
        stopOffset: {
          x: Number(((rng() - 0.5) * 0.04).toFixed(6)),
          y: Number(((rng() - 0.5) * 0.04).toFixed(6))
        }
      };
    };
    const tRoutes = tPlayers.map((player, playerIndex) => createRoute(player, playerIndex, 'T'));
    const entryRoute = tRoutes.find((route) => route.tacticalRole === 'entry');
    const tacticalPlan = selectGoldenStrategy(styleByOrganization.get(sides.tOrganizationId) ?? 'balanced', `${roundSeed}:tactics`);
    const responsibilities = assignGoldenSquadResponsibilities(
      tPlayers.map((player) => ({ id: player.id, selectedRole: player.role })),
      tacticalPlan
    );
    const tradePlayerId = responsibilities.find((assignment) => assignment.responsibility === 'TRADER')?.playerId;
    const tradeRoute = tRoutes.find((route) => route.playerId === tradePlayerId);
    if (entryRoute && tradeRoute) {
      const segmentDurationMs = (entryRoute.endAtMs - entryRoute.startAtMs) /
        Math.max(1, entryRoute.nodeIds.length - 1);
      const followDelayMs = Math.min(4_000, Math.max(1_800, segmentDurationMs * 2));
      tradeRoute.nodeIds = [...entryRoute.nodeIds];
      tradeRoute.startAtMs = Math.floor(entryRoute.startAtMs + followDelayMs);
      tradeRoute.endAtMs = Math.min(Math.floor(durationMs * 0.84), Math.floor(entryRoute.endAtMs + followDelayMs));
    }
    const routes: ReplayRouteV1[] = [
      ...tRoutes,
      ...ctPlayers.map((player, playerIndex) => createRoute(player, playerIndex, 'CT'))
    ];
    const loadouts = players.map((player, playerIndex) =>
      loadoutFor(player, player.organizationId === sides.tOrganizationId ? 'T' : 'CT', playerIndex % 5));
    const winningPlayers = playersByOrganization.get(winnerOrganizationId) ?? [];
    const losingOrganizationId = winnerOrganizationId === organizationId(series.teamA)
      ? organizationId(series.teamB)
      : organizationId(series.teamA);
    const losingPlayers = playersByOrganization.get(losingOrganizationId) ?? [];
    const winnerDeaths = number % 4;
    const victims = [...losingPlayers, ...winningPlayers.slice(0, winnerDeaths)];
    const events: UnsequencedReplayEvent[] = [];

    const grenadePlayer = tPlayers[number % Math.max(1, tPlayers.length)];
    if (grenadePlayer) {
      events.push({
        id: `${roundSeed}:grenade`,
        type: 'grenade',
        roundNumber: number,
        atMs: Math.floor(durationMs * 0.18),
        nodeId: siteNodeId,
        playerId: grenadePlayer.id,
        grenadeType: number % 2 === 0 ? 'flash' : 'smoke',
        targetNodeId: siteNodeId
      });
    }

    victims.forEach((victim, victimIndex) => {
      const killers = victim.organizationId === winnerOrganizationId ? losingPlayers : winningPlayers;
      const killerIndex = (victimIndex + number) % Math.max(1, killers.length);
      const killer = killers[killerIndex];
      if (!killer) return;
      const damageAssistant = killers.length > 1 ? killers[(killerIndex + 1) % killers.length] : killer;
      const openingDamage = 18 + ((number * 7 + victimIndex * 11) % 31);
      const lethalDamage = 100 - openingDamage;
      const atMs = Math.floor(durationMs * (0.28 + (victimIndex / Math.max(1, victims.length)) * 0.42));
      const weapon = primaryWeapon(killer, killer.organizationId === sides.tOrganizationId ? 'T' : 'CT');
      events.push({
        id: `${roundSeed}:shot:${victimIndex}`,
        type: 'shot',
        roundNumber: number,
        atMs: atMs - 80,
        nodeId: siteNodeId,
        playerId: killer.id,
        targetPlayerId: victim.id,
        weapon
      });
      events.push({
        id: `${roundSeed}:damage:opening:${victimIndex}`,
        type: 'damage',
        roundNumber: number,
        atMs: atMs - 120,
        nodeId: siteNodeId,
        sourcePlayerId: damageAssistant.id,
        targetPlayerId: victim.id,
        damage: openingDamage,
        weapon: primaryWeapon(damageAssistant, damageAssistant.organizationId === sides.tOrganizationId ? 'T' : 'CT')
      });
      events.push({
        id: `${roundSeed}:damage:lethal:${victimIndex}`,
        type: 'damage',
        roundNumber: number,
        atMs: atMs - 40,
        nodeId: siteNodeId,
        sourcePlayerId: killer.id,
        targetPlayerId: victim.id,
        damage: lethalDamage,
        weapon
      });
      events.push({
        id: `${roundSeed}:kill:${victimIndex}`,
        type: 'kill',
        roundNumber: number,
        atMs,
        nodeId: siteNodeId,
        killerPlayerId: killer.id,
        victimPlayerId: victim.id,
        weapon,
        ...(damageAssistant.id !== killer.id ? { assistantPlayerId: damageAssistant.id } : {}),
        ...(victimIndex === 1 && killers.length > 1 ? { flashAssistantPlayerId: killers[1].id } : {})
      });
    });

    const survivingWinner = winningPlayers.find((player) => !victims.some((victim) => victim.id === player.id));
    const pressureSource = losingPlayers[(number + 2) % Math.max(1, losingPlayers.length)];
    if (survivingWinner && pressureSource) {
      const pressureDamage = 13 + ((number * 9) % 37);
      events.push({
        id: `${roundSeed}:damage:pressure`,
        type: 'damage',
        roundNumber: number,
        atMs: Math.floor(durationMs * 0.24),
        nodeId: siteNodeId,
        sourcePlayerId: pressureSource.id,
        targetPlayerId: survivingWinner.id,
        damage: pressureDamage,
        weapon: primaryWeapon(pressureSource, pressureSource.organizationId === sides.tOrganizationId ? 'T' : 'CT')
      });
    }

    const planter = tPlayers[0];
    if (planter) {
      events.push({
        id: `${roundSeed}:plant`,
        type: 'plant',
        roundNumber: number,
        atMs: Math.floor(durationMs * 0.56),
        nodeId: siteNodeId,
        playerId: planter.id,
        siteNodeId
      });
    }
    const tWon = winnerOrganizationId === sides.tOrganizationId;
    if (tWon) {
      events.push({
        id: `${roundSeed}:explosion`,
        type: 'explosion',
        roundNumber: number,
        atMs: Math.floor(durationMs * 0.9),
        nodeId: siteNodeId,
        siteNodeId
      });
    } else {
      const defuser = ctPlayers[0];
      if (defuser) {
        events.push({
          id: `${roundSeed}:defuse`,
          type: 'defuse',
          roundNumber: number,
          atMs: Math.floor(durationMs * 0.86),
          nodeId: siteNodeId,
          playerId: defuser.id,
          siteNodeId
        });
      }
    }
    events.push({
      id: `${roundSeed}:round-end`,
      type: 'round-end',
      roundNumber: number,
      atMs: durationMs,
      nodeId: siteNodeId,
      winnerOrganizationId,
      reason: tWon ? 'explosion' : 'defuse'
    });

    return {
      number,
      durationMs,
      winnerOrganizationId,
      ...sides,
      tSplit,
      ctSetup: { ...ctSetup },
      executeAtMs,
      routes,
      loadouts,
      events: finalizeEvents(events)
    };
  });

  return {
    version: 1,
    id: `${series.id}:${mapIndex}`,
    seriesId: series.id,
    mapIndex,
    mapId: map.mapId,
    tickRate: 4,
    organizations: [
      { id: organizationId(series.teamA), name: series.teamA.name, style: series.teamA.style ?? 'balanced' },
      { id: organizationId(series.teamB), name: series.teamB.name, style: series.teamB.style ?? 'balanced' }
    ],
    players,
    result: {
      scoreA: map.scoreA,
      scoreB: map.scoreB,
      winnerOrganizationId: organizationId(map.winnerId === series.teamA.id ? series.teamA : series.teamB)
    },
    rounds
  };
}
