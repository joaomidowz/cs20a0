// tests/playerCareer.test.ts
// Contrato do modo Carreira de Jogador (RPG): sorteio inicial (3 orgs reais CCT/GC + Lan House), vaga pela
// função, temporada camp a camp no MOTOR DE MAJOR do jogo (série a série, round a round), pausa de clutch nos
// momentos decisivos (o bot não decide por você no close), aging calibrado, mercado e veredito.
import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES, ROLE_META, chooseStartingOrg, createPlayerCareer, drawStartingOptions, ensureDraw, eventsFor, finishSeason,
  marketValueUsd, orgOf, recordEventResult, retire, seatToTake, startSeason, stayAtOrg, acceptOffer,
  type PlayerCareerState
} from '../src/lib/game/playerCareer/engine';
import { playClutchRound, runSceneEvent, startSceneEvent, stepSceneEvent } from '../src/lib/game/playerCareer/live';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';

const PLACEMENT_LABELS = ['Quartas', 'Semis', 'Vice', 'Campeão'];

function careerAtRealOrg(seed: string, role: Parameters<typeof seatToTake>[1] = 'awper'): PlayerCareerState {
  let career = createPlayerCareer({ nick: 'tester', country: 'Brazil', role, seed });
  const option = career.pendingDraw!.find((candidate) => candidate.kind === 'real')!;
  return chooseStartingOrg(career, option.orgId);
}

describe('sorteio inicial', () => {
  it('nasce na banda do arquétipo (padrão Prodígio) e cada arquétipo tem idade própria de entrada', () => {
    const career = createPlayerCareer({ nick: 'cascavel', country: 'Brazil', role: 'awper', seed: 't1' });
    expect(career.archetype).toBe('prodigio');
    expect(career.age).toBeGreaterThanOrEqual(ARCHETYPES.prodigio.entryAge[0]);
    expect(career.age).toBeLessThanOrEqual(ARCHETYPES.prodigio.entryAge[1]);
    expect(career.overall).toBeGreaterThanOrEqual(ARCHETYPES.prodigio.startOverall[0]);
    expect(career.overall).toBeLessThanOrEqual(ARCHETYPES.prodigio.startOverall[1]);
    expect(career.truePotential).toBeLessThanOrEqual(ARCHETYPES.prodigio.potential[1]);
    const tardio = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'igl', archetype: 'tardio', seed: 't2' });
    expect(tardio.age).toBeGreaterThanOrEqual(ARCHETYPES.tardio.entryAge[0]);
    expect(tardio.overall).toBeGreaterThanOrEqual(ARCHETYPES.tardio.startOverall[0]);
  });

  it('sorteia 3 orgs reais do nível 4 (país primeiro) + a opção Lan House', () => {
    const options = drawStartingOptions('seed-draw', 'Brazil', 'support');
    expect(options).toHaveLength(4);
    const reals = options.filter((option) => option.kind === 'real');
    expect(reals).toHaveLength(3);
    for (const option of reals) {
      expect(option.level).toBe(4);
      expect(sceneOrgs.some((org) => org.id === option.orgId)).toBe(true);
      expect(option.seat).not.toBeNull();
    }
    expect(options[3].kind).toBe('lan-house');
  });

  it('vaga é da SUA função quando o elenco tem a função marcada', () => {
    const org = sceneOrgs.find((candidate) => candidate.level === 4 && candidate.roster.some((member) => member.roles.some((listed) => ['awp', 'awper', 'sniper'].includes(listed.toLowerCase()))));
    if (org) {
      const seat = seatToTake(org, 'awper');
      expect(org.roster.some((member) => member.nick === seat.nick && member.roles.length > 0)).toBe(true);
    }
  });

  it('saves antigos sem sorteio voltam a ele antes da primeira temporada', () => {
    const legacy = { ...createPlayerCareer({ nick: 'old', country: 'Brazil', role: 'entry', seed: 'old1' }), pendingDraw: null } as PlayerCareerState;
    expect(ensureDraw(legacy).pendingDraw?.length).toBe(4);
  });

  it('reload no meio da primeira temporada NÃO reabre o sorteio (assinado, na lan house ou com evento aberto)', () => {
    const signed = careerAtRealOrg('reload1');
    expect(ensureDraw(signed).pendingDraw).toBeNull();
    expect(ensureDraw(startSeason(signed)).pendingDraw).toBeNull();
    const fresh = createPlayerCareer({ nick: 'lh', country: 'Brazil', role: 'rifler', seed: 'reload2' });
    const lanHouse = fresh.pendingDraw!.find((option) => option.kind === 'lan-house')!;
    expect(ensureDraw(chooseStartingOrg(fresh, lanHouse.orgId)).pendingDraw).toBeNull();
    // Save poluído pelo bug antigo (sorteio reaberto com temporada em andamento) é curado no load.
    const polluted = { ...startSeason(careerAtRealOrg('reload3')), pendingDraw: drawStartingOptions('reload3', 'Brazil', 'awper') };
    expect(ensureDraw(polluted).pendingDraw).toBeNull();
    expect(ensureDraw(polluted).calendar?.length).toBe(polluted.calendar?.length);
  });
});

