// tests/playerCareerOfferSpread.test.ts
// D11 medido: no fim da temporada, as propostas vêm de muitas orgs de cada nível, nenhuma domina, e todas respeitam a
// identidade (D3) e a régua de idioma. Números do experimento do plano 09 (40 seeds, temporada de estrela e boa,
// as 6 funções): antes, 8 a 10 orgs distintas no nível 0 e 16 a 25 no nível 1, com a maior em até 20%.
import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../src/lib/game/simulation';
import {
  createPlayerCareer, decentRatingFor, finishSeason, levelIn, recordEventResult, starRatingFor, startSeason, type CareerOffer, type PlayerCareerState, type PlayerRole
} from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { orgIn } from '../src/lib/game/playerCareer/world';
import { languageGate, seatKeepsIdentity } from '../src/lib/game/playerCareer/offers';

const SEEDS = 40;
const ROLES: PlayerRole[] = ['rifler', 'awper', 'entry', 'igl', 'lurker', 'support'];

/** Uma temporada inteira num time do nível, com rating de estrela (e um título) ou de temporada boa. */
function seasonAt(country: string, en: number, level: number, mood: 'star' | 'decent', index: number): PlayerCareerState {
  const seed = `spread-${country}-${en}-${level}-${mood}-${index}`;
  const role = ROLES[index % ROLES.length];
  const base: PlayerCareerState = { ...createPlayerCareer({ nick: 'spread', country, role, seed }), pendingDraw: null, drawDone: true, seatsTaken: [] };
  const pool = sceneOrgs.filter((org) => levelIn(base, org) === level && seatKeepsIdentity(base, org));
  const org = pool[Math.floor(createSeededRng(`${seed}:time`)() * pool.length)];
  let state = startSeason({ ...base, orgId: org.id, overall: 60 + (4 - level) * 8, languages: { en } });
  const rating = mood === 'star' ? starRatingFor(role, Math.max(0, level - 1)) + 0.03 : decentRatingFor(role, level) + 0.02;
  for (const entry of state.calendar!) {
    state = recordEventResult(state, entry.index, { name: entry.name, placement: mood === 'star' && entry.index === 0 ? 'Campeão' : 'Quartas', tier: entry.tier, rating, seriesWins: 1, seriesLosses: 1 });
  }
  return state;
}

interface Spread { orgs: number; top1: number; top10: number; perWindow: number }
function spreadOf(country: string, en: number, level: number, check?: (state: PlayerCareerState, offer: CareerOffer) => void): Spread {
  const counts = new Map<string, number>();
  let total = 0;
  for (const mood of ['star', 'decent'] as const) {
    for (let index = 0; index < SEEDS; index += 1) {
      const done = finishSeason(seasonAt(country, en, level, mood, index));
      for (const offer of done.pendingOffers ?? []) {
        counts.set(offer.orgId, (counts.get(offer.orgId) ?? 0) + 1);
        total += 1;
        check?.(done, offer);
      }
    }
  }
  const sorted = [...counts.values()].sort((a, b) => b - a);
  return {
    orgs: counts.size,
    top1: total ? sorted[0] / total : 0,
    top10: total ? sorted.slice(0, 10).reduce((sum, value) => sum + value, 0) / total : 0,
    perWindow: total / (2 * SEEDS)
  };
}

/** Mínimo de orgs distintas por nível (o experimento do plano deu 22, 44, 79, 122 e 125 no pior caso). */
const MIN_ORGS: Record<number, number> = { 0: 15, 1: 32, 2: 60, 3: 90, 4: 100 };

describe('propostas de todas as orgs (D11)', () => {
  for (const [country, en] of [['Brazil', 70], ['Denmark', 85]] as const) {
    it(`${country} com inglês ${en}: muitas orgs por nível e nenhuma passa de 20%`, () => {
      for (const level of [0, 1, 2, 3, 4]) {
        const spread = spreadOf(country, en, level);
        expect(spread.orgs, `nível ${level}`).toBeGreaterThanOrEqual(MIN_ORGS[level]);
        expect(spread.top1, `nível ${level}`).toBeLessThanOrEqual(0.2);
        expect(spread.perWindow, `nível ${level}`).toBeGreaterThanOrEqual(2.5);
        if (level === 1 || level === 2) expect(spread.top10, `nível ${level}`).toBeLessThanOrEqual(0.65);
      }
    }, 120_000);
  }

  for (const country of ['Brazil', 'Ukraine']) {
    it(`${country} com inglês 45 (barrado no Tier S de call em inglês): ainda tem proposta e variedade`, () => {
      expect(spreadOf(country, 45, 0).perWindow).toBeGreaterThanOrEqual(1);
      for (const level of [1, 2, 3, 4]) {
        const spread = spreadOf(country, 45, level);
        expect(spread.orgs, `nível ${level}`).toBeGreaterThanOrEqual(30);
        expect(spread.top1, `nível ${level}`).toBeLessThanOrEqual(0.25);
      }
    }, 120_000);
  }

  it('toda proposta mantém a identidade do time com você na vaga e passa na régua de idioma', () => {
    for (const [country, en] of [['Brazil', 45], ['Denmark', 85]] as const) {
      for (const level of [1, 3]) {
        spreadOf(country, en, level, (done, offer) => {
          const org = orgIn(done.seed, done.seasonNumber, offer.orgId)!;
          expect(seatKeepsIdentity(done, org), offer.orgName).toBe(true);
          expect(languageGate(done, org), offer.orgName).toBeNull();
        });
      }
    }
  }, 120_000);

  it('o fim da temporada lembra quem fez proposta', () => {
    const done = finishSeason(seasonAt('Denmark', 85, 2, 'decent', 0));
    expect(done.pendingOffers?.length).toBeGreaterThan(0);
    for (const offer of done.pendingOffers!) expect(done.recentOffers).toContainEqual({ orgId: offer.orgId, season: done.seasonNumber - 1 });
  });
});
