// tests/playerCareerTalks.test.ts
// Conversas fora de partida: a fala vem da função real de quem fala e do seu momento; as respostas mudam de valor
// com o contexto (e a ordem embaralha); cooldown, memória com limite, quem fica atravessado, coach abrindo o ano,
// match point perdido (D09) e as falas do round decisivo.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { addReserve, matesOf } from '../src/lib/game/playerCareer/squad';
import { DEFAULT_LIFE } from '../src/lib/game/playerCareer/life';
import { CONTEXT_LINES, answerEffects, answerTalk, decisiveLine, dismissTalk, momentTalk, seasonTalk, speakerOf, startTalk, type Talk } from '../src/lib/game/playerCareer/talks';
import { tickLife } from '../src/lib/game/playerCareer/tick';

const at = (seed: string, orgName = 'FURIA'): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'awper', seed });
  const org = sceneOrgs.find((candidate) => candidate.name === orgName)!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
};
const withMind = (state: PlayerCareerState, mind: number): PlayerCareerState => ({ ...state, life: { ...DEFAULT_LIFE, mind } });
const warm = (state: PlayerCareerState): PlayerCareerState => ({ ...state, relationships: Object.fromEntries(matesOf(state).map((mate) => [mate.player.id, 60])) });

describe('conversas', () => {
  it('sem situação no ar, o Conversar continua o papo rápido (null)', () => {
    const state = warm(at('talk-1'));
    const mate = matesOf(state)[0];
    expect(startTalk(state, speakerOf(state, 'mate', mate.player.id)!)).toBeNull();
  });

  it('com Mental baixo, a fala é de mental baixo e da função de quem fala', () => {
    const state = withMind(warm(at('talk-2')), 25);
    for (const mate of matesOf(state)) {
      const talk = startTalk(state, speakerOf(state, 'mate', mate.player.id)!)!;
      expect(talk.situation).toBe('mental_baixo');
      const line = CONTEXT_LINES[Number(talk.lineKey.slice(1))];
      const role = mate.player.role;
      expect(role === 'support' || role === 'rifler' ? [role, 'anchor'] : [role]).toContain(line.speaker);
      expect(talk.options).toHaveLength(3);
    }
  });

  it('atrito (relação 35 ou menos) vem antes do resto', () => {
    const base = withMind(warm(at('talk-3')), 25);
    const mate = matesOf(base)[1];
    const state = { ...base, relationships: { ...base.relationships, [mate.player.id]: 20 } };
    expect(startTalk(state, speakerOf(state, 'mate', mate.player.id)!)!.situation).toBe('conflito');
  });

  it('a melhor resposta muda com o contexto, e a ordem não põe sempre a mesma na frente', () => {
    const state = withMind(warm(at('talk-4')), 25);
    const mate = matesOf(state)[0];
    const talk = startTalk(state, speakerOf(state, 'mate', mate.player.id)!)!;
    const score = (s: PlayerCareerState, key: 'ouvir' | 'propor' | 'firme') => { const e = answerEffects(s, talk, key); return e.mind + e.rel + e.form * 2 - Math.max(0, e.fatigue) / 3; };
    const best = (s: PlayerCareerState) => (['ouvir', 'propor', 'firme'] as const).reduce((a, b) => (score(s, b) > score(s, a) ? b : a));
    expect(best({ ...state, fatigue: 75 })).toBe('ouvir');
    expect(best({ ...state, fatigue: 10 })).toBe('propor');
    const firsts = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const s = withMind(warm(at(`talk-order-${i}`)), 25);
      const m = matesOf(s)[0];
      firsts.add(startTalk(s, speakerOf(s, 'mate', m.player.id)!)!.options[0].key);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('cooldown: a mesma fala não volta antes de 12 conversas; memória guarda no máximo 30', () => {
    let state = withMind(warm(at('talk-5')), 25);
    const seen: Array<{ key: string; n: number }> = [];
    for (let i = 0; i < 40; i += 1) {
      const mates = matesOf(state);
      const mate = mates[i % mates.length];
      state = { ...state, talks: {} };
      const talk = startTalk(state, speakerOf(state, 'mate', mate.player.id)!);
      if (!talk) continue;
      const n = state.talkMemory?.n ?? 0;
      const last = [...seen].reverse().find((entry) => entry.key === talk.lineKey);
      if (last) expect(n - last.n).toBeGreaterThanOrEqual(12);
      seen.push({ key: talk.lineKey, n });
      state = answerTalk({ ...state, pendingTalk: talk }, talk.options[0].key).state;
      state = { ...state, life: { ...state.life!, mind: 25 } };
    }
    expect(state.talkMemory!.log.length).toBeLessThanOrEqual(30);
    expect(seen.length).toBeGreaterThan(10);
  });

  it('bater de frente no atrito deixa a pessoa atravessada: o que é bom rende metade', () => {
    const base = warm(at('talk-6'));
    const mate = matesOf(base)[2];
    const state = { ...base, relationships: { ...base.relationships, [mate.player.id]: 20 } };
    const talk = startTalk(state, speakerOf(state, 'mate', mate.player.id)!)!;
    const after = answerTalk({ ...state, pendingTalk: talk }, 'firme').state;
    expect(after.talkMemory!.grudges[mate.player.id]).toBe(state.seasonNumber);
    expect(after.relationships[mate.player.id]).toBeLessThan(20);
    const again: Talk = { ...talk, lineKey: 'x' };
    const full = answerEffects({ ...state, talks: {} }, again, 'ouvir').rel;
    const halved = answerEffects({ ...after, talks: {} }, again, 'ouvir').rel;
    expect(halved).toBeLessThan(full);
  });

  it('o coach abre a temporada uma vez; deixar para depois também conta', () => {
    const state = at('talk-7');
    const opening = seasonTalk(state)!;
    expect(opening.situation).toBe('inicio_temporada');
    expect(opening.speaker.kind).toBe('coach');
    const answered = answerTalk({ ...state, pendingTalk: opening }, 'ouvir').state;
    expect(seasonTalk(answered)).toBeNull();
    expect(seasonTalk(dismissTalk({ ...state, pendingTalk: opening }))).toBeNull();
    expect(answered.life!.coachTrust).toBe(DEFAULT_LIFE.coachTrust + 3);
  });

  it('match point perdido com Mental baixo: quem fala é o coach (D09)', () => {
    const state = withMind(warm(at('talk-8')), 30);
    const talk = momentTalk(state, 'post', 0, true)!;
    expect(talk.situation).toBe('match_point_perdido');
    expect(talk.speaker.kind).toBe('coach');
    expect(momentTalk(withMind(state, 60), 'post', 0, true)?.situation).not.toBe('match_point_perdido');
  });

  it('o reserva conversa com a mesma relação de quando era titular', () => {
    const state = withMind(warm(at('talk-9')), 25);
    const { state: withReserve } = addReserve(state, 'jovem');
    const speaker = speakerOf(withReserve, 'reserve')!;
    expect(speaker.kind).toBe('reserve');
    expect(startTalk(withReserve, speaker)?.situation).toBe('mental_baixo');
  });

  it('fala de round decisivo: sobre overtime só no overtime', () => {
    const state = warm(at('talk-10'));
    for (let i = 0; i < 30; i += 1) {
      const said = decisiveLine(state, i % 2 === 0, false, `s${i}`);
      if (said) expect(said.text).not.toMatch(/overtime/i);
    }
  });

  it('save antigo (sem vida nem memória) funciona, e o tempo anda a vida', () => {
    const old = { ...at('talk-11') } as PlayerCareerState;
    delete old.life;
    delete old.talkMemory;
    expect(seasonTalk(old)).not.toBeNull();
    const { state } = tickLife(old, { name: 'x', placement: 'Campeão', rating: 1.1, seriesWins: 4, seriesLosses: 0 });
    expect(state.life!.mind).toBeGreaterThan(DEFAULT_LIFE.mind);
  });
});
