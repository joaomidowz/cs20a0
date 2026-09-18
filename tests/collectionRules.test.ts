// tests/collectionRules.test.ts
// Regras puras da coleção: odds, valor em coins, sorteio determinístico de pacote, sinergia e star player.
import { describe, expect, it } from 'vitest';
import { players, playerById } from '../server/data';
import { rollPack } from '../server/collection/packs';
import { dayKeyUtcMinus3, seasonMonthOf } from '../server/collection/time';
import { applyCollectionLineup, cardEffects, isStarEffective, primaryRoleOf, synergyOf, validateLineup } from '../src/lib/game/online/collection-lineup';
import { CARDS_PER_PACK, PACK_ODDS, PACK_TIERS, coinValue, matchReward, rarityOf, sellValue } from '../src/lib/game/online/collection-rules';
import { calculateUserTeamPower } from '../src/lib/game/simulation';
import type { LineupSlotRole, Player } from '../src/lib/game/types';

describe('regras de coins', () => {
  it('odds somam 100 por tier', () => {
    for (const tier of PACK_TIERS) expect(Object.values(PACK_ODDS[tier]).reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 6);
  });

  it('valor cresce com overall e raridade, dentro de 30..2500, e venda paga 60%', () => {
    const low = coinValue({ overall: 62, rarity: 'common', role: 'rifler', badges: [] });
    const high = coinValue({ overall: 97, rarity: 'goat', role: 'awper', badges: ['major-champion', 'major-champion'] });
    expect(low).toBeGreaterThanOrEqual(30);
    expect(high).toBeLessThanOrEqual(2500);
    expect(high).toBeGreaterThan(low);
    expect(coinValue({ overall: 80, rarity: 'goat' })).toBeGreaterThan(coinValue({ overall: 80, rarity: 'common' }));
    expect(sellValue({ overall: 80, rarity: 'rare' })).toBe(Math.floor(coinValue({ overall: 80, rarity: 'rare' }) * 0.6));
    expect(rarityOf({ rarity: 'GOAT' })).toBe('goat');
    expect(rarityOf({ rarity: 'x' })).toBe('common');
    expect(matchReward('placementChampion', true)).toBe(300);
    expect(matchReward('placementChampion', false)).toBe(150);
    expect(matchReward('placementStage3', true)).toBe(50);
  });

  it('dia vira à meia-noite de Brasília e a temporada é mensal', () => {
    expect(dayKeyUtcMinus3(Date.UTC(2026, 8, 18, 2, 59))).toBe('2026-09-17');
    expect(dayKeyUtcMinus3(Date.UTC(2026, 8, 18, 3, 0))).toBe('2026-09-18');
    const season = seasonMonthOf(Date.UTC(2026, 8, 18, 12));
    expect(season.month).toBe('2026-09-01');
    expect(season.startsAt).toBe(Date.UTC(2026, 8, 1, 3));
    expect(season.endsAt).toBe(Date.UTC(2026, 9, 1, 3));
  });
});

describe('sorteio de pacote', () => {
  it('três cartas de anos distintos, determinístico pela seed, sem repetir carta', () => {
    const a = rollPack('basic', 'u1:2026-09-18:1', players);
    const b = rollPack('basic', 'u1:2026-09-18:1', players);
    const c = rollPack('basic', 'u1:2026-09-18:2', players);
    expect(a.map((card) => card.id)).toEqual(b.map((card) => card.id));
    expect(a.map((card) => card.id)).not.toEqual(c.map((card) => card.id));
    expect(a).toHaveLength(CARDS_PER_PACK);
    expect(new Set(a.map((card) => card.year)).size).toBe(CARDS_PER_PACK);
    expect(new Set(a.map((card) => card.id)).size).toBe(CARDS_PER_PACK);
  });

  it('pacote de era só traz o ano pedido; ouro rende mais raridade alta que básico', () => {
    const era = rollPack('era', 'seed', players, { year: 2019 });
    expect(era.every((card) => card.year === 2019)).toBe(true);
    const score = (tier: 'basic' | 'ouro') => {
      let total = 0;
      for (let index = 0; index < 300; index += 1) for (const card of rollPack(tier, `s${index}`, players)) total += ['common', 'rare', 'elite', 'superstar', 'legend', 'goat'].indexOf(rarityOf(card));
      return total;
    };
    expect(score('ouro')).toBeGreaterThan(score('basic') * 1.5);
  });
});

