// tests/botField.test.ts
// Campo de bots do online: buff por colocação em Major, campeões garantidos e as zebras da run.
import { COURT_SPREAD, COURT_TOP, courtPower } from '../src/lib/game/courtPower';
import { PLAYER_GAP_FROM_TOP } from '../src/lib/game/balance';
import { describe, expect, it } from 'vitest';
import { teams, players } from '../server/data';
import { BOT_LEVEL_BAND, GUARANTEED_CHAMPIONS, ZEBRAS_MAX, ZEBRAS_MIN, botFieldPower, botPlacementOf, isUnderdogAverage, isZebraCandidate, planBotField, rosterAverageOverall } from '../src/lib/game/online/bot-field';
import { ZEBRA_LEVEL_CAP, ZEBRA_LIFT_COURT } from '../src/lib/game/balance';
import { createSeededRng } from '../src/lib/game/simulation';
import type { HistoricalTeam } from '../src/lib/game/types';

const playerById = new Map(players.map((player) => [player.id, player]));
const shuffle = (seed: string) => [...teams].sort((left, right) => createSeededRng(`${seed}:bot:${left.id}`)() - createSeededRng(`${seed}:bot:${right.id}`)() || left.id.localeCompare(right.id));
const team = (summary: HistoricalTeam['majorSummary']): HistoricalTeam => ({ id: 't', majorSummary: summary });

describe('escada de progressão dos bots', () => {
  it('vale a melhor colocação do time em Major', () => {
    expect(botPlacementOf(team({ titles: 1, finals: 2, semifinals: 3, top8: 4 }))).toBe('champion');
    expect(botPlacementOf(team({ titles: 0, finals: 1, top8: 3 }))).toBe('finalist');
    expect(botPlacementOf(team({ semifinals: 1 }))).toBe('semifinal');
    expect(botPlacementOf(team({ top8: 2 }))).toBe('top8');
    expect(botPlacementOf(team({ stage3Runs: 4 }))).toBe('none');
    expect(botPlacementOf(team(null))).toBe('none');
  });

  it('cada faixa do chaveamento é mais dura que a anterior', () => {
    const { champion, finalist, semifinal, top8, none } = BOT_LEVEL_BAND;
    for (const [acima, abaixo] of [[champion, finalist], [finalist, semifinal], [semifinal, top8], [top8, none]] as const) {
      expect(acima[0]).toBeGreaterThan(abaixo[0]);
      expect(acima[1]).toBeGreaterThan(abaixo[1]);
    }
    // Nenhuma faixa alcança o topo da escala: bot nunca é favorito contra uma line perfeita.
    expect(champion[1]).toBeLessThan(COURT_TOP);
  });

  it('a régua de cada pedigree cobre o dataset de verdade', async () => {
    // BOT_NATURAL_RANGE é medido no conteúdo. Se uma carta ou um time novo empurrar algum grupo para fora destes
    // limites, o bot ficaria grudado na ponta da faixa e o elenco dele pararia de contar: aqui isso falha alto.
    const { players: corePlayers, teams: coreTeams } = await import('../server/data');
    const { calculateHistoricalTeamPower } = await import('../src/lib/game/simulation');
    const { BOT_NATURAL_RANGE } = await import('../src/lib/game/balance');
    const porGrupo = new Map<string, number[]>();
    for (const historical of coreTeams) {
      if (!(historical.players ?? []).length) continue;
      const natural = courtPower(calculateHistoricalTeamPower(historical as never, corePlayers).power);
      const grupo = botPlacementOf(historical as never);
      porGrupo.set(grupo, [...(porGrupo.get(grupo) ?? []), natural]);
    }
    for (const [grupo, niveis] of porGrupo) {
      const [min, max] = BOT_NATURAL_RANGE[grupo as keyof typeof BOT_NATURAL_RANGE];
      expect(Math.min(...niveis), `${grupo}: o mais fraco mede ${Math.min(...niveis).toFixed(1)}, a régua começa em ${min}`).toBeGreaterThanOrEqual(min - 0.5);
      expect(Math.max(...niveis), `${grupo}: o mais forte mede ${Math.max(...niveis).toFixed(1)}, a régua termina em ${max}`).toBeLessThanOrEqual(max + 0.5);
    }
  });

  it('entre campeões de Major, elenco melhor vale nível', async () => {
    const { players: corePlayers, teams: coreTeams } = await import('../server/data');
    const { calculateHistoricalTeamPower } = await import('../src/lib/game/simulation');
    const nivelDe = (id: string) => {
      const historical = coreTeams.find((item) => item.id === id)!;
      return courtPower(botFieldPower(calculateHistoricalTeamPower(historical as never, corePlayers).power, historical as never, false));
    };
    // O caso do dono: Astralis 2018 (elenco 95,2) tem que ser claramente mais forte que Cloud9 2018 (90,4).
    expect(nivelDe('astralis-2018') - nivelDe('cloud9-2018')).toBeGreaterThan(1);
  });

  it('dentro da faixa, quem manda é o elenco: dois times do mesmo pedigree não jogam igual', () => {
    const fraco = courtPower(botFieldPower(75, team(null), false));
    const forte = courtPower(botFieldPower(100, team(null), false));
    expect(forte).toBeGreaterThan(fraco);
    // E os dois ficam dentro da faixa combinada para quem não tem história de Major.
    for (const nivel of [fraco, forte]) {
      expect(nivel).toBeGreaterThanOrEqual(BOT_LEVEL_BAND.none[0] - 1e-9);
      expect(nivel).toBeLessThanOrEqual(BOT_LEVEL_BAND.none[1] + 1e-9);
    }
  });

  it('um campeão de Major com elenco fraco ainda é parede, e nenhum bot passa da própria faixa', () => {
    const campeaoFraco = courtPower(botFieldPower(70, team({ titles: 1 }), false));
    expect(campeaoFraco).toBeGreaterThanOrEqual(BOT_LEVEL_BAND.champion[0] - 1e-9);
    const semHistoriaForte = courtPower(botFieldPower(106, team(null), false));
    expect(semHistoriaForte).toBeLessThanOrEqual(BOT_LEVEL_BAND.none[1] + 1e-9);
  });

  it('o time sem história é o degrau de entrada: vencível, mas não de graça', () => {
    const entrada = courtPower(botFieldPower(82, team(null), false));
    const campeao = courtPower(botFieldPower(82, team({ titles: 1 }), false));
    expect(campeao - entrada).toBeGreaterThan(4);
    // E o degrau de entrada fica abaixo do piso do jogador: quem acabou de criar a conta entra como favorito nele.
    expect(entrada).toBeLessThan(COURT_TOP - PLAYER_GAP_FROM_TOP);
  });
});

