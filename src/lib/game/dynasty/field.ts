import type { TournamentOrganization } from '../online/tournament-engine';
import { calculateHistoricalTeamPower, createSeededRng, type SeededRng } from '../simulation';
import { MAJOR_STAGES, type HistoricalTeam, type MajorStage, type Player } from '../types';

/** Dataset tiers that feed each Swiss stage (Stage 1 is also the fallback for unknown tiers). */
export const STAGE_TIERS: Readonly<Record<MajorStage, readonly string[]>> = {
  stage1: ['underdog', 'dangerous-underdog'],
  stage2: ['playoff-team', 'contender'],
  stage3: ['finalist', 'champion', 'S', 'S+']
};

/** Organizations that join at each stage: 16 open Stage 1, 8 newcomers join the 8 qualified in Stages 2 and 3. */
export const STAGE_SIZE: Readonly<Record<MajorStage, number>> = { stage1: 16, stage2: 8, stage3: 8 };

/** Odds that a team from the pool one step up takes a slot in a weaker stage: one slot, then a second one. */
export const FALLEN_GIANT_ODDS = [0.5, 0.2] as const;

export interface DynastyStageFields {
  stage1: TournamentOrganization[];
  stage2: TournamentOrganization[];
  stage3: TournamentOrganization[];
}

export const stageOfTier = (tier: string | null | undefined): MajorStage => {
  for (const stage of MAJOR_STAGES) if (tier && STAGE_TIERS[stage].includes(tier)) return stage;
  return 'stage1';
};

const toOrganization = (team: HistoricalTeam, allPlayers: Player[]): TournamentOrganization => {
  const combat = calculateHistoricalTeamPower(team, allPlayers);
  return { id: team.id, name: combat.name, seed: 0, team: combat, human: false, sourceTeamId: team.id };
};

/** Removes and returns one random team of the pool (null when it is empty). Always consumes one rng draw when the pool is not empty. */
const draw = (pool: HistoricalTeam[], rng: SeededRng): HistoricalTeam | null => {
  if (!pool.length) return null;
  const index = Math.floor(rng() * pool.length);
  return pool.splice(index, 1)[0];
};

export function buildDynastyStageFields(options: {
  teams: HistoricalTeam[];
  allPlayers: Player[];
  user: TournamentOrganization;
  entryStage: MajorStage;
  seed: string;
}): DynastyStageFields {
  const rng = createSeededRng(`${options.seed}:dynasty-field`);
  const pools: Record<MajorStage, HistoricalTeam[]> = { stage1: [], stage2: [], stage3: [] };
  for (const team of options.teams) pools[stageOfTier(team.tier)].push(team);
  const fields: DynastyStageFields = { stage1: [], stage2: [], stage3: [] };
  for (const [index, stage] of MAJOR_STAGES.entries()) {
    const field = fields[stage];
    if (stage === options.entryStage) field.push(options.user);
    const stronger = MAJOR_STAGES[index + 1];
    const upper = stronger ? pools[stronger] : null;
    // Giants fall one step at most: a Stage 3 team can open in Stage 2, a Stage 2 team in Stage 1.
    if (upper) {
      for (const odds of FALLEN_GIANT_ODDS) {
        if (rng() >= odds) continue;
        const giant = draw(upper, rng);
        if (giant) field.push(toOrganization(giant, options.allPlayers));
      }
    }
    const weaker = MAJOR_STAGES[index - 1];
    while (field.length < STAGE_SIZE[stage]) {
      const team = draw(pools[stage], rng) ?? (upper ? draw(upper, rng) : null) ?? (weaker ? draw(pools[weaker], rng) : null);
      if (!team) throw new Error(`Not enough teams to fill ${stage}`);
      field.push(toOrganization(team, options.allPlayers));
    }
  }
  return fields;
}
