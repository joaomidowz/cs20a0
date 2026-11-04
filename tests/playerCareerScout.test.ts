// tests/playerCareerScout.test.ts
// Quem cede a vaga para você assina com outro time (o mundo não esconde mais o ZywOo), a busca de jogador acha
// qualquer um com o caminho dele, e as cartas mostram país, idioma, idade e a língua da call.
import { afterEach, describe, expect, it } from 'vitest';
import { createPlayerCareer, seatToTake, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { memberNick, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { flagOf, spokenLabel } from '../src/lib/game/playerCareer/language';
import { cardInfoFor, scoutPlayers } from '../src/lib/game/playerCareer/scout';
import { matesOf, myPlayerOf } from '../src/lib/game/playerCareer/squad';
import { orgIn, registerSeats, seatMovesOf } from '../src/lib/game/playerCareer/world';

const vitality = sceneOrgs.find((org) => org.name === 'Vitality')!;

const atVitality = (seed: string, country = 'Brazil'): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 'tester', country, role: 'awper', seed });
  const seat = { ...seatToTake(orgIn(seed, 1, vitality.id)!, 'awper'), season: 1 };
  const state = startSeason({ ...base, orgId: vitality.id, pendingDraw: null, drawDone: true, seatsTaken: [seat] });
  registerSeats(seed, state.seatsTaken);
  return state;
};

afterEach(() => {
  for (const seed of ['scout-1', 'scout-2', 'scout-3', 'scout-4']) registerSeats(seed, []);
});

describe('quem cede a vaga vai para outro time', () => {
  it('ZywOo sai da Vitality e assina com um time do mesmo nível ou vizinho; quem veio fica no banco', () => {
    const state = atVitality('scout-1');
    const [move] = seatMovesOf('scout-1');
    expect(move.nick).toBe('ZywOo');
    expect(move.toId).not.toBe(vitality.id);
    const destination = sceneOrgs.find((org) => org.id === move.toId)!;
    expect(Math.abs(destination.level - vitality.level)).toBeLessThanOrEqual(1);
    expect(orgIn('scout-1', 1, move.toId)!.roster.map(memberNick)).toContain('ZywOo');
    expect(orgIn('scout-1', 1, vitality.id)!.roster.map(memberNick)).toContain(move.standIn);
    // O reserva não entra em quadra: os 4 parceiros são os mesmos 4 de antes da troca.
    const mates = matesOf(state).map((mate) => mate.player.nickname);
    expect(mates).toHaveLength(4);
    expect(mates).not.toContain(move.standIn);
    expect(mates).not.toContain('ZywOo');
  });

  it('sem registro o mundo é o da seed (simulação e saves antigos não mudam)', () => {
    atVitality('scout-2');
    registerSeats('scout-2', []);
    expect(orgIn('scout-2', 1, vitality.id)!.roster.map(memberNick)).toContain('ZywOo');
  });
});

describe('busca de jogador', () => {
  it('acha o ZywOo no time novo, com a história da vaga', () => {
    const state = atVitality('scout-3');
    const [move] = seatMovesOf('scout-3');
    const [hit] = scoutPlayers(state, 'zywoo');
    expect(hit).toMatchObject({ nick: 'ZywOo', orgId: move.toId, status: 'titular' });
    expect(hit.history[0].text).toContain('Cedeu a vaga na Vitality');
    expect(hit.spoken).toBe('Francês');
  });

  it('quem veio no lugar aparece como reserva do seu time; menos de 2 letras não busca', () => {
    const state = atVitality('scout-4');
    const [move] = seatMovesOf('scout-4');
    const [hit] = scoutPlayers(state, move.standIn);
    expect(hit).toMatchObject({ orgId: vitality.id, status: 'reserva' });
    expect(scoutPlayers(state, 'z')).toEqual([]);
    expect(scoutPlayers(state, 'tester')[0].status).toBe('voce');
  });
});

describe('cartas com país, idioma e idade', () => {
  it('você (brasileiro na Vitality): português, a sua idade e o selo de inglês fraco', () => {
    const state = atVitality('scout-1');
    const info = cardInfoFor(state, state.orgId)(myPlayerOf(state));
    expect(info).toMatchObject({ flag: 'br', spoken: 'Português', age: state.age });
    expect(info.call).toMatchObject({ code: 'EN', ok: false });
    expect(info.detail).not.toContain('—');
  });

  it('parceiro francês na call em inglês: fala francês e o selo de inglês fluente', () => {
    const state = atVitality('scout-1');
    const describe = cardInfoFor(state, state.orgId);
    const apex = matesOf(state).find((mate) => mate.player.nickname === 'apEX');
    expect(apex).toBeDefined();
    const info = describe(apex!.player);
    expect(info.spoken).toBe('Francês');
    expect(info.age).toBeGreaterThan(30);
    expect(info.call).toMatchObject({ code: 'EN', ok: true });
  });

  it('país vira bandeira e idioma em português', () => {
    expect(flagOf('Brazil')).toBe('br');
    expect(flagOf('Internacional')).toBeNull();
    expect(spokenLabel('Estonia')).toBe('Estoniano');
    expect(spokenLabel('Denmark')).toBe('Dinamarquês');
  });
});

describe('idade real e aposentadoria anunciada', () => {
  it('FalleN nasceu em 1991: 36 anos em 2027, não 33', async () => {
    const { memberBirthYear } = await import('../src/lib/game/playerCareer/data');
    const fallen = sceneOrgs.flatMap((org) => org.roster).find((member) => member.nick === 'FalleN')!;
    expect(memberBirthYear(fallen)).toBe(1991);
    const zywoo = sceneOrgs.flatMap((org) => org.roster).find((member) => member.nick === 'ZywOo' || member.nick === 'zywoo')!;
    expect(memberBirthYear(zywoo)).toBe(2000);
  });

  it('FalleN anunciou que para: na virada para 2027 ele pendura na maioria dos mundos, mas às vezes segue', async () => {
    const { sceneWorld } = await import('../src/lib/game/playerCareer/world');
    let retired = 0;
    const seeds = 80;
    for (let index = 0; index < seeds; index += 1) {
      if (sceneWorld(`fallen-${index}`, 2).retirements.some((entry) => entry.nick === 'FalleN')) retired += 1;
    }
    expect(retired / seeds).toBeGreaterThan(0.55);
    expect(retired / seeds).toBeLessThan(0.85);
  });
});
