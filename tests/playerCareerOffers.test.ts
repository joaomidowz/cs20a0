// tests/playerCareerOffers.test.ts
// D11: toda org da cena pode fazer proposta, respeitando a identidade do time (D3), a régua de idioma da call e o
// nível de hoje; o sorteio tem peso, não repete org e lembra quem já chamou.
import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../src/lib/game/simulation';
import { createPlayerCareer, ENGLISH_REQUIRED, levelIn, midSeasonCheck, recordEventResult, requestTransfer, starRatingFor, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { orgIn } from '../src/lib/game/playerCareer/world';
import { orgLanguage, sceneOrgById, sceneOrgs, type SceneOrg, type SceneRosterMember } from '../src/lib/game/playerCareer/data';
import { RECENT_OFFER_WEIGHT, languageGate, offerWeight, pickOffers, rememberOffers, seatKeepsIdentity } from '../src/lib/game/playerCareer/offers';

const byName = (name: string) => sceneOrgs.find((org) => org.name === name)!;
const career = (country: string, seed: string, en?: number): PlayerCareerState => ({
  ...createPlayerCareer({ nick: 'propostas', country, role: 'rifler', seed }),
  pendingDraw: null, drawDone: true, seatsTaken: [], ...(en ? { languages: { en } } : {})
});
const member = (nick: string, country: string, role: string): SceneRosterMember => ({ nick, country, birthDate: null, roles: [role], catalogBaseId: null, prospect: null });

describe('identidade com você na vaga (D3)', () => {
  it('B8 tem 4 ucranianos: um brasileiro na vaga ainda deixa 3, então cabe', () => {
    const b8 = byName('B8');
    expect(b8.roster.filter((entry) => entry.country === 'Ukraine').length).toBeGreaterThanOrEqual(4);
    expect(seatKeepsIdentity({ nick: 'x', country: 'Brazil', role: 'rifler' }, b8)).toBe(true);
  });

  it('time com 3 brasileiros: o gringo não entra no lugar de um deles, mas entra no lugar do gringo', () => {
    const furia = sceneOrgById.get(byName('FURIA').id)!;
    const roster = [member('br1', 'Brazil', 'awper'), member('br2', 'Brazil', 'rifler'), member('br3', 'Brazil', 'igl'), member('kz', 'Kazakhstan', 'entry'), member('lv', 'Latvia', 'support')];
    const org: SceneOrg = { ...furia, roster };
    expect(seatKeepsIdentity({ nick: 'x', country: 'Denmark', role: 'rifler' }, org)).toBe(false);
    expect(seatKeepsIdentity({ nick: 'x', country: 'Brazil', role: 'rifler' }, org)).toBe(true);
    expect(seatKeepsIdentity({ nick: 'x', country: 'Denmark', role: 'entry' }, org)).toBe(true);
  });
});

describe('régua de idioma da call', () => {
  it('no Tier S e no Tier A o time exige a língua da call, seja ela qual for', () => {
    const vitality = byName('Vitality');
    const b8 = byName('B8');
    const brazil = career('Brazil', 'idioma-1');
    expect(levelIn(brazil, b8)).toBeLessThanOrEqual(2);
    expect(languageGate(brazil, vitality)).toEqual({ language: 'en', need: ENGLISH_REQUIRED[levelIn(brazil, vitality)] });
    expect(languageGate(brazil, b8)).toEqual({ language: 'ru', need: ENGLISH_REQUIRED[levelIn(brazil, b8)] });
    expect(languageGate(career('Ukraine', 'idioma-2'), b8)).toBeNull();
    expect(languageGate({ ...brazil, languages: { en: 80 } }, vitality)).toBeNull();
  });

  it('abaixo do Tier A ninguém exige idioma', () => {
    // A Fnatic era o exemplo daqui, mas subiu para o Tier A pelo ranking real: vale para todo time do Tier B e do C.
    const state = career('Brazil', 'idioma-3');
    const lower = sceneOrgs.filter((org) => levelIn(state, org) >= 3 && orgLanguage(org) !== 'pt');
    expect(lower.length).toBeGreaterThan(50);
    for (const org of lower) expect(languageGate(state, org), org.name).toBeNull();
  });
});

describe('sorteio das propostas', () => {
  it('quem já te chamou nesta temporada ou na anterior pesa um quarto', () => {
    const state = career('Ukraine', 'peso-1');
    const b8 = byName('B8');
    const fresh = offerWeight(state, b8, true);
    const recent = offerWeight({ ...state, recentOffers: [{ orgId: b8.id, season: state.seasonNumber }] }, b8, true);
    const old = offerWeight({ ...state, seasonNumber: 4, recentOffers: [{ orgId: b8.id, season: 1 }] }, b8, true);
    expect(recent).toBeCloseTo(fresh * RECENT_OFFER_WEIGHT, 6);
    expect(old).toBeCloseTo(fresh, 6);
  });

  it('determinístico, sem repetir org, só nos níveis pedidos e nunca o seu time', () => {
    const state = { ...career('Denmark', 'sorteio-1'), orgId: byName('HEROIC').id };
    const run = () => pickOffers(state, createSeededRng('sorteio-1:janela'), [{ levels: [2], count: 2, bump: 0.04 }, { levels: [3, 4], count: 3, bump: 0 }], { season: 1 });
    const offers = run();
    expect(offers).toEqual(run());
    expect(offers.length).toBe(3);
    expect(new Set(offers.map((offer) => offer.orgId)).size).toBe(3);
    expect(offers.some((offer) => offer.orgId === state.orgId)).toBe(false);
    for (const offer of offers) expect([2, 3, 4]).toContain(offer.orgLevel);
  });

  it('a memória guarda a temporada atual e a anterior e esquece o resto', () => {
    const state = { ...career('Brazil', 'memoria-1'), seasonNumber: 5, recentOffers: [{ orgId: 'velha', season: 3 }, { orgId: 'anterior', season: 4 }] };
    const kept = rememberOffers(state, [{ orgId: 'nova', orgName: 'Nova', orgLevel: 3, salaryUsd: 1000 }]);
    expect(kept).toEqual([{ orgId: 'anterior', season: 4 }, { orgId: 'nova', season: 5 }]);
  });
});

describe('propostas no meio da temporada (D11)', () => {
  const seasonAt = (country: string, seed: string, orgName: string): PlayerCareerState =>
    startSeason({ ...career(country, seed, 85), orgId: byName(orgName).id, overall: 80 });
  const playN = (state: PlayerCareerState, count: number, rating: number) => {
    let next = state;
    for (let index = 0; index < count; index += 1) next = recordEventResult(next, index, { name: next.calendar![index].name, placement: 'Quartas', rating, seriesWins: 1, seriesLosses: 1 });
    return next;
  };

  it('pedir para sair: o agente acha orgs de toda a faixa, respeita identidade e idioma e lembra quem chamou', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 30; index += 1) {
      const base = playN(seasonAt('Denmark', `pedido-${index}`, 'HEROIC'), 2, 1.15);
      const asked = requestTransfer(base, {});
      const offers = asked.pendingMove?.offers ?? [];
      for (const offer of offers) {
        seen.add(offer.orgId);
        const org = orgIn(asked.seed, asked.seasonNumber, offer.orgId)!;
        expect(seatKeepsIdentity(asked, org), offer.orgName).toBe(true);
        expect(languageGate(asked, org), offer.orgName).toBeNull();
        expect(asked.recentOffers).toContainEqual({ orgId: offer.orgId, season: asked.seasonNumber });
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(25);
  });

  it('proposta de time de cima no meio do ano: o nível de cima, de várias orgs', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 40; index += 1) {
      // Time do Tier C (a Fnatic era o exemplo, mas subiu para o Tier A pelo ranking real).
      const base = seasonAt('Denmark', `meio-${index}`, 'ENCE');
      const level = levelIn(base, byName('ENCE'));
      const state = midSeasonCheck(playN(base, 3, starRatingFor('rifler', level - 1) + 0.05));
      if (state.pendingMove?.kind !== 'poach') continue;
      for (const offer of state.pendingMove.offers) {
        seen.add(offer.orgId);
        expect(offer.orgLevel).toBe(level - 1);
        expect(state.recentOffers).toContainEqual({ orgId: offer.orgId, season: state.seasonNumber });
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });
});
