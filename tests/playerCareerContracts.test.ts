// tests/playerCareerContracts.test.ts
// Contrato do seu jogador: toda assinatura tem duração, salário e multa; sob contrato o fim da temporada não abre o
// mercado (só quem paga a multa, ou o time te vende numa temporada fraca); no último ano o time renova ou você fica
// livre; o salário cai no caixa; saves antigos começam com o contrato acabando no fim da temporada atual.
import { describe, expect, it } from 'vitest';
import {
  acceptMove, acceptOffer, chooseStartingOrg, createPlayerCareer, decentRatingFor, finishSeason, goToLanHouse, marketValueUsd, midSeasonCheck,
  orgOf, recordEventResult, startSeason, starRatingFor, stayAtOrg, type PlayerCareerState
} from '../src/lib/game/playerCareer/engine';
import { buyoutFor, CONTRACT_MAX_YEARS, contractYears, monthlySalary, RENEW_MARGIN } from '../src/lib/game/playerCareer/contracts';
import { ensureSquad } from '../src/lib/game/playerCareer/squad';

function signedAt(seed: string): PlayerCareerState {
  const career = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  return chooseStartingOrg(career, career.pendingDraw!.find((option) => option.kind === 'real')!.orgId);
}

/** A temporada inteira jogada com o mesmo rating (e, se pedir, títulos nos primeiros). */
function played(state: PlayerCareerState, rating: number, titles = 0): PlayerCareerState {
  let next = state.calendar ? state : startSeason(state);
  next.calendar!.forEach((entry, index) => {
    next = recordEventResult(next, entry.index, { name: entry.name, placement: index < titles ? 'Campeão' : 'Quartas', rating, seriesWins: 1, seriesLosses: 1 });
  });
  return next;
}

/** O contrato com `until` escolhido (para testar o último ano e o meio do contrato sem jogar várias temporadas). */
const withUntil = (state: PlayerCareerState, until: number): PlayerCareerState => ({ ...state, contract: { ...state.contract!, until } });
const decentOf = (state: PlayerCareerState) => decentRatingFor(state.role, orgOf(state.orgId, state).level);

