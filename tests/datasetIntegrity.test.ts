// tests/datasetIntegrity.test.ts
import { describe, expect, it } from 'vitest';
import { coaches, players, teams } from '../src/lib/game/data';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';

const ATTRIBUTES = ['overall', 'firepower', 'clutch', 'entry', 'awp', 'support', 'igl', 'experience', 'consistency', 'mental'] as const;
const RARITIES = new Set(['common', 'rare', 'elite', 'legend', 'superstar', 'goat']);
const TIERS = new Set(['underdog', 'dangerous-underdog', 'playoff-team', 'contender', 'finalist', 'champion', 'S', 'S+']);
const SLOTS = new Set(['awper', 'igl', 'entry', 'lurker', 'rifler', 'support']);
const COACH_ATTRIBUTES = ['tactics', 'discipline', 'aggression', 'development', 'overall'] as const;
const inRange = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const playerById = new Map(players.map((player) => [player.id, player]));
const teamById = new Map(teams.map((team) => [team.id, team]));

describe('integridade do dataset', () => {
  it('jogadores e times têm ids únicos', () => {
    expect(new Set(players.map((player) => player.id)).size).toBe(players.length);
    expect(new Set(teams.map((team) => team.id)).size).toBe(teams.length);
  });

  it('todo jogador tem atributos inteiros em 1..99, raridade e posições válidas', () => {
    const problems = players.flatMap((player) => [
      ...ATTRIBUTES.filter((key) => !inRange(player[key], 1, 99)).map((key) => `${player.id}.${key}=${player[key]}`),
      ...(RARITIES.has(player.rarity ?? '') ? [] : [`${player.id}.rarity=${player.rarity}`]),
      ...(player.baseId && player.nickname ? [] : [`${player.id} sem baseId ou nickname`]),
      ...getEligibleSlotRoles(player).filter((role) => !SLOTS.has(role)).map((role) => `${player.id} posição ${role}`)
    ]);
    expect(problems).toEqual([]);
  });

  it('todo jogador pertence ao próprio time, no mesmo ano', () => {
    const problems = players.flatMap((player) => {
      const team = player.teamId ? teamById.get(player.teamId) : undefined;
      if (!team) return [`${player.id} sem time ${player.teamId}`];
      return [
        ...(team.year === player.year ? [] : [`${player.id} ano ${player.year} ≠ time ${team.year}`]),
        ...((team.players ?? []).includes(player.id) ? [] : [`${player.id} fora da lista de ${team.id}`])
      ];
    });
    expect(problems).toEqual([]);
  });

  it('todo time tem 5 jogadores existentes e distintos, tier e estatísticas válidos', () => {
    const problems = teams.flatMap((team) => {
      const roster = team.players ?? [];
      const baseIds = new Set(roster.map((id) => playerById.get(id)?.baseId));
      return [
        ...(roster.length === 5 ? [] : [`${team.id} com ${roster.length} jogadores`]),
        ...roster.filter((id) => !playerById.has(id)).map((id) => `${team.id} → ${id} inexistente`),
        ...(baseIds.size === roster.length ? [] : [`${team.id} com jogador repetido`]),
        ...(TIERS.has(team.tier ?? '') ? [] : [`${team.id}.tier=${team.tier}`]),
        ...Object.entries(team.teamStats ?? {}).filter(([, value]) => !inRange(value, 1, 99)).map(([key, value]) => `${team.id}.teamStats.${key}=${value}`)
      ];
    });
    expect(problems).toEqual([]);
  });

  it('todo time tem exatamente um coach com atributos em 40..99', () => {
    expect(coaches).toHaveLength(teams.length);
    expect(new Set(coaches.map((coach) => coach.teamId)).size).toBe(teams.length);
    const problems = coaches.flatMap((coach) => [
      ...(teamById.has(coach.teamId) ? [] : [`${coach.id} → time inexistente`]),
      ...(coach.id === `coach-${coach.teamId}` ? [] : [`${coach.id} id fora do padrão`]),
      ...COACH_ATTRIBUTES.filter((key) => !inRange(coach[key], 40, 99)).map((key) => `${coach.id}.${key}=${coach[key]}`),
      ...(coach.overall === Math.round((coach.tactics + coach.discipline + coach.aggression + coach.development) / 4) ? [] : [`${coach.id} overall incoerente`]),
      ...(coach.year === teamById.get(coach.teamId)?.year ? [] : [`${coach.id} ano ≠ time`]),
      ...((coach.confidence === 'low' || coach.confidence === 'placeholder') && !coach.needsReview ? [`${coach.id} sem needsReview`] : [])
    ]);
    expect(problems).toEqual([]);
  });

  it('o sorteio de coaches tem pessoas reais suficientes', () => {
    const draftable = coaches.filter((coach) => coach.confidence !== 'placeholder');
    expect(draftable.length).toBeGreaterThanOrEqual(270);
    expect(new Set(draftable.map((coach) => coach.baseId)).size).toBeGreaterThanOrEqual(80);
    expect(draftable.filter((coach) => coach.overall >= 80).length).toBeGreaterThanOrEqual(20);
  });
});