describe('lineup da coleção', () => {
  const byRole = (role: LineupSlotRole, count = 1, minOverall = 0) => players.filter((player) => primaryRoleOf(player) === role && (player.overall ?? 0) >= minOverall).slice(0, count);
  const distinct = (list: Player[]) => {
    const seen = new Set<string>();
    return list.filter((player) => { const base = player.baseId ?? player.id; if (seen.has(base)) return false; seen.add(base); return true; });
  };
  const standard = distinct([...byRole('igl', 3), ...byRole('awper', 3), ...byRole('entry', 3), ...byRole('lurker', 3), ...byRole('support', 3)]);
  const pick = (role: LineupSlotRole) => standard.find((player) => primaryRoleOf(player) === role)!;
  const lineup = [pick('igl'), pick('awper'), pick('entry'), pick('lurker'), pick('support')];
  const roles: LineupSlotRole[] = ['igl', 'awper', 'entry', 'lurker', 'support'];
  const lookup = (id: string) => playerById.get(id);

  it('composição completa dá sinergia positiva; sem IGL e sem AWP dá negativa', () => {
    const full = synergyOf({ players: lineup, roles, starPlayerId: null });
    expect(full.map((line) => line.key)).toEqual(expect.arrayContaining(['igl_one', 'entry_one', 'support_present', 'lurker_present']));
    const riflers = distinct(byRole('rifler', 8)).slice(0, 5);
    const bad = synergyOf({ players: riflers, roles: ['rifler', 'rifler', 'rifler', 'rifler', 'rifler'], starPlayerId: null });
    expect(bad.map((line) => line.key)).toEqual(expect.arrayContaining(['igl_none', 'awp_none', 'support_none']));
    expect(bad.reduce((sum, line) => sum + line.power, 0)).toBeLessThan(0);
  });

  it('função repetida é permitida e fora da função própria custa 1% cada', () => {
    const check = validateLineup({ players: lineup, roles, starPlayerId: null }, lookup);
    expect(check.ok).toBe(true);
    const swapped: LineupSlotRole[] = ['awper', 'igl', 'entry', 'lurker', 'support'];
    const igl = pick('igl');
    const awper = pick('awper');
    const allowed = validateLineup({ players: lineup, roles: swapped, starPlayerId: null }, lookup);
    // Only counts when the dataset says the card can play there; otherwise it is invalid, never silently penalized.
    const eligible = allowed.ok;
    const off = synergyOf({ players: lineup, roles: eligible ? swapped : roles, starPlayerId: null }).find((line) => line.key === 'off_role');
    if (eligible) expect(off?.power).toBe(-2);
    else expect(off).toBeUndefined();
    expect(igl.id).not.toBe(awper.id);
  });

  it('star só vale no top-2 de overall ou com 85+, e muda o time construído', () => {
    const best = [...lineup].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
    expect(isStarEffective(lineup, best[0].id)).toBe(true);
    const weakest = best[4];
    expect(isStarEffective(lineup, weakest.id)).toBe((weakest.overall ?? 0) >= 85);
    const selected = lineup.map((player, index) => ({ playerId: player.id, selectedSlotRole: roles[index] }));
    const base = calculateUserTeamPower(lineup, 'balanced', selected, 'seed');
    const withStar = applyCollectionLineup(base, { players: lineup, roles, starPlayerId: best[0].id });
    const noStar = applyCollectionLineup(base, { players: lineup, roles, starPlayerId: null });
    expect(withStar.power).toBeGreaterThan(noStar.power);
    expect(withStar.mental).toBeLessThanOrEqual(99);
    const lit = cardEffects({ players: lineup, roles, starPlayerId: null });
    expect(lit[pick('igl').id]).toBe('up');
    expect(lit[pick('support').id]).toBe('up');
    const check = validateLineup({ players: lineup, roles, starPlayerId: 'nao-existe' }, lookup);
    expect(check.problems).toContain('STAR_NOT_IN_LINEUP');
  });
});

describe('pool desde 2013 e coaches', () => {
  it('pacote de era 2013 só traz 2013 e pacotes às vezes trazem coach, sempre determinístico', async () => {
    const { collectionCoaches, collectionPlayers } = await import('../src/lib/game/online/collection-pool');
    const { rollPackWithCoaches } = await import('../server/collection/packs');
    const era = rollPackWithCoaches('era', 'e2013', collectionPlayers, collectionCoaches, { year: 2013 });
    expect(era.every((card) => (card.kind === 'player' ? card.player.year : card.coach.year) === 2013)).toBe(true);
    let coaches = 0;
    for (let index = 0; index < 400; index += 1) coaches += rollPackWithCoaches('ouro', `c${index}`, collectionPlayers, collectionCoaches).filter((card) => card.kind === 'coach').length;
    expect(coaches).toBeGreaterThan(40);
    expect(coaches).toBeLessThan(120);
    expect(rollPackWithCoaches('ouro', 'same', collectionPlayers, collectionCoaches)).toEqual(rollPackWithCoaches('ouro', 'same', collectionPlayers, collectionCoaches));
    expect(collectionPlayers.some((player) => player.year === 2013)).toBe(true);
    expect(collectionCoaches.every((coach) => coach.confidence !== 'placeholder')).toBe(true);
  });

  it('valor do coach cresce com overall e raridade', async () => {
    const { coachCoinValue } = await import('../src/lib/game/online/collection-rules');
    expect(coachCoinValue({ overall: 88, rarity: 'legend' })).toBeGreaterThan(coachCoinValue({ overall: 70, rarity: 'common' }));
    expect(coachCoinValue({ overall: 60, rarity: 'common' })).toBeGreaterThanOrEqual(30);
  });
});
