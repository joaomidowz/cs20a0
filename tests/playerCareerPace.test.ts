// tests/playerCareerPace.test.ts
// Ritmo da temporada: simular um campeonato sem tela, avançar até a final ("só as finais") e o caminho na chave.
import { describe, expect, it } from 'vitest';
import { chooseStartingOrg, createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { advanceToFinal, finishSceneEvent, sceneEventResult, simulateSceneEvent, startSceneEvent, userBracketPath } from '../src/lib/game/playerCareer/live';
import { currentCampaignSeries } from '../src/lib/game/campaign-major';

const PLACEMENTS = ['Quartas', 'Semis', 'Vice', 'Campeão'];

function seasonAt(seed: string): PlayerCareerState {
  const career = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'entry', seed });
  return startSeason(chooseStartingOrg(career, career.pendingDraw!.find((option) => option.kind === 'real')!.orgId));
}

describe('simular um campeonato', () => {
  it('fecha com colocação válida, rating e W-L, e é determinístico', () => {
    const career = seasonAt('pace-sim');
    const first = simulateSceneEvent(career, 0);
    expect(first.campaign.finished).toBe(true);
    expect(PLACEMENTS).toContain(first.result.placement);
    expect(first.result.rating).toBeGreaterThan(0);
    expect(first.result.seriesWins + first.result.seriesLosses).toBeGreaterThanOrEqual(1);
    expect(first.result.seriesLosses).toBeLessThanOrEqual(1);
    expect(simulateSceneEvent(career, 0).result).toEqual(first.result);
  });

  it('campeão ganha 3 séries; quem cai perde exatamente uma', () => {
    for (const seed of ['pace-a', 'pace-b', 'pace-c', 'pace-d']) {
      const { result } = simulateSceneEvent(seasonAt(seed), 1);
      if (result.placement === 'Campeão') expect(result).toMatchObject({ seriesWins: 3, seriesLosses: 0 });
      else expect(result.seriesLosses).toBe(1);
    }
  });
});

describe('só as finais', () => {
  it('para no começo da sua final ou termina se você caiu antes', () => {
    let sawFinal = false;
    for (const seed of ['fin-a', 'fin-b', 'fin-c', 'fin-d', 'fin-e', 'fin-f']) {
      const career = seasonAt(seed);
      const campaign = advanceToFinal(startSceneEvent(career, 0).campaign);
      if (campaign.finished) {
        expect(['Quartas', 'Semis']).toContain(sceneEventResult(career, 0, campaign).result.placement);
        continue;
      }
      sawFinal = true;
      const live = currentCampaignSeries(campaign)!;
      expect(live.config.phase).toBe('final');
      expect(live.maps.length).toBe(0);
      const done = finishSceneEvent(campaign);
      expect(['Vice', 'Campeão']).toContain(sceneEventResult(career, 0, done).result.placement);
    }
    expect(sawFinal).toBe(true);
  });
});

describe('onde estou na chave', () => {
  it('o caminho bate com o resultado final', () => {
    const career = seasonAt('path-1');
    const { campaign, result } = simulateSceneEvent(career, 2);
    const path = userBracketPath(campaign);
    expect(path.map((step) => step.stage)).toEqual(['quarterfinal', 'semifinal', 'final']);
    const won = path.filter((step) => step.status === 'won').length;
    expect(won).toBe(result.seriesWins);
    expect(path.filter((step) => step.status === 'lost').length).toBe(result.seriesLosses);
    for (const step of path.filter((entry) => entry.status === 'won' || entry.status === 'lost')) {
      expect(step.opponent).toBeTruthy();
      expect(step.score).toMatch(/^\d-\d$/);
    }
  });

  it('no começo, as quartas estão ao vivo', () => {
    const campaign = startSceneEvent(seasonAt('path-2'), 0).campaign;
    expect(userBracketPath(campaign)[0].status).toBe('live');
  });
});
