// Contrato de balance dos planos (2026-09-23): a tabela 6x6 medida no motor real, na cadeia do servidor.
// Valores medidos com scripts/tmp-plan-*.ts (N=500 BO3, escala court, builds GOAT com coach NaVi 2021) — o
// rebalance "meta plano": tático de volta (estudo do coach + pausa de fila PRO), resiliente contido (60%→53%),
// agressivo com dia bom de 42.5%, equilibrado com pistola/carry/zebra fraca. Bandas ±6-7pp em N=300.
import { describe, expect, it } from 'vitest';
import { labLineup, winRate, type LabBuild } from './helpers/balanceLab';
import { applyCoachToTeam } from '../src/lib/game/dynasty/coach';
import { timeoutBonus } from '../src/lib/game/rounds';
import { createSeededRng, getMatchDayPower, getWinProbability } from '../src/lib/game/simulation';
import type { CombatTeam, OrgStyle, OnlineGameMode } from '../src/lib/game/types';

const IDS = ['fallen-2019', 'coldzera-2017', 's1mple-2021', 'donk-2024', 'jl-2024'];
const ROLES: LabBuild['roles'] = ['igl', 'awper', 'rifler', 'entry', 'support'];
const COACH = 'coach-natus-vincere-2021';
const STARS: Record<OrgStyle, string | null> = {
  aggressive: 'donk-2024',
  balanced: 'donk-2024',
  tactical: 'coldzera-2017',
  tempo: 'donk-2024',
  reativo: 'coldzera-2017',
  resiliente: 'coldzera-2017'
};
const build = (style: OrgStyle): LabBuild => ({ name: `plano-${style}`, ids: [...IDS], roles: [...ROLES], style, star: STARS[style], coachId: COACH });

const labSides = new Map(Object.entries({
  aggressive: labLineup(build('aggressive')),
  balanced: labLineup(build('balanced')),
  tactical: labLineup(build('tactical')),
  tempo: labLineup(build('tempo')),
  reativo: labLineup(build('reativo')),
  resiliente: labLineup(build('resiliente'))
}) as Array<[OrgStyle, ReturnType<typeof labLineup>]>);

// 2026-09-27 (teto macio): os planos deixaram de empatar em 99 exato — cada um tem o seu nível (99,1–99,3) — e com
// 300 séries o ruído de ±7pp passava da banda. Com 600 a tabela mediu 46–54 em todos os cruzamentos, dentro dos alvos.
const band = (a: OrgStyle, b: OrgStyle, target: number, tolerance = 6) => {
  const rate = winRate(labSides.get(a)!, labSides.get(b)!, 'court', 600);
  expect(rate, `${a} vs ${b} mediu ${rate}%, esperado ~${target}%`).toBeGreaterThanOrEqual(target - tolerance);
  expect(rate, `${a} vs ${b} mediu ${rate}%, esperado ~${target}%`).toBeLessThanOrEqual(target + tolerance);
};

describe('contrato de balance: tabela dos planos (2026-09-23)', () => {
  // 15 cruzamentos × 300 séries passam de 5 s com a máquina ocupada (suíte inteira + build): timeout próprio.
  it('nenhum confronto entre planos do mesmo patamar vira atropelo', { timeout: 60_000 }, () => {
    const styles: OrgStyle[] = ['aggressive', 'balanced', 'tactical', 'tempo', 'reativo', 'resiliente'];
    for (let index = 0; index < styles.length; index += 1) {
      for (let other = index + 1; other < styles.length; other += 1) {
        const rate = winRate(labSides.get(styles[index])!, labSides.get(styles[other])!, 'court', 300);
        expect(rate, `${styles[index]} vs ${styles[other]} mediu ${rate}%`).toBeGreaterThanOrEqual(38);
        expect(rate, `${styles[index]} vs ${styles[other]} mediu ${rate}%`).toBeLessThanOrEqual(62);
      }
    }
  });

  it('o plano tático voltou ao jogo (estudo do coach + pausa forte)', () => {
    band('tactical', 'aggressive', 53);
    band('tactical', 'reativo', 53);
  });

  it('o resiliente não domina mais: contido em ~50 contra o campo', () => {
    band('resiliente', 'tactical', 47);
    band('resiliente', 'tempo', 49);
    band('aggressive', 'resiliente', 50);
  });

  it('o equilibrado é o antídoto: counter do resiliente (54%) e paridade com o tempo', () => {
    band('balanced', 'resiliente', 54);
    band('balanced', 'tempo', 51);
  });
});