describe('contrato do seu jogador', () => {
  it('a primeira assinatura cria o contrato: de 1 a 3 temporadas, salário e multa; a lan house não tem contrato', () => {
    const state = signedAt('contrato-1');
    expect(state.contract).toMatchObject({ orgId: state.orgId, from: 1 });
    expect(state.contract!.until - state.contract!.from + 1).toBeGreaterThanOrEqual(1);
    expect(state.contract!.until - state.contract!.from + 1).toBeLessThanOrEqual(CONTRACT_MAX_YEARS);
    expect(state.contract!.salaryUsd).toBeGreaterThan(0);
    expect(state.contract!.buyoutUsd).toBeGreaterThan(state.contract!.salaryUsd);
    const career = createPlayerCareer({ nick: 'lan', country: 'Brazil', role: 'rifler', seed: 'contrato-lan' });
    const lan = career.pendingDraw!.find((option) => option.kind === 'lan-house');
    if (lan) expect(chooseStartingOrg(career, lan.orgId).contract).toBeNull();
  });

  it('o salário sobe com o tier: o mesmo jogador ganha mais no Tier S do que no Tier C', () => {
    const value = marketValueUsd(85);
    expect(monthlySalary(value, 1)).toBeGreaterThan(monthlySalary(value, 2));
    expect(monthlySalary(value, 2)).toBeGreaterThan(monthlySalary(value, 4));
    expect(monthlySalary(marketValueUsd(90), 1)).toBeGreaterThan(15000);
    expect(monthlySalary(marketValueUsd(69), 4)).toBeLessThan(1500);
  });

  it('jovem assina mais longo, veterano mais curto', () => {
    const young = Array.from({ length: 20 }, (_, index) => contractYears(`y-${index}`, 'org', 1, 18, 2));
    const veteran = Array.from({ length: 20 }, (_, index) => contractYears(`v-${index}`, 'org', 1, 33, 2));
    expect(Math.min(...young)).toBe(3);
    expect(Math.max(...veteran)).toBe(1);
  });

  it('sob contrato, a temporada boa não abre o mercado: segue no time e o salário do ano cai no caixa', () => {
    const base = withUntil(signedAt('contrato-sob'), 3);
    const done = finishSeason(played(base, decentOf(base) + 0.03));
    expect(done.pendingOffers).toBeNull();
    expect(done.contract).toEqual(base.contract);
    expect(done.orgId).toBe(base.orgId);
    const prizes = played(base, decentOf(base) + 0.03).money ?? 0;
    expect(done.money).toBe(prizes + base.contract!.salaryUsd * 12);
    expect(done.history.at(-1)?.salaryPaid).toBe(base.contract!.salaryUsd * 12);
    expect(done.history.at(-1)?.contractNote).toMatch(/Sob contrato/);
  });

  it('sob contrato, brilhando: só time de cima, que paga a multa', () => {
    let buyouts = 0;
    for (let index = 0; index < 12; index += 1) {
      const base = withUntil(signedAt(`contrato-estrela-${index}`), 3);
      const level = orgOf(base.orgId, base).level;
      if (level === 0) continue;
      const done = finishSeason(played(base, starRatingFor(base.role, level - 1) + 0.05, 2));
      for (const offer of done.pendingOffers ?? []) {
        buyouts += 1;
        expect(offer.kind).toBe('buyout');
        expect(offer.orgLevel).toBeLessThan(level);
        expect(offer.buyoutUsd).toBe(buyoutFor(marketValueUsd(base.overall), 2));
      }
      // Ficar é seguir no contrato.
      if (done.pendingOffers) expect(stayAtOrg(done).contract).toEqual(base.contract);
    }
    expect(buyouts).toBeGreaterThan(0);
  });

  it('sob contrato, temporada fraca: às vezes o time te vende (não dá para ficar nem ir para a lan house)', () => {
    let sold = 0;
    for (let index = 0; index < 30; index += 1) {
      const base = withUntil(signedAt(`contrato-venda-${index}`), 3);
      const done = finishSeason(played(base, decentOf(base) - 0.05));
      if (!done.sold) continue;
      sold += 1;
      expect(done.pendingOffers).toHaveLength(1);
      expect(done.pendingOffers![0]).toMatchObject({ kind: 'sale' });
      expect(stayAtOrg(done)).toBe(done);
      expect(goToLanHouse(done)).toBe(done);
      const moved = acceptOffer(done, done.pendingOffers![0].orgId);
      expect(moved.orgId).toBe(done.pendingOffers![0].orgId);
      expect(moved.contract?.orgId).toBe(moved.orgId);
      expect(moved.sold).toBe(false);
    }
    expect(sold).toBeGreaterThan(0);
  });

  it('último ano, foi bem: o time renova; ficar assina o contrato novo a partir da temporada seguinte', () => {
    const base = withUntil(signedAt('contrato-renova'), 1);
    const done = finishSeason(played(base, decentOf(base) + 0.02));
    expect(done.released).toBe(false);
    expect(done.pendingOffers?.[0]).toMatchObject({ kind: 'renewal', orgId: base.orgId });
    const stayed = stayAtOrg(done);
    expect(stayed.contract).toMatchObject({ orgId: base.orgId, from: done.seasonNumber });
    expect(stayed.contract!.until).toBeGreaterThanOrEqual(done.seasonNumber);
    expect(stayed.pendingOffers).toBeNull();
  });

  it('último ano, abaixo do esperado: não renovam, você fica livre (sem ficar); a lan house zera o contrato', () => {
    const base = withUntil(signedAt('contrato-livre'), 1);
    const done = finishSeason(played(base, decentOf(base) - RENEW_MARGIN - 0.03));
    expect(done.released).toBe(true);
    expect(done.pendingOffers?.some((offer) => offer.kind === 'renewal')).toBe(false);
    expect(done.history.at(-1)?.contractNote).toMatch(/não renovaram: você está livre/);
    expect(stayAtOrg(done)).toBe(done);
    expect(goToLanHouse(done).contract).toBeNull();
  });

  it('temporada muito ruim sob contrato: o time rescinde', () => {
    const base = withUntil(signedAt('contrato-rescisao'), 3);
    const done = finishSeason(played(base, 0.6));
    expect(done.released).toBe(true);
    expect(done.contract).toBeNull();
    expect(done.history.at(-1)?.contractNote).toMatch(/rescindiu/);
  });

  it('proposta de time de cima no meio do ano, sob contrato, vem com a multa e o contrato novo começa na hora', () => {
    let checked = 0;
    for (let index = 0; index < 20 && !checked; index += 1) {
      const base = startSeason(withUntil(signedAt(`contrato-meio-${index}`), 3));
      const level = orgOf(base.orgId, base).level;
      if (level === 0) continue;
      let state = base;
      for (let event = 0; event < 3; event += 1) state = recordEventResult(state, state.calendar![event].index, { name: state.calendar![event].name, placement: 'Campeão', rating: starRatingFor(base.role, level - 1) + 0.1, seriesWins: 3, seriesLosses: 0 });
      const checkedState = midSeasonCheck(state);
      if (checkedState.pendingMove?.kind !== 'poach') continue;
      checked += 1;
      for (const offer of checkedState.pendingMove.offers) expect(offer).toMatchObject({ kind: 'buyout' });
      const moved = acceptMove(checkedState, checkedState.pendingMove.offers[0].orgId);
      expect(moved.contract).toMatchObject({ orgId: moved.orgId, from: moved.seasonNumber });
    }
    expect(checked).toBe(1);
  });

  it('save de antes dos contratos: o contrato acaba no fim da temporada atual (a virada abre o mercado como antes)', () => {
    const signed = startSeason(signedAt('contrato-save-velho'));
    const { contract: _drop, ...old } = signed;
    const migrated = ensureSquad(old as PlayerCareerState);
    expect(migrated.contract).toMatchObject({ orgId: signed.orgId, from: signed.seasonNumber, until: signed.seasonNumber });
    const done = finishSeason(played(migrated, decentOf(migrated) + 0.02));
    expect(done.pendingOffers?.[0]?.kind).toBe('renewal');
    expect(ensureSquad({ ...old, orgId: 'lan-house' } as PlayerCareerState).contract).toBeNull();
  });
});
