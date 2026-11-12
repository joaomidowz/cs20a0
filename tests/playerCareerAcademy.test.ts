// tests/playerCareerAcademy.test.ts
// Fase 2: a base dos times principais (academia ligada ao time de cima): começar na base, ser promovido quando está
// pronto, ir emprestado para ganhar minutos e voltar. Fase 3: contratos dos jogadores do mundo (fim de contrato vira free
// agent quando o time não renova), só a partir da temporada guardada no save.
import { describe, expect, it } from 'vitest';
import {
  acceptOffer, ACADEMY_MAX_AGE, createPlayerCareer, decentRatingFor, drawStartingOptions, finishSeason, recordEventResult, startSeason,
  starRatingFor, stayAtOrg, type PlayerCareerState
} from '../src/lib/game/playerCareer/engine';
import { academiesOf, academyIds, academyParentOf, sceneOrgById, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { benchIn, npcContractIn, registerBenchStart, registerContractStart, worldHistory, worldRosters, freeAgentsIn } from '../src/lib/game/playerCareer/world';

const MIBR_ACADEMY = 'mibr-academy-2026';

/** Uma carreira na base (contrato de base até a temporada 3), com a temporada aberta. */
function inAcademy(seed: string, extra: Partial<PlayerCareerState> = {}): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'base', country: 'Brazil', role: 'rifler', seed });
  return startSeason({
    ...base, orgId: MIBR_ACADEMY, pendingDraw: null, drawDone: true, seatsTaken: [], age: 18,
    contract: { orgId: MIBR_ACADEMY, from: 1, until: 3, salaryUsd: 600, buyoutUsd: 100000 }, ...extra
  });
}

function played(state: PlayerCareerState, rating: number, titles = 0): PlayerCareerState {
  let next = state.calendar ? state : startSeason(state);
  next.calendar!.forEach((entry, index) => {
    next = recordEventResult(next, entry.index, { name: entry.name, placement: index < titles ? 'Campeão' : 'Quartas', rating, seriesWins: 1, seriesLosses: 1 });
  });
  return next;
}

describe('base dos times principais (fase 2)', () => {
  it('as academias estão ligadas ao time principal (MOUZ NXT → MOUZ, NAVI Junior → NAVI, MIBR Academy → MIBR)', () => {
    expect(academyParentOf('mouz-nxt-2026-11')).toBe('mouz-2026');
    expect(academyParentOf('navi-junior-2026')).toBe('natus-vincere-2026');
    expect(academyParentOf(MIBR_ACADEMY)).toBe('mibr-2026');
    expect(academiesOf('spirit-2026')).toHaveLength(2);
    expect(academyParentOf('mibr-2026')).toBeNull();
    for (const id of academyIds()) expect(sceneOrgById.has(academyParentOf(id)!)).toBe(true);
  });

  it('o sorteio oferece a base de um time principal da sua região para quem começa com até 18 anos', () => {
    const young = drawStartingOptions('base-sorteio', 'Brazil', 'rifler', 17);
    const academy = young.find((option) => option.academyOf);
    expect(academy).toBeDefined();
    expect(sceneOrgById.get(academyParentOf(academy!.orgId)!)?.name).toBe(academy!.academyOf);
    expect(sceneOrgById.get(academy!.orgId)?.region).toBe('sa');
    expect(drawStartingOptions('base-sorteio', 'Brazil', 'rifler', 20).some((option) => option.academyOf)).toBe(false);
    // As outras opções do sorteio não mudam com a base (sorteio à parte).
    const withoutAge = drawStartingOptions('base-sorteio', 'Brazil', 'rifler');
    expect(young.filter((option) => !option.academyOf).map((option) => option.orgId)).toEqual(withoutAge.map((option) => option.orgId));
  });

  it('pronto: o time principal sobe você da base com contrato novo', () => {
    const state = inAcademy('base-promocao');
    const done = finishSeason(played(state, starRatingFor(state.role, 3) + 0.05, 2));
    const promotion = done.pendingOffers?.find((offer) => offer.kind === 'promotion');
    expect(promotion).toMatchObject({ orgId: 'mibr-2026' });
    const promoted = acceptOffer(done, 'mibr-2026');
    expect(promoted.orgId).toBe('mibr-2026');
    expect(promoted.contract).toMatchObject({ orgId: 'mibr-2026', from: done.seasonNumber });
    expect(promoted.loan).toBeNull();
  });

  it('sem subir: às vezes a base empresta por uma temporada; o contrato segue com a base e o salário vem dela', () => {
    let loaned = 0;
    for (let index = 0; index < 16; index += 1) {
      const state = inAcademy(`base-emprestimo-${index}`);
      const done = finishSeason(played(state, decentRatingFor(state.role, 4) + 0.01));
      const loan = done.pendingOffers?.find((offer) => offer.kind === 'loan');
      if (!loan) continue;
      loaned += 1;
      expect(academyParentOf(loan.orgId)).toBeNull();
      expect(sceneOrgById.get(loan.orgId)?.level).toBe(3);
      const away = acceptOffer(done, loan.orgId);
      expect(away).toMatchObject({ orgId: loan.orgId, loan: { fromOrgId: MIBR_ACADEMY, until: done.seasonNumber } });
      expect(away.contract?.orgId).toBe(MIBR_ACADEMY);
      // Fim do empréstimo: volta para a base (ficar = voltar), e o salário do ano veio da base.
      const back = finishSeason(played(away, decentRatingFor(away.role, 3) - 0.02));
      expect(back.pendingOffers?.some((offer) => offer.kind === 'return' && offer.orgId === MIBR_ACADEMY)).toBe(true);
      expect(back.history.at(-1)?.salaryPaid).toBe(600 * 12);
      const home = stayAtOrg(back);
      expect(home).toMatchObject({ orgId: MIBR_ACADEMY, loan: null });
      expect(home.contract?.orgId).toBe(MIBR_ACADEMY);
    }
    expect(loaned).toBeGreaterThan(0);
  });

  it('a base só renova com quem ainda é jovem: passou da idade, ou sobe ou procura time', () => {
    const old = inAcademy('base-velho', { age: ACADEMY_MAX_AGE + 2, contract: { orgId: MIBR_ACADEMY, from: 1, until: 1, salaryUsd: 600, buyoutUsd: 100000 } });
    const done = finishSeason(played(old, decentRatingFor(old.role, 4) + 0.02));
    expect(done.pendingOffers?.some((offer) => offer.kind === 'renewal')).toBe(false);
    expect(done.released || done.pendingOffers?.some((offer) => offer.kind === 'promotion')).toBe(true);
  });
});

