import { createSeededRng } from '../../simulation';
import type { LineupSlotRole, OrgStyle } from '../../types';
import type {
  GoldenSquadAssignment,
  GoldenPoint,
  GoldenStrategy,
  GoldenStrategyProfile,
  GoldenTacticalPlan
} from './types';

export const GOLDEN_STYLE_PROFILES = {
  balanced: {
    weights: { exec: 1, rush: 0.35, mid: 0.9, slow: 0.7, split: 0.8 },
    executeShiftSeconds: 0,
    reactiveFlashChance: 0.045,
    ctDomainMultiplier: 1
  },
  aggressive: {
    weights: { exec: 1.2, rush: 1.5, mid: 1.35, slow: 0.15, split: 0.55 },
    executeShiftSeconds: -6,
    reactiveFlashChance: 0.075,
    ctDomainMultiplier: 1.35
  },
  tactical: {
    weights: { exec: 1.3, rush: 0.1, mid: 1.05, slow: 1.4, split: 1.2 },
    executeShiftSeconds: 8,
    reactiveFlashChance: 0.055,
    ctDomainMultiplier: 1.6
  }
} as const satisfies Record<OrgStyle, GoldenStrategyProfile>;

type StrategyCategory = keyof GoldenStrategyProfile['weights'];

interface StrategyTemplate {
  kind: GoldenStrategy;
  site: 'A' | 'B';
  category: StrategyCategory;
  executeRange: readonly [number, number];
}

const STRATEGY_TEMPLATES: readonly StrategyTemplate[] = [
  { kind: 'A_exec', site: 'A', category: 'exec', executeRange: [12, 22] },
  { kind: 'B_exec', site: 'B', category: 'exec', executeRange: [13, 23] },
  { kind: 'A_rush', site: 'A', category: 'rush', executeRange: [3, 7] },
  { kind: 'B_rush', site: 'B', category: 'rush', executeRange: [3, 7] },
  { kind: 'mid_A', site: 'A', category: 'mid', executeRange: [18, 28] },
  { kind: 'mid_B', site: 'B', category: 'mid', executeRange: [18, 28] },
  { kind: 'A_slow', site: 'A', category: 'slow', executeRange: [24, 36] },
  { kind: 'B_slow', site: 'B', category: 'slow', executeRange: [24, 36] },
  { kind: 'A_split', site: 'A', category: 'split', executeRange: [18, 30] },
  { kind: 'B_split', site: 'B', category: 'split', executeRange: [18, 30] }
] as const;

const UTILITY_TARGETS = {
  A: {
    smokes: [{ x: 661, y: 300 }, { x: 696, y: 307 }, { x: 670, y: 220 }],
    flashes: [{ x: 760, y: 265 }, { x: 720, y: 335 }],
    molotovs: [{ x: 696, y: 307 }, { x: 670, y: 220 }]
  },
  B: {
    smokes: [{ x: 285, y: 540 }, { x: 315, y: 585 }, { x: 431, y: 540 }],
    flashes: [{ x: 250, y: 620 }, { x: 265, y: 540 }],
    molotovs: [{ x: 285, y: 540 }, { x: 232, y: 595 }]
  }
} as const;

function pickWeightedTemplate(
  profile: GoldenStrategyProfile,
  roll: number
): StrategyTemplate {
  const totalWeight = STRATEGY_TEMPLATES.reduce(
    (sum, template) => sum + profile.weights[template.category],
    0
  );
  let remaining = roll * totalWeight;

  for (const template of STRATEGY_TEMPLATES) {
    remaining -= profile.weights[template.category];
    if (remaining < 0) return template;
  }

  return STRATEGY_TEMPLATES[STRATEGY_TEMPLATES.length - 1];
}

export function selectGoldenStrategy(style: OrgStyle, seed: string): GoldenTacticalPlan {
  const rng = createSeededRng(seed);
  const profile = GOLDEN_STYLE_PROFILES[style];
  const template = pickWeightedTemplate(profile, rng());
  const [minimumSeconds, maximumSeconds] = template.executeRange;
  const baseExecuteAt = minimumSeconds + rng() * (maximumSeconds - minimumSeconds);
  const utility = UTILITY_TARGETS[template.site];
  const extraSmoke = template.site === 'A' ? { x: 733, y: 221 } : { x: 232, y: 595 };
  const extraFlash = template.site === 'A' ? { x: 705, y: 285 } : { x: 300, y: 570 };
  const smokeTargets: GoldenPoint[] = utility.smokes.map((point) => ({ ...point }));
  const flashTargets: GoldenPoint[] = utility.flashes.map((point) => ({ ...point }));
  const molotovTargets: GoldenPoint[] = utility.molotovs
    .slice(0, style === 'tactical' ? 2 : 1)
    .map((point) => ({ ...point }));
  if (style === 'tactical') smokeTargets.push(extraSmoke);
  if (style === 'tactical') flashTargets.push(extraFlash);
  if (style === 'aggressive') flashTargets.push(extraFlash, { x: 512, y: 500 });

  return {
    kind: template.kind,
    site: template.site,
    executeAtSeconds: Number(Math.max(1, baseExecuteAt + profile.executeShiftSeconds).toFixed(3)),
    smokeTargets,
    flashTargets,
    molotovTargets,
    coordinatedUtilityCount: smokeTargets.length + flashTargets.length + molotovTargets.length,
    profile
  };
}

export interface GoldenSquadPlayer {
  id: string;
  selectedRole: LineupSlotRole;
}

const STACK_ORDER: Record<GoldenSquadAssignment['responsibility'], number> = {
  ENTRY: 0,
  BANGER: 1,
  TRADER: 2,
  SECOND: 3,
  LURK: 4
};

const fixedResponsibility = (
  role: LineupSlotRole
): GoldenSquadAssignment['responsibility'] | null =>
  role === 'entry' ? 'ENTRY'
    : role === 'awper' ? 'SECOND'
      : role === 'lurker' ? 'LURK'
        : null;

export function assignGoldenSquadResponsibilities(
  players: readonly GoldenSquadPlayer[],
  strategy: GoldenTacticalPlan
): GoldenSquadAssignment[] {
  const assigned = new Map<string, GoldenSquadAssignment['responsibility']>();
  const used = new Set<GoldenSquadAssignment['responsibility']>();

  for (const player of players) {
    const responsibility = fixedResponsibility(player.selectedRole);
    if (!responsibility || used.has(responsibility)) continue;
    assigned.set(player.id, responsibility);
    used.add(responsibility);
  }

  const flexiblePlayers = players
    .filter((player) => !assigned.has(player.id))
    .sort((left, right) => {
      const priority: Record<LineupSlotRole, number> = {
        support: 0,
        igl: 1,
        rifler: 2,
        entry: 3,
        awper: 4,
        lurker: 5
      };
      return priority[left.selectedRole] - priority[right.selectedRole] || left.id.localeCompare(right.id);
    });
  const remainingResponsibilities = (['BANGER', 'TRADER', 'ENTRY', 'SECOND', 'LURK'] as const)
    .filter((responsibility) => !used.has(responsibility));

  flexiblePlayers.forEach((player, index) => {
    const responsibility = remainingResponsibilities[index];
    if (responsibility) assigned.set(player.id, responsibility);
  });

  return players.flatMap((player) => {
    const responsibility = assigned.get(player.id);
    if (!responsibility) return [];
    return [{
      playerId: player.id,
      responsibility,
      stackOrder: STACK_ORDER[responsibility],
      separateRoute: responsibility === 'LURK' && !strategy.kind.includes('rush')
    }];
  });
}
