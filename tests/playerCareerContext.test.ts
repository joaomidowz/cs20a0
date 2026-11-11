// tests/playerCareerContext.test.ts
// O que a tela afirma tem que ser verdade: a situação do round bate com o placar, a sequência e o dinheiro, e o
// acontecimento bate com o resultado real do campeonato (quem foi campeão não "perde a final após abrir 12 a 4").
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, seatToTake, startSeason, type PlayerCareerState, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { drawClutchSituation, situationFits, situationsFor, type RoundContext } from '../src/lib/game/playerCareer/decisions';
import { HAPPENING_BY_ID, resolveHappening, rollHappening } from '../src/lib/game/playerCareer/happenings';

const winning: RoundContext = { round: 7, us: 5, them: 1, winStreak: 3, lossStreak: 0, lastWon: true, money: 5370, theirMoney: 1500 };

describe('situação do round com o placar real', () => {
  it('ganhando de 5 a 1 com dinheiro, nunca cai "perderam três rounds", eco nosso, pistol ou último round do half', () => {
    const banned = /perde(ram|u) (três|3) rounds|perdeu o pistol|pistol round|último round do half|cinco rounds atrás|eco round|está no eco|dinheiro curto|sem dinheiro|12 a 12|prorrogação/i;
    for (const role of ['awper', 'igl', 'entry', 'lurker', 'support'] as const) {
      for (let index = 0; index < 120; index += 1) {
        expect(drawClutchSituation(role, `ctx-${role}-${index}`, [], null, winning).text).not.toMatch(banned);
      }
    }
  });

  it('as regras liberam quando o momento é verdade', () => {
    const lossStreak = situationsFor('igl').find((situation) => /Perderam três rounds/.test(situation.text))!;
    expect(situationFits(lossStreak, winning)).toBe(false);
    expect(situationFits(lossStreak, { ...winning, us: 2, them: 5, winStreak: 0, lossStreak: 3, lastWon: false })).toBe(true);
    const half = situationsFor('igl').find((situation) => /Último round do half/.test(situation.text))!;
    expect(situationFits(half, { ...winning, round: 12 })).toBe(true);
    expect(situationFits(half, winning)).toBe(false);
    // Sem contexto (save antigo), situação com regra não cai; a neutra sempre pode.
    expect(situationFits(lossStreak, null)).toBe(false);
    expect(situationFits({ text: 'Time conseguiu primeira kill' }, null)).toBe(true);
  });
});

const at = (seed: string): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'rifler', seed });
  const org = sceneOrgs.find((candidate) => candidate.level === 0)!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [], fame: 200000 });
};

const result = (placement: string, tier: TournamentResult['tier'] = 'S'): TournamentResult => ({
  name: 'Teste', placement, tier, rating: 1.2, wins: 5, losses: placement === 'Campeão' ? 0 : 1, seriesWins: 3, seriesLosses: placement === 'Campeão' ? 0 : 1,
  opponents: [{ team: 'A', won: true, phase: 'quarterfinal' }, { team: 'B', won: true, phase: 'semifinal' }, { team: 'C', won: placement === 'Campeão', phase: 'final' }]
} as TournamentResult);

describe('acontecimento com o resultado real', () => {
  const rolled = (placement: string, tier: TournamentResult['tier'] = 'S') => {
    const ids = new Set<string>();
    for (let index = 0; index < 400; index += 1) {
      const state = rollHappening(at(`hap-${index}`), 'post', { eventIndex: 0, result: result(placement, tier) });
      if (state.pendingHappening) ids.add(state.pendingHappening.id);
    }
    return ids;
  };

  it('campeão nunca recebe "perde a final", "0 a 2 no suíço" ou "eliminação em semifinal"', () => {
    const ids = rolled('Campeão');
    for (const id of ['EV140', 'EV108', 'EV116', 'EV107', 'EV014']) expect(ids.has(id), HAPPENING_BY_ID.get(id)?.situation).toBe(false);
  });

  it('antes do jogo nunca afirma final, semifinal ou 0 a 2 do campeonato que nem começou', () => {
    for (let index = 0; index < 400; index += 1) {
      const state = rollHappening(at(`pre-${index}`), 'pre', { eventIndex: 0 });
      expect(['EV015', 'EV054', 'EV060', 'EV108', 'EV120', 'EV129', 'EV141', 'EV150']).not.toContain(state.pendingHappening?.id);
    }
  });
});

