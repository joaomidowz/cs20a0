import type {
  GoldenGrenade,
  GoldenPlayerState,
  GoldenRoundReplayV1,
  GoldenWeapon
} from '../../src/lib/game/replay/golden/types';
import { createReplayPlan } from '../../src/lib/game/replay/plan';
import type { CombatTeam, SeriesResult } from '../../src/lib/game/types';

type GoldenPlayerOverrides = Partial<Omit<GoldenPlayerState, 'inventory'>> & {
  primary?: GoldenWeapon;
  secondary?: GoldenWeapon;
  grenades?: Partial<Record<GoldenGrenade, number>>;
};

export function goldenPlayer(overrides: GoldenPlayerOverrides = {}): GoldenPlayerState {
  const side = overrides.side ?? 'T';
  return {
    id: overrides.id ?? 'player',
    organizationId: overrides.organizationId ?? 'alpha',
    side,
    selectedRole: overrides.selectedRole ?? 'rifler',
    style: overrides.style ?? 'balanced',
    money: overrides.money ?? 800,
    inventory: {
      primary: overrides.primary ?? (side === 'CT' ? 'usp' : 'glock'),
      secondary: overrides.secondary ?? (side === 'CT' ? 'usp' : 'glock'),
      armor: 0,
      helmet: false,
      kit: false,
      grenades: {
        he: overrides.grenades?.he ?? 0,
        flash: overrides.grenades?.flash ?? 0,
        smoke: overrides.grenades?.smoke ?? 0,
        molotov: overrides.grenades?.molotov ?? 0
      }
    },
    x: overrides.x ?? 677,
    y: overrides.y ?? 960,
    angle: overrides.angle ?? 0,
    hp: overrides.hp ?? 100,
    alive: overrides.alive ?? true
  };
}

const roles = ['awper', 'igl', 'entry', 'lurker', 'support'] as const;

function combatTeam(id: string, style: 'aggressive' | 'balanced' | 'tactical'): CombatTeam {
  return {
    id,
    organizationId: id,
    name: id.toUpperCase(),
    power: 86,
    mental: 84,
    clutch: 83,
    experience: 85,
    style,
    lineup: roles.map((selectedSlotRole, index) => ({
      playerId: `${id}-player-${index + 1}`,
      selectedSlotRole
    }))
  };
}

export function createGoldenReplayPlanFixture(options: { winners?: string[] } = {}) {
  const winners = options.winners ?? ['alpha'];
  let scoreA = 0;
  let scoreB = 0;
  const rounds = winners.map((winner) => {
    if (winner === 'alpha') scoreA += 1;
    else scoreB += 1;
    return { a: scoreA, b: scoreB, overtime: false };
  });
  const series: SeriesResult = {
    id: 'golden-mirage-series',
    phase: 'stage3',
    bestOf: 1,
    teamA: combatTeam('alpha', 'aggressive'),
    teamB: combatTeam('beta', 'tactical'),
    scoreA: scoreA >= scoreB ? 1 : 0,
    scoreB: scoreB > scoreA ? 1 : 0,
    maps: [{
      map: 1,
      mapId: 'mirage',
      scoreA,
      scoreB,
      winnerId: scoreA >= scoreB ? 'alpha' : 'beta',
      rounds,
      overtime: false
    }],
    winnerId: scoreA >= scoreB ? 'alpha' : 'beta',
    userMatch: true
  };
  return createReplayPlan(series, 0);
}

export function goldenRoundReplay(): GoldenRoundReplayV1 {
  return {
    number: 1,
    tickRate: 32,
    frameStrideTicks: 2,
    playerIds: ['alpha-player-1'],
    sides: ['T'],
    frames: 2,
    snapshots: Float32Array.from([
      100, 200, Math.PI - 0.1, 100, 1, 0, 0,
      200, 300, -Math.PI + 0.1, 50, 1, 0, 0
    ]),
    shots: new Float32Array(),
    events: [],
    winnerOrganizationId: 'alpha',
    durationMs: 125,
    roleMetrics: {
      entryFirstChokeCrossing: true,
      lurkerSeparateUntilMs: 9_000,
      awperAwpShare: 1
    }
  };
}