describe('temporada camp a camp (motor de Major)', () => {
  it('calendário abre com a densidade real do nível e vai de campeonato em campeonato', () => {
    const career = startSeason(careerAtRealOrg('cal2'));
    expect(career.calendar).not.toBeNull();
    expect(career.calendar!.length).toBeGreaterThanOrEqual(7);
    expect(career.calendar!.length).toBeLessThanOrEqual(9);
    expect(career.calendar!.every((entry) => entry.status === 'UPCOMING')).toBe(true);
  });

  it('um campeonato roda inteiro no motor: 8 na chave, séries BO3, colocação e rating do kill feed', () => {
    let career = startSeason(careerAtRealOrg('evt1'));
    const field = startSceneEvent(career, 0);
    let campaign = field.campaign;
    expect(campaign.engine.rounds.length).toBeGreaterThan(0);
    for (let guard = 0; guard < 500 && !campaign.finished; guard += 1) {
      const step = stepSceneEvent(campaign);
      campaign = step.campaign;
    }
    expect(campaign.finished).toBe(true);
    expect(PLACEMENT_LABELS.length + 1).toBe(5); // quartas/semis/vice/campeão + estreia-legado: rótulo do placement vem do run
    career = recordEventResult(career, 0, { name: career.calendar![0].name, placement: 'Quartas', rating: 1.02, seriesWins: 0, seriesLosses: 1 });
    expect(career.calendar![0].status).toBe('PLAYED');
    expect(career.calendar![0].result?.placement).toBe('Quartas');
  });

  it('é determinístico: mesmo evento, mesma seed → mesma campanha completa', () => {
    const career = startSeason(careerAtRealOrg('det2'));
    const run = () => {
      const field = startSceneEvent(career, 1);
      let campaign = field.campaign;
      for (let guard = 0; guard < 500 && !campaign.finished; guard += 1) {
        const step = stepSceneEvent(campaign);
        campaign = step.campaign;
      }
      return { champion: campaign.run.champion, placement: campaign.run.placement, matches: campaign.run.matches.length };
    };
    expect(run()).toEqual(run());
  });
});

describe('clutch no close (matriz de decisões)', () => {
  it('runSceneEvent: o campeonato CORRE sozinho, para no round decisivo com a situação da sua função e o RNG joga o round', () => {
    const career = startSeason(careerAtRealOrg('autorun1'));
    let campaign = startSceneEvent(career, 0).campaign;
    const ctx = { role: career.role, seed: career.seed, usedSituationIds: [] as string[] };
    let pauses = 0;
    let ranRounds = 0;
    for (let guard = 0; guard < 60 && !campaign.finished; guard += 1) {
      const result = runSceneEvent(campaign, ctx);
      campaign = result.campaign;
      ranRounds += result.roundsPlayed;
      if (result.clutch) {
        pauses += 1;
        const outcome = playClutchRound(campaign, result.clutch, { choice: 1, playerOverall: career.overall, matesOverall: 70, opponentOverall: 70 });
        campaign = outcome.campaign;
        expect(typeof outcome.won).toBe('boolean');
        ctx.usedSituationIds.push(result.clutch.situation.id);
      }
    }
    expect(campaign.finished).toBe(true); // chegou ao fim só com as pausas de decisão no caminho
    expect(pauses).toBeGreaterThanOrEqual(1);
    expect(ranRounds).toBeGreaterThan(0); // correu rounds de verdade, não um por clique
  });
});

describe('fechamento de temporada, mercado e veredito', () => {
  it('finishSeason só fecha com todo o calendário jogado; aplica aging e abre mercado', () => {
    let career = startSeason(careerAtRealOrg('fin1'));
    const stuck = finishSeason(career);
    expect(stuck).toBe(career); // calendário incompleto: não fecha.
    const entries = career.calendar!;
    let index = 0;
    for (const entry of entries) {
      career = recordEventResult(career, index, { name: entry.name, placement: 'Quartas', rating: 0.92, seriesWins: 0, seriesLosses: 1 });
      index += 1;
    }
    const done = finishSeason(career);
    expect(done.calendar).toBeNull();
    expect(done.seasonNumber).toBe(career.seasonNumber + 1);
    expect(done.history.at(-1)?.tournaments.length).toBe(entries.length);
    expect(done.age).toBe(career.age + 1);
  });

  it('veredito fecha a carreira com as contas certas', () => {
    let career = careerAtRealOrg('ver1');
    for (let season = 0; season < 3; season += 1) {
      career = startSeason(career);
      for (const entry of career.calendar!) career = recordEventResult(career, entry.index, { name: entry.name, placement: 'Semis', rating: 1.0, seriesWins: 1, seriesLosses: 1 });
      career = stayAtOrg(finishSeason(career));
    }
    const done = retire(career);
    expect(done.status).toBe('RETIRED');
    expect(done.verdict?.seasons).toBe(3);
    expect(retire(done)).toBe(done);
  });

  it('oferta aceita muda de org e registra a vaga pela função', () => {
    let career = careerAtRealOrg('off1');
    for (let season = 0; season < 8 && !career.pendingOffers?.length; season += 1) {
      career = startSeason(career);
      for (const entry of career.calendar!) career = recordEventResult(career, entry.index, { name: entry.name, placement: 'Campeão', rating: 1.1, seriesWins: 3, seriesLosses: 0 });
      career = finishSeason(career);
      if (!career.pendingOffers?.length) career = stayAtOrg(career);
    }
    expect(career.pendingOffers?.length).toBeGreaterThan(0);
    const offer = career.pendingOffers![0];
    const accepted = acceptOffer(career, offer.orgId);
    expect(accepted.orgId).toBe(offer.orgId);
    expect(accepted.seatsTaken.length).toBeGreaterThan(career.seatsTaken.length);
  });

  it('valor de mercado segue a fórmula de valuation do jogo', () => {
    expect(marketValueUsd(60)).toBe(50_000);
    expect(marketValueUsd(40)).toBe(30_000);
    expect(orgOf('lan-house').level).toBe(5);
  });
});