describe('zebra', () => {
  it('underdog é elenco de overall médio entre 80 e 89', () => {
    expect([79.9, 80, 85, 89.9, 90].map(isUnderdogAverage)).toEqual([false, true, true, true, false]);
    expect(rosterAverageOverall({ players: [] }, playerById)).toBe(0);
  });

  it('só vira zebra quem é underdog e nunca chegou a uma semifinal de Major', () => {
    const candidates = teams.filter((item) => isZebraCandidate(item, playerById));
    expect(candidates.length).toBeGreaterThan(40);
    for (const item of candidates) {
      expect(isUnderdogAverage(rosterAverageOverall(item, playerById))).toBe(true);
      expect(['none', 'top8']).toContain(botPlacementOf(item));
    }
  });

  it('o gás da zebra soma em níveis e nunca enfraquece o time', () => {
    const underdog = team(null);
    // Em cima da faixa do pedigree dela, some — nunca subtrai (a conta em % de poder cru já derrubou bot fraco).
    for (const power of [75, 90, 106]) {
      const normal = courtPower(botFieldPower(power, underdog, false));
      const zebra = courtPower(botFieldPower(power, underdog, true));
      expect(zebra).toBeGreaterThan(normal);
      expect(zebra - normal).toBeCloseTo(Math.min(ZEBRA_LIFT_COURT, ZEBRA_LEVEL_CAP - normal), 9);
    }
    // E o teto vale: nem a zebra mais embalada passa dele.
    expect(courtPower(botFieldPower(106, team({ titles: 1 }), true))).toBeLessThanOrEqual(ZEBRA_LEVEL_CAP + 1e-9);
  });
});

describe('campo da run', () => {
  it('campo cheio tem sempre os campeões garantidos e de uma a três zebras', () => {
    const counts = new Set<number>();
    for (let index = 0; index < 300; index += 1) {
      const seed = `run-${index}`;
      const plan = planBotField({ shuffled: shuffle(seed), playerById, seed, slots: 15 });
      const opening = plan.order.slice(0, 15);
      expect(opening.filter((item) => botPlacementOf(item) === 'champion').length).toBeGreaterThanOrEqual(GUARANTEED_CHAMPIONS);
      expect(plan.zebraIds.size).toBeGreaterThanOrEqual(ZEBRAS_MIN);
      expect(plan.zebraIds.size).toBeLessThanOrEqual(ZEBRAS_MAX);
      for (const id of plan.zebraIds) expect(opening.some((item) => item.id === id)).toBe(true);
      counts.add(plan.zebraIds.size);
    }
    // A seed varia a quantidade: não é sempre o mesmo número de zebras.
    expect([...counts].sort()).toEqual([ZEBRAS_MIN, ZEBRAS_MAX]);
  });

  it('é determinístico, não perde nem repete time, e o resto segue a ordem sorteada', () => {
    const shuffled = shuffle('fixa');
    const first = planBotField({ shuffled, playerById, seed: 'fixa', slots: 15 });
    const again = planBotField({ shuffled, playerById, seed: 'fixa', slots: 15 });
    expect(first.order.map((item) => item.id)).toEqual(again.order.map((item) => item.id));
    expect([...first.zebraIds]).toEqual([...again.zebraIds]);
    expect(first.order).toHaveLength(teams.length);
    expect(new Set(first.order.map((item) => item.id)).size).toBe(teams.length);
    const position = new Map(shuffled.map((item, index) => [item.id, index]));
    const tail = first.order.slice(15).map((item) => position.get(item.id)!);
    expect(tail).toEqual([...tail].sort((a, b) => a - b));
  });

  it('campo pequeno divide as vagas: no máximo um quarto para cada garantia', () => {
    for (const slots of [0, 1, 2, 3, 4, 7]) {
      const plan = planBotField({ shuffled: shuffle(`p${slots}`), playerById, seed: `p${slots}`, slots });
      expect(plan.zebraIds.size).toBeLessThanOrEqual(Math.floor(slots / 4));
      expect(plan.order).toHaveLength(teams.length);
    }
    expect(planBotField({ shuffled: shuffle('q'), playerById, seed: 'q', slots: 3 }).zebraIds.size).toBe(0);
    expect(planBotField({ shuffled: shuffle('q'), playerById, seed: 'q', slots: 4 }).zebraIds.size).toBe(1);
  });
});