describe('contratos dos jogadores do mundo (fase 3)', () => {
  it('todo titular tem contrato: na cena de 2026 falta de 1 a 3 temporadas, e ele segue até acabar', () => {
    const seed = 'mundo-contratos';
    const rosters = worldRosters(seed, 1);
    for (const [orgId, roster] of [...rosters].slice(0, 40)) {
      for (const member of roster) {
        const contract = npcContractIn(seed, 1, member);
        expect(contract?.orgId).toBe(orgId);
        expect(contract!.until).toBeGreaterThanOrEqual(1);
        expect(contract!.until).toBeLessThanOrEqual(3);
      }
    }
    const [orgId, roster] = [...rosters][0];
    const long = roster.find((member) => (npcContractIn(seed, 1, member)?.until ?? 0) >= 2);
    if (long && worldRosters(seed, 2).get(orgId)?.includes(long)) expect(npcContractIn(seed, 2, long)).toEqual(npcContractIn(seed, 1, long));
  });

  it('sem registro o fim de contrato não mexe em elenco; com o banco ligado, quem não renova vira free agent', () => {
    expect([2, 3, 4].every((season) => !worldHistory('mundo-sem-registro', season).benchMoves.some((move) => move.kind === 'contractEnd'))).toBe(true);
    let ended = 0;
    for (let index = 0; index < 6; index += 1) {
      const seed = `mundo-fim-contrato-${index}`;
      registerBenchStart(seed, 2);
      registerContractStart(seed, 2);
      try {
        for (let season = 2; season <= 4; season += 1) {
          for (const move of worldHistory(seed, season).benchMoves.filter((entry) => entry.kind === 'contractEnd')) {
            ended += 1;
            const roster = worldRosters(seed, season).get(move.orgId!) ?? [];
            expect(roster).toHaveLength(5);
            expect(roster.some((member) => member.nick.toLowerCase() === move.nick.toLowerCase())).toBe(false);
            // Quem entrou está no time (ou perdeu a vaga de novo na mesma virada: no banco ou sem time), nunca sumido.
            const incoming = move.swappedNick!.toLowerCase();
            const somewhere = roster.some((member) => member.nick.toLowerCase() === incoming)
              || sceneOrgs.some((org) => benchIn(seed, season, org.id).some((entry) => entry.member.nick.toLowerCase() === incoming))
              || freeAgentsIn(seed, season).some((entry) => entry.member.nick.toLowerCase() === incoming)
              || [...worldRosters(seed, season).values()].some((other) => other.some((member) => member.nick.toLowerCase() === incoming));
            expect(somewhere).toBe(true);
          }
          for (const roster of worldRosters(seed, season).values()) expect(roster).toHaveLength(5);
          expect(freeAgentsIn(seed, season).length).toBeGreaterThan(0);
        }
      } finally {
        registerBenchStart(seed, undefined);
        registerContractStart(seed, undefined);
      }
    }
    expect(ended).toBeGreaterThan(5);
  }, 120000);

  it('o mundo inteiro tem contrato (nenhum titular sem)', () => {
    const seed = 'mundo-todos';
    for (const roster of worldRosters(seed, 2).values()) for (const member of roster) if (!member.careerMade) expect(npcContractIn(seed, 2, member)).not.toBeNull();
    expect(sceneOrgs.length).toBeGreaterThan(100);
  });
});
