// tests/normalRunGolden.test.ts
import { describe, expect, it } from 'vitest';
import { getTeamPlayers, players, teams } from '../src/lib/game/data';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { buildMajorRun } from '../src/lib/game/simulation';
import type { SelectedPlayer } from '../src/lib/game/types';

const roster = getTeamPlayers(teams[0]).slice(0, 5);
const lineup: SelectedPlayer[] = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
const selectedMaps = getDefaultMapSelection(roster, teams);

describe('run Normal (teste dourado)', () => {
  it('produz as mesmas séries, classificação e colocação para a mesma seed', () => {
    const run = buildMajorRun(roster, 'balanced', teams, players, 'dourado-normal-2026', lineup, { selectedMaps, mode: 'premier' });
    const digest = {
      placement: run.placement,
      champion: run.tournament?.championId,
      matches: run.matches.map((match) => [match.id, match.phase, match.scoreA, match.scoreB, match.winnerId]),
      standings: run.tournament?.standings.map((standing) => [standing.organizationId, standing.wins, standing.losses, standing.status]),
      // A run Normal nunca ganha estas chaves; se aparecerem, o protocolo online mudou sem querer.
      extraKeys: Object.keys(run).filter((key) => !['stage3', 'playoffs', 'matches', 'champion', 'placement', 'tournament'].includes(key)),
      roundKeys: Object.keys(run.tournament?.rounds[0] ?? {}).sort(),
      tournamentKeys: Object.keys(run.tournament ?? {}).sort()
    };
    expect(digest).toMatchSnapshot();
  });
});
