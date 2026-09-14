// tests/dynastyCoach.test.ts
import { describe, expect, it } from 'vitest';
import { coaches, getTeamPlayers, teams } from '../src/lib/game/data';
import { applyCoachToTeam, coachAffinity, COACH_REROLLS, isDraftableCoach } from '../src/lib/game/dynasty/coach';
import { COACH_OFFER_SIZE, offerCoaches } from '../src/lib/game/dynasty/coachOffer';
import type { CombatTeam, Coach } from '../src/lib/game/types';

const team: CombatTeam = { id: 'user', name: 'Org', power: 80, mental: 80, clutch: 80, experience: 80, isUser: true };
const coach = (patch: Partial<Coach>): Coach => ({ id: 'coach-x-2018', baseId: 'x', name: 'X', teamId: 'x-2018', year: 2018, game: 'CSGO', tactics: 70, discipline: 70, aggression: 70, development: 70, overall: 70, rarity: 'common', confidence: 'high', needsReview: false, source: { page: null, url: null, year: 2018, note: '' }, ...patch });

describe('efeito do coach', () => {
  it('coach neutro (70 em tudo) não muda força nem mental', () => {
    const applied = applyCoachToTeam(team, coach({}));
    expect(applied.power).toBeCloseTo(80, 10);
    expect(applied.mental).toBeCloseTo(80, 10);
    expect(applied.coachSidePreference).toBeCloseTo(0, 10);
    expect(applied.timeoutFactor).toBeCloseTo(1, 10);
    expect(applied.coachId).toBe('coach-x-2018');
  });

  it('coach de elite fica dentro das faixas da spec', () => {
    const applied = applyCoachToTeam(team, coach({ tactics: 99, discipline: 99, aggression: 99 }), 0.015);
    expect(applied.power).toBeCloseTo(80 * (1 + 29 / 2000 + 0.015), 10);
    expect(applied.mental).toBeCloseTo(80 + 29 * 0.25, 10);
    expect(applied.coachSidePreference).toBeCloseTo(-0.029, 10);
    expect(applied.timeoutFactor).toBeCloseTo(1.145, 10);
    const weak = applyCoachToTeam(team, coach({ tactics: 40, discipline: 40, aggression: 40 }));
    expect(weak.power).toBeCloseTo(80 * (1 - 30 / 2000), 10);
    expect(weak.timeoutFactor).toBeCloseTo(0.85, 10);
    expect(applyCoachToTeam({ ...team, mental: 95 }, coach({ discipline: 99 })).mental).toBe(99);
  });

  it('afinidade: 2 jogadores do time do coach valem mais que 2 da mesma organização em outro ano', () => {
    const astralis2018 = teams.find((item) => item.id === 'astralis-2018')!;
    const astralis2019 = teams.find((item) => item.id === 'astralis-2019')!;
    const coachOf2018 = coach({ teamId: astralis2018.id });
    expect(coachAffinity(coachOf2018, getTeamPlayers(astralis2018).slice(0, 2), teams)).toBe(0.015);
    expect(coachAffinity(coachOf2018, getTeamPlayers(astralis2019).slice(0, 2), teams)).toBe(0.0075);
    expect(coachAffinity(coachOf2018, getTeamPlayers(astralis2018).slice(0, 1), teams)).toBe(0);
  });
});

describe('ofertas de coach no draft', () => {
  const used = ['astralis-2018', 'faze-2018'];

  it('oferece 3 pessoas distintas, sem placeholder nem time já usado, com uma de overall 80+', () => {
    const offer = offerCoaches(coaches, 'seed-coach', used);
    expect(offer).toHaveLength(COACH_OFFER_SIZE);
    expect(new Set(offer.map((item) => item.baseId)).size).toBe(COACH_OFFER_SIZE);
    expect(offer.every(isDraftableCoach)).toBe(true);
    expect(offer.some((item) => used.includes(item.teamId))).toBe(false);
    expect(offer.some((item) => item.overall >= 80)).toBe(true);
  });

  it('é determinístico pela seed e o ressorteio muda a oferta', () => {
    const ids = (rerolls: number, seed = 'seed-coach') => offerCoaches(coaches, seed, used, rerolls).map((item) => item.id);
    expect(ids(0)).toEqual(ids(0));
    expect(ids(1)).not.toEqual(ids(0));
    expect(ids(0, 'outra')).not.toEqual(ids(0));
    expect(offerCoaches(coaches, 'seed-coach', [...used].reverse()).map((item) => item.id)).toEqual(ids(0));
    expect(COACH_REROLLS).toBe(1);
  });
});
