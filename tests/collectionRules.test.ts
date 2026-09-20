// tests/collectionRules.test.ts
// Regras puras da coleção: odds, valor em coins, sorteio determinístico de pacote, sinergia e star player.
import { courtPower } from '../src/lib/game/courtPower';
import { collectionCoachById } from '../src/lib/game/online/collection-pool';
import { describe, expect, it } from 'vitest';
import { players, playerById } from '../server/data';
import { rollPack } from '../server/collection/packs';
import { dayKeyUtcMinus3, isoWeekKeyUtcMinus3, monthKeyUtcMinus3, seasonMonthOf } from '../server/collection/time';
import { BALANCED_PLAN_MAX, BALANCED_PLAN_MIN, MISSING_AWPER_COURT, MISSING_IGL_COURT, MISSING_SUPPORT_COURT, PLAN_BONUS_MAX, PLAN_BONUS_MIN, PLAN_OFF_BONUS, STAR_ROLE_BONUS, applyCollectionLineup, planBonus, planQuality, cardEffects, collectionRoleOf, eligibleRolesOf, isStarEffective, primaryRoleOf, starScale, styleReady, synergyOf, toSelectedPlayer, validateLineup } from '../src/lib/game/online/collection-lineup';
import { CARDS_PER_PACK, DAILY_BASIC_PACKS, PACK_PRICES, PACK_SLOTS, PACK_TIERS, SELL_RATIO, coinValue, matchReward, packChance, rarityOf, sellValue } from '../src/lib/game/online/collection-rules';
import { calculateUserTeamPower } from '../src/lib/game/simulation';
import type { LineupSlotRole, OrgStyle, Player } from '../src/lib/game/types';