describe('contrato de fonte: os dials do rebalance (2026-09-23)', () => {
  const base = (style: OrgStyle, power = 90, overall = 90): CombatTeam => ({
    id: 'a', name: 'a', power, mental: 85, clutch: 85, experience: 85, consistency: 85, overallAvg: overall, style
  });
  const coachOf = (tactics: number) => ({
    id: 'c', baseId: 'c', name: 'c', teamId: 't', year: 2026, game: 'cs' as const, tactics, discipline: 70,
    aggression: 70, development: 70, overall: tactics, rarity: 'legend', confidence: 'high' as const,
    needsReview: false, source: { page: null, url: null, year: 2026, note: 'test' }
  });

  it('o estudo do time vem do coach: tactics 98 → estudo 98, tactics 70 → 60', () => {
    const team: CombatTeam = { id: 'a', name: 'a', power: 90, mental: 85, clutch: 85, experience: 85 };
    expect(applyCoachToTeam(team, coachOf(98)).studyPercentage).toBe(98);
    expect(applyCoachToTeam(team, coachOf(70)).studyPercentage).toBe(60);
  });

  it('o dia bom do agressivo: ~42.5% com elenco instável, até ~51.5% com consistência 100 (agressão 94); o do tempo segue em ~29%', () => {
    const countDays = (style: OrgStyle, aggression: number, consistency = 85) => {
      let days = 0;
      for (let seed = 0; seed < 1000; seed += 1) {
        const team = { ...base(style), aggressionPercentage: aggression, consistency };
        if (getMatchDayPower(team, createSeededRng(`dia-${style}-${seed}`)) > 90 * 1.03) days += 1;
      }
      return days / 1000;
    };
    // Consistência ajuda o Agressivo (dono, 2026-09-28): 70 = sem ajuda (teto 42,5%), 85 = metade, 100 = teto 51,5%.
    const shaky = countDays('aggressive', 94, 70);
    expect(shaky).toBeGreaterThanOrEqual(0.36);
    expect(shaky).toBeLessThanOrEqual(0.49);
    const steady = countDays('aggressive', 94, 100);
    expect(steady).toBeGreaterThanOrEqual(0.45);
    expect(steady).toBeLessThanOrEqual(0.58);
    expect(steady).toBeGreaterThan(shaky);
    const middle = countDays('aggressive', 94, 85);
    expect(middle).toBeGreaterThan(shaky - 0.02);
    expect(middle).toBeLessThan(steady + 0.02);
    // A consistência não mexe no Tempo.
    const tempo = countDays('tempo', 94, 100);
    expect(tempo).toBeGreaterThanOrEqual(0.24);
    expect(tempo).toBeLessThanOrEqual(0.35);
  });

  it('a zebra: resiliente resgata até 2% atrás por 4+ pontos; equilibrado, 1% por 6+', () => {
    const weaker = (style: OrgStyle): CombatTeam => ({ ...base(style), power: 84, overallAvg: 84 });
    const stronger = base('tempo', 92, 94);
    const neutralPair = getWinProbability(weaker('aggressive'), stronger);
    const resilientePair = getWinProbability(weaker('resiliente'), stronger);
    const balancedPair = getWinProbability(weaker('balanced'), stronger);
    expect(resilientePair - neutralPair).toBeCloseTo(0.02, 5);
    expect(balancedPair - neutralPair).toBeCloseTo(0.01, 5);
  });

  it('a pausa tática vale fila PRO em qualquer fila (0.08); os outros planos seguem o modo', () => {
    const mode: OnlineGameMode = 'premier';
    expect(timeoutBonus(mode, 'window', 'tactical')).toBeCloseTo(0.08, 5);
    expect(timeoutBonus(mode, 'window', 'aggressive')).toBeCloseTo(0.03, 5);
  });
});
