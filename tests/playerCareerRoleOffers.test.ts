// tests/playerCareerRoleOffers.test.ts
// Proposta de função com motivo: vaga, titular em má fase, você rendendo pouco ou veterano para as calls. O texto diz o
// motivo; aceitar troca as funções com o colega; uma por temporada; os acontecimentos antigos de IGL saíram do sorteio.
import { describe, expect, it } from 'vitest';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { createPlayerCareer, recordEventResult, seatToTake, startSeason, type PlayerCareerState, type PlayerRole, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { pendingHappeningView, resolveHappening, roleMoveOf, rollHappening, ROLE_OFFER_ID } from '../src/lib/game/playerCareer/happenings';
import { answerRoleOffer, roleOfferFor } from '../src/lib/game/playerCareer/roleOffers';
import { matesOf } from '../src/lib/game/playerCareer/squad';

const careerAs = (role: PlayerRole, seed: string, orgId = sceneOrgs.find((org) => org.level === 1)!.id): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role, seed });
  // A vaga que você tomou fica registrada, como no jogo (é ela que diz quem saiu do time).
  const org = sceneOrgs.find((candidate) => candidate.id === orgId);
  const seatsTaken = org ? [{ ...seatToTake(org, role), season: 1 }] : [];
  return startSeason({ ...base, orgId, pendingDraw: null, drawDone: true, seatsTaken });
};

/** Joga os dois primeiros campeonatos com as linhas dadas (rating por nick; quem faltar joga 1,05). */
function playTwo(state: PlayerCareerState, ratings: Record<string, number>, mine = 1.05): PlayerCareerState {
  const team = [state.nick, ...matesOf(state).map((mate) => mate.player.nickname ?? '')];
  return state.calendar!.slice(0, 2).reduce((next, entry) => recordEventResult(next, entry.index, {
    name: entry.name, placement: 'Quartas', rating: mine, seriesWins: 1, seriesLosses: 1, tier: entry.tier,
    lines: team.map((nick) => ({ nick, orgId: next.orgId, rating: nick === next.nick ? mine : ratings[nick] ?? 1.05, rounds: 60 }))
  } as TournamentResult), state);
}

const slumping = (seed: string) => {
  const start = careerAs('entry', seed);
  const nick = matesOf(start).find((mate) => mate.player.role === 'lurker')!.player.nickname!;
  return { state: playTwo(start, { [nick]: 0.8 }), nick };
};

describe('proposta de função com motivo', () => {
  it('titular em má fase: o pior do time nos dois campeonatos, com nome e rating no texto', () => {
    const { state, nick } = slumping('offer-slump');
    const offer = roleOfferFor(state)!;
    expect(offer).toMatchObject({ role: 'lurker', motive: 'ma-fase', mateNick: nick });
    expect(offer.text).toContain(nick);
    expect(offer.text).toContain('0,80');
  });

  it('sem motivo, sem proposta: o time inteiro jogando bem', () => {
    expect(roleOfferFor(playTwo(careerAs('entry', 'offer-none'), {}))).toBeNull();
  });

  it('aceitar troca: você vai para a função e o colega para a sua antiga; uma por temporada', () => {
    const { state, nick } = slumping('offer-swap');
    const accepted = answerRoleOffer(state, roleOfferFor(state)!, 0).state;
    expect(accepted.role).toBe('lurker');
    expect(matesOf(accepted).find((mate) => mate.player.nickname === nick)!.player.role).toBe('entry');
    expect(roleOfferFor(accepted)).toBeNull();
  });

  it('testar e recusar não trocam; a proposta não volta logo em seguida', () => {
    const { state } = slumping('offer-test');
    const offer = roleOfferFor(state)!;
    const tested = answerRoleOffer(state, offer, 1).state;
    expect(tested.role).toBe('entry');
    expect(roleOfferFor(tested)).toBeNull();
    expect(roleOfferFor(answerRoleOffer(state, offer, 2).state)).toBeNull();
  });

  it('vaga: quem joga de rifler deixa uma função sem ninguém, e o texto diz qual', () => {
    const found = Array.from({ length: 20 }, (_, seed) => roleOfferFor(careerAs('rifler', `offer-vacancy-${seed}`))).find(Boolean);
    expect(found?.motive).toBe('vaga');
    expect(found?.text).toMatch(/^O time está sem /);
  });

  it('depois do campeonato a proposta vira acontecimento, com o texto do motivo e sem a chance da escolha', () => {
    const { state, nick } = slumping('offer-roll');
    const rolled = Array.from({ length: 30 }, (_, seed) => rollHappening({ ...state, seed: `${state.seed}-${seed}` }, 'post', { eventIndex: 1 } as never))
      .find((next) => next.pendingHappening?.id === ROLE_OFFER_ID);
    expect(rolled).toBeTruthy();
    const view = pendingHappeningView(rolled!)!;
    expect(view.situation).toContain(nick);
    expect(view.odds).toBe(false);
    const outcome = resolveHappening(rolled!, 0);
    expect(outcome.state.pendingHappening).toBeNull();
    expect(outcome.state.role).toBe('lurker');
    expect(outcome.state.happeningHistory!.at(-1)).toMatchObject({ id: ROLE_OFFER_ID, choice: 0 });
  });

  it('os acontecimentos antigos de IGL saíram do sorteio e não mudam função', () => {
    expect(roleMoveOf('EV007', 0)).toBeNull();
    expect(roleMoveOf('EV144', 1)).toBeNull();
    for (let seed = 0; seed < 60; seed += 1) {
      const state = careerAs('rifler', `old-igl-${seed}`, 'lan-house');
      for (const trigger of ['pre', 'post', 'between'] as const) {
        expect(['EV007', 'EV144']).not.toContain(rollHappening(state, trigger, { eventIndex: 0 } as never).pendingHappening?.id);
      }
    }
  });
});