describe('regras de coins', () => {
  it('odds somam 100 em cada carta de cada pacote; GOAT é raro fora do Ícone', () => {
    for (const tier of PACK_TIERS) {
      expect(PACK_SLOTS[tier]).toHaveLength(CARDS_PER_PACK);
      for (const row of PACK_SLOTS[tier]) expect(Object.values(row).reduce((sum: number, value: number) => sum + value, 0)).toBeCloseTo(100, 6);
    }
    expect(packChance('icone', ['goat'])).toBe(1);
    expect(packChance('diamante', ['legend', 'goat'])).toBe(1);
    for (const tier of ['basic', 'prata', 'era', 'ouro'] as const) expect(packChance(tier, ['goat'])).toBeLessThan(0.07);
  });

  it('valor cresce com overall e raridade, dentro de 2.160..110.000, e venda paga SELL_RATIO', () => {
    const low = coinValue({ overall: 62, rarity: 'common' });
    const high = coinValue({ overall: 97, rarity: 'goat' });
    expect(low).toBe(2_160);
    expect(high).toBeLessThanOrEqual(110_000);
    expect(high).toBeGreaterThan(low);
    expect(coinValue({ overall: 80, rarity: 'goat' })).toBeGreaterThan(coinValue({ overall: 80, rarity: 'common' }));
    expect(sellValue({ overall: 80, rarity: 'rare' })).toBe(Math.floor(coinValue({ overall: 80, rarity: 'rare' }) * SELL_RATIO));
    expect(rarityOf({ rarity: 'GOAT' })).toBe('goat');
    expect(rarityOf({ rarity: 'x' })).toBe('common');
    expect(matchReward('placementChampion', true)).toBe(2400);
    expect(matchReward('placementChampion', false)).toBe(1200);
    expect(matchReward('placementRunnerUp', true)).toBe(1500);
    expect(matchReward('placement3to4', true)).toBe(1000);
    expect(matchReward('placement5to8', true)).toBe(600);
    expect(matchReward('placementStage3', true)).toBe(150);
  });

  it('pacotes premium: Lenda e GOAT ~40% mais raras, garantias mantidas', () => {
    expect(PACK_PRICES).toMatchObject({ prata: 1200, ouro: 3500, era: 7500, diamante: 30000, icone: 50000 });
    // Antes: Diamante 10% de GOAT por carta; Ícone 60% Lenda e 20% GOAT nas cartas 2 e 3.
    for (const row of PACK_SLOTS.diamante) expect(row.goat).toBe(6);
    expect(PACK_SLOTS.diamante[1]).toMatchObject({ elite: 14, superstar: 44, legend: 36 });
    expect(PACK_SLOTS.icone[1]).toMatchObject({ elite: 12, superstar: 40, legend: 36, goat: 12 });
    expect(packChance('icone', ['goat'])).toBe(1);
    expect(packChance('diamante', ['legend', 'goat'])).toBe(1);
    expect(DAILY_BASIC_PACKS).toBe(3);
  });

  it('dia vira à meia-noite de Brasília e a temporada é mensal', () => {
    expect(dayKeyUtcMinus3(Date.UTC(2026, 8, 18, 2, 59))).toBe('2026-09-17');
    expect(dayKeyUtcMinus3(Date.UTC(2026, 8, 18, 3, 0))).toBe('2026-09-18');
    const season = seasonMonthOf(Date.UTC(2026, 8, 18, 12));
    expect(season.month).toBe('2026-09-01');
    expect(season.startsAt).toBe(Date.UTC(2026, 8, 1, 3));
    expect(season.endsAt).toBe(Date.UTC(2026, 9, 1, 3));
  });

  it('semana ISO e mês dos pacotes grátis viram no fuso de Brasília', () => {
    // Segunda 21/09/2026 começa à meia-noite de Brasília (03:00 UTC).
    expect(isoWeekKeyUtcMinus3(Date.UTC(2026, 8, 21, 2, 59))).toBe('2026-W38');
    expect(isoWeekKeyUtcMinus3(Date.UTC(2026, 8, 21, 3, 0))).toBe('2026-W39');
    expect(isoWeekKeyUtcMinus3(Date.UTC(2025, 11, 29, 12))).toBe('2026-W01');
    expect(isoWeekKeyUtcMinus3(Date.UTC(2021, 0, 3, 12))).toBe('2020-W53');
    expect(monthKeyUtcMinus3(Date.UTC(2026, 9, 1, 2, 59))).toBe('2026-09');
    expect(monthKeyUtcMinus3(Date.UTC(2026, 9, 1, 3, 0))).toBe('2026-10');
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

  it('Ícone sempre traz um GOAT e Diamante uma Lenda ou GOAT na primeira carta, sem repetir carta', () => {
    for (let index = 0; index < 60; index += 1) {
      const icone = rollPack('icone', `i${index}`, players);
      expect(rarityOf(icone[0])).toBe('goat');
      expect(icone.slice(1).every((card) => ['elite', 'superstar', 'legend', 'goat'].includes(rarityOf(card)))).toBe(true);
      expect(new Set(icone.map((card) => card.id)).size).toBe(CARDS_PER_PACK);
      const diamante = rollPack('diamante', `d${index}`, players);
      expect(['legend', 'goat']).toContain(rarityOf(diamante[0]));
      expect(diamante.slice(1).every((card) => ['elite', 'superstar', 'legend', 'goat'].includes(rarityOf(card)))).toBe(true);
    }
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
    // O que falta é pago em pontos de quadra (não em %): sem IGL, sem AWPer e sem suporte.
    expect(bad.reduce((sum, line) => sum + line.court, 0)).toBe(MISSING_IGL_COURT + MISSING_AWPER_COURT + MISSING_SUPPORT_COURT);
  });

  it('função repetida é permitida e posição secundária não custa nada', () => {
    const check = validateLineup({ players: lineup, roles, starPlayerId: null }, lookup);
    expect(check.ok).toBe(true);
    const swapped: LineupSlotRole[] = ['awper', 'igl', 'entry', 'lurker', 'support'];
    const igl = pick('igl');
    const awper = pick('awper');
    const allowed = validateLineup({ players: lineup, roles: swapped, starPlayerId: null }, lookup);
    // Only counts when the dataset says the card can play there; otherwise it is invalid, never silently penalized.
    const eligible = allowed.ok;
    const off = synergyOf({ players: lineup, roles: eligible ? swapped : roles, starPlayerId: null }).find((line) => line.key === 'off_role');
    // A secondary position is free now: no line, no penalty.
    expect(off).toBeUndefined();
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

  it('suporte e IGL puro não podem ser star; o AWPer-IGL pode', () => {
    for (const role of ['support', 'igl'] as const) {
      const star = pick(role);
      const strong = lineup.map((player) => (player.id === star.id ? { ...player, overall: 95 } : player));
      expect(isStarEffective(strong, star.id)).toBe(true);
      expect(isStarEffective(strong, star.id, roles)).toBe(false);
      expect(synergyOf({ players: strong, roles, starPlayerId: star.id }).some((line) => line.key.startsWith('star'))).toBe(false);
      expect(validateLineup({ players: strong, roles, starPlayerId: star.id }, lookup).starEffective).toBe(false);
    }
  });

  it('AWPer-IGL ocupa as duas funções com metade do bônus e vira o pick duplo do motor', () => {
    const hybrid = players.find((player) => eligibleRolesOf(player).includes('awper-igl') && (player.igl ?? 0) >= 75)!;
    expect(hybrid).toBeTruthy();
    expect(eligibleRolesOf(pick('entry'))).not.toContain('awper-igl');
    const others = distinct([hybrid, ...byRole('entry', 3), ...byRole('lurker', 3), ...byRole('support', 3), ...byRole('rifler', 3)]).filter((player) => player.id !== hybrid.id);
    const team = [hybrid, others.find((player) => primaryRoleOf(player) === 'entry')!, others.find((player) => primaryRoleOf(player) === 'lurker')!, others.find((player) => primaryRoleOf(player) === 'support')!, others.find((player) => primaryRoleOf(player) === 'rifler')!];
    const teamRoles = ['awper-igl', 'entry', 'lurker', 'support', 'rifler'] as const;
    const input = { players: team, roles: [...teamRoles], starPlayerId: null };
    expect(validateLineup(input, lookup).ok).toBe(true);
    // Um rifler puro não pode ocupar o slot híbrido.
    expect(validateLineup({ ...input, roles: ['awper-igl', 'entry', 'lurker', 'support', 'awper-igl'] }, lookup).ok).toBe(eligibleRolesOf(team[4]).includes('awper-igl'));
    const keys = synergyOf(input).map((line) => line.key);
    expect(keys).toContain('igl_hybrid');
    expect(keys).not.toEqual(expect.arrayContaining(['igl_one']));
    expect(keys).not.toEqual(expect.arrayContaining(['igl_none']));
    expect(keys).not.toEqual(expect.arrayContaining(['awp_none']));
    expect(synergyOf(input).find((line) => line.key === 'igl_hybrid')!.mental).toBe(0.75);
    expect(styleReady({ ...input, style: 'tactical' })).toBe(true);
    expect(toSelectedPlayer(hybrid.id, 'awper-igl')).toEqual({ playerId: hybrid.id, selectedSlotRole: 'awper', secondarySlotRole: 'igl' });
    expect(collectionRoleOf(toSelectedPlayer(hybrid.id, 'awper-igl'))).toBe('awper-igl');
    expect(collectionRoleOf(toSelectedPlayer(hybrid.id, 'awper'))).toBe('awper');
    // Star no híbrido vale, com metade da linha de AWPer (tático: 3 × 1,2 de escala aos 92 × 0,5 = 1,75 arredondado em 0,25).
    const star = { ...hybrid, overall: 92 };
    const starred = { players: [star, ...team.slice(1)], roles: [...teamRoles], starPlayerId: star.id, style: 'tactical' as const };
    const lines = Object.fromEntries(synergyOf(starred).map((line) => [line.key, line.power]));
    expect(lines).toMatchObject({ star: 2, star_awper_igl: 1.75 });
    // Só de AWPer o time fica sem caller: o tático não roda e o star cai na linha do equilibrado (1,5 × 1,2).
    const pure = Object.fromEntries(synergyOf({ ...starred, roles: ['awper', 'entry', 'lurker', 'support', 'rifler'] }).map((line) => [line.key, line.power]));
    expect(pure).toMatchObject({ style_tactical_off: PLAN_OFF_BONUS, star_awper: 1.75 });
  });

  it('boost do star: toda função ganha em todo plano, cada uma com o seu, escalado pelo overall', () => {
    const starLine = (role: 'awper' | 'entry' | 'rifler' | 'lurker', style: OrgStyle, overall = 90) => {
      const star = { ...pick(role === 'rifler' ? 'lurker' : role), overall };
      const slot = lineup.findIndex((player) => player.id === star.id);
      const teamRoles = roles.map((item, index) => (index === slot ? role : item));
      // Os outros ficam abaixo do star (ele é top-2 mesmo aos 84) e o IGL chama bem: todo plano roda.
      const team = lineup.map((player) => (player.id === star.id ? star : { ...player, overall: 80, igl: player.id === pick('igl').id ? 90 : player.igl }));
      const lines = synergyOf({ players: team, roles: teamRoles, starPlayerId: star.id, style });
      expect(lines.find((line) => line.key === 'star')?.power).toBe(2);
      return lines.find((line) => line.key === `star_${role}`)!.power;
    };
    for (const role of ['awper', 'entry', 'rifler', 'lurker'] as const) {
      for (const style of ['aggressive', 'balanced', 'tactical'] as const) {
        expect(starLine(role, style)).toBe(STAR_ROLE_BONUS[role][style]);
        expect(starLine(role, style)).toBeGreaterThan(0);
        expect(starLine(role, style, 96)).toBeGreaterThan(starLine(role, style, 90));
        expect(starLine(role, style, 84)).toBeLessThan(starLine(role, style, 90));
      }
    }
    // Cada função tem o seu plano: entry no agressivo, rifler no equilibrado, AWPer e lurker no tático.
    const bestStyle = (role: 'awper' | 'entry' | 'rifler' | 'lurker') => (['aggressive', 'balanced', 'tactical'] as const).reduce((best, style) => (STAR_ROLE_BONUS[role][style] > STAR_ROLE_BONUS[role][best] ? style : best));
    expect([bestStyle('entry'), bestStyle('rifler'), bestStyle('awper'), bestStyle('lurker')]).toEqual(['aggressive', 'balanced', 'tactical', 'tactical']);
    expect([starScale(80), starScale(85), starScale(90), starScale(95), starScale(99)]).toEqual([0.5, 0.5, 1, 1.5, 1.5]);
  });

  it('os três planos têm o mesmo teto, e o quanto cada um rende sai das cartas', () => {
    const base = { roles, starPlayerId: null, coachId: null };
    const shaped = (over: { entry?: number; igl?: number; consistency?: number }) => lineup.map((player) => ({
      ...player,
      ...(over.consistency !== undefined ? { consistency: over.consistency } : {}),
      ...(player.id === pick('entry').id && over.entry !== undefined ? { entry: over.entry } : {}),
      ...(player.id === pick('igl').id && over.igl !== undefined ? { igl: over.igl } : {})
    }));
    // Agressivo: do entry. Tático: do capitão (e do coach). Equilibrado: do elo mais fraco.
    expect(planBonus({ ...base, players: shaped({ entry: 70 }), style: 'aggressive' })).toBe(PLAN_BONUS_MIN);
    expect(planBonus({ ...base, players: shaped({ entry: 85 }), style: 'aggressive' })).toBe((PLAN_BONUS_MIN + PLAN_BONUS_MAX) / 2);
    expect(planBonus({ ...base, players: shaped({ entry: 99 }), style: 'aggressive' })).toBe(PLAN_BONUS_MAX);
    expect(planBonus({ ...base, players: shaped({ igl: 75 }), style: 'tactical' })).toBe(PLAN_BONUS_MIN);
    expect(planBonus({ ...base, players: shaped({ igl: 99 }), style: 'tactical' })).toBeLessThan(PLAN_BONUS_MAX);
    expect(planBonus({ ...base, players: shaped({ consistency: 70 }), style: 'balanced' })).toBe(BALANCED_PLAN_MIN);
    expect(planBonus({ ...base, players: shaped({ consistency: 95 }), style: 'balanced' })).toBe(BALANCED_PLAN_MAX);
    // O teto do tático só fecha com um coach de verdade no banco.
    const topCoach = [...collectionCoachById.values()].sort((a, b) => b.tactics - a.tactics)[0];
    expect(planBonus({ ...base, players: shaped({ igl: 99 }), style: 'tactical', coachId: topCoach.id })).toBe(PLAN_BONUS_MAX);
    // Quem não pede nada começa um pouco acima e termina um pouco abaixo dos planos de especialista.
    expect(BALANCED_PLAN_MIN).toBeGreaterThan(PLAN_BONUS_MIN);
    expect(BALANCED_PLAN_MAX).toBeLessThan(PLAN_BONUS_MAX);
    expect(planQuality({ ...base, players: shaped({ entry: 85 }), style: 'aggressive' })).toBeCloseTo(0.5, 10);
  });

  it('plano que o time não consegue rodar rende menos que qualquer plano rodado', () => {
    const noEntry = synergyOf({ players: lineup, roles: ['igl', 'awper', 'rifler', 'lurker', 'support'], starPlayerId: null, style: 'aggressive' });
    expect(noEntry.find((line) => line.key === 'style_aggressive_off')?.power).toBe(PLAN_OFF_BONUS);
    expect(PLAN_OFF_BONUS).toBeLessThan(PLAN_BONUS_MIN);
    expect(PLAN_OFF_BONUS).toBeLessThan(BALANCED_PLAN_MIN);
  });

  it('o que falta ao time é pago em pontos de quadra: dói igual no time fraco e no time de GOATs', () => {
    const riflers = distinct(byRole('rifler', 8)).slice(0, 5);
    const lines = synergyOf({ players: riflers, roles: ['rifler', 'rifler', 'rifler', 'rifler', 'rifler'], starPlayerId: null, style: 'balanced' });
    expect(lines.find((line) => line.key === 'igl_none')).toMatchObject({ court: MISSING_IGL_COURT, power: 0 });
    expect(lines.find((line) => line.key === 'awp_none')).toMatchObject({ court: MISSING_AWPER_COURT, power: 0 });
    expect(lines.find((line) => line.key === 'support_none')).toMatchObject({ court: MISSING_SUPPORT_COURT, power: 0 });
    const missing = MISSING_IGL_COURT + MISSING_AWPER_COURT + MISSING_SUPPORT_COURT;
    const input = { players: riflers, roles: ['rifler', 'rifler', 'rifler', 'rifler', 'rifler'] as LineupSlotRole[], starPlayerId: null, style: 'balanced' as const };
    const percent = 1 + lines.reduce((sum, line) => sum + line.power, 0) / 100;
    for (const power of [80, 95, 110, 130]) {
      const team = applyCollectionLineup({ id: 't', name: 't', power, mental: 80, clutch: 80, experience: 80 }, input);
      expect(courtPower(team.power) - courtPower(power * percent)).toBeCloseTo(missing, 9);
    }
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