describe('escolhas que mexem no calendário e no time', () => {
  const choose = (state: PlayerCareerState, id: string, choice: number, trigger: 'pre' | 'post' | 'between' = 'between') =>
    resolveHappening({ ...state, pendingHappening: { id, trigger, eventIndex: 0 } }, choice);

  it('"Programar férias" tira um campeonato de verdade (Folga, sem prêmio) e o cansaço cai', () => {
    const state = { ...at('cal-1'), fatigue: 60 };
    const before = state.calendar!.filter((entry) => entry.status === 'UPCOMING').length;
    const { state: after, line } = choose(state, 'EV123', 0, 'pre');
    expect(after.calendar!.filter((entry) => entry.status === 'UPCOMING').length).toBe(before - 1);
    const skipped = after.calendar!.find((entry) => entry.result?.placement === 'Folga')!;
    expect(skipped.result!.skipped).toBe(true);
    expect(skipped.tier).not.toBe('Major');
    expect(after.fatigue).toBeLessThan(60);
    expect(line).toContain('abriu mão');
  });

  it('"Aceitar todos os eventos" põe mais um campeonato no calendário', () => {
    const state = at('cal-2');
    const { state: after, line } = choose(state, 'EV136', 1);
    expect(after.calendar!.length).toBe(state.calendar!.length + 1);
    expect(after.calendar!.at(-1)!.status).toBe('UPCOMING');
    expect(line).toContain('Entrou no calendário');
  });

  it('"Aceitar verbalmente" a proposta de time maior abre a tela de mercado com oferta de cima', () => {
    const base = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'rifler', seed: 'cal-3' });
    const org = sceneOrgs.find((candidate) => candidate.level === 2 && candidate.region === 'sa')!;
    const state = startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
    const { state: after } = choose(state, 'EV067', 1);
    expect(after.pendingMove?.kind).toBe('poach');
    expect(after.pendingMove!.offers.length).toBeGreaterThan(0);
  });
});

describe('o seu time na mesma régua dos rivais', () => {
  it('a força do seu time no motor é a mesma conta de um time da cena com os mesmos jogadores', async () => {
    const { calculateHistoricalTeamPower } = await import('../src/lib/game/simulation');
    const { sceneOrgToEngineTeam, startSceneEvent } = await import('../src/lib/game/playerCareer/live');
    const furia = sceneOrgs.find((org) => org.name === 'FURIA')!;
    const base = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'awper', seed: 'fair-1' });
    const state = startSeason({ ...base, orgId: furia.id, pendingDraw: null, drawDone: true, seatsTaken: [], overall: 85, truePotential: 85 });
    const index = state.calendar!.findIndex((entry) => entry.format !== 'major');
    const { campaign, userPlayers } = startSceneEvent(state, index);
    const expected = calculateHistoricalTeamPower(sceneOrgToEngineTeam({ ...furia, id: campaign.userTeamId, name: furia.name }, userPlayers), userPlayers).power;
    // Mesma conta dos rivais, mais a forma do campeonato (± EVENT_FORM_SWING, igual para todo mundo).
    const { EVENT_FORM_SWING } = await import('../src/lib/game/playerCareer/live');
    expect(Math.abs(campaign.engine.byId.get(campaign.userTeamId)!.team.power - expected)).toBeLessThanOrEqual(EVENT_FORM_SWING);
    expect(campaign.engine.byId.get(campaign.userTeamId)!.team.style).toBeUndefined();
  });
});

describe('escolha que muda a sua função', () => {
  it('aceitar a proposta de IGL te põe de IGL, e o elenco segue com as 5 funções sem repetir (mesmo com 2 trocas)', async () => {
    const { matesOf } = await import('../src/lib/game/playerCareer/squad');
    const base = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'awper', seed: 'role-1' });
    const org = sceneOrgs.find((candidate) => candidate.name === 'FURIA')!;
    // A vaga que você tomou fica registrada, como no jogo (é ela que diz quem saiu do time).
    const state = startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [{ ...seatToTake(org, 'awper'), season: 1 }] });
    const roles = (career: PlayerCareerState) => [career.role, ...matesOf(career).map((mate) => mate.player.role)].sort();
    const five = ['awper', 'entry', 'igl', 'lurker', 'support'];
    expect(roles(state)).toEqual(five);
    // A proposta de virar IGL (roleOffers.ts): você nas calls e o IGL de antes vai para a sua função.
    const igl = matesOf(state).find((mate) => mate.player.role === 'igl')!.player.nickname!;
    const offer = { role: 'igl' as const, motive: 'veterano' as const, mateNick: igl, text: 'O coach quer você nas calls.' };
    const { state: captain, chips } = resolveHappening({ ...state, pendingHappening: { id: 'FUNCAO', trigger: 'post', eventIndex: 0, offer } }, 0);
    expect(captain.role).toBe('igl');
    expect(chips.some((chip) => chip.label === 'Função')).toBe(true);
    expect(roles(captain)).toEqual(five);
    // A troca pedida pelo time não gasta a sua: ainda dá para trocar de novo, e o elenco continua fechado.
    const { state: again } = resolveHappening({ ...captain, pendingHappening: { id: 'EV111', trigger: 'pre', eventIndex: 0 } }, 2);
    expect(again.role).not.toBe('igl');
    expect(roles(again)).toEqual(five);
  });
});
