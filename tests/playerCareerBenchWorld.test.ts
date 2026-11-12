// tests/playerCareerBenchWorld.test.ts
// Banco dos times no mundo da carreira: quem está fora dos 5 titulares (broky na FaZe), o que acontece com ele a cada
// virada (volta ao time, outro time contrata, dispensa e free agent, aposentadoria) e a regra que protege os saves:
// o banco só se mexe a partir da temporada guardada no save, então os elencos já vistos nunca mudam.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgById, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { ensureSquad, kickMate, matesOf, planOf, promoteReserve, addReserve, registerCareerWorld, teamBench } from '../src/lib/game/playerCareer/squad';
import { scoutPlayers } from '../src/lib/game/playerCareer/scout';
import { benchIn, freeAgentsIn, registerBenchStart, worldHistory, worldRosters } from '../src/lib/game/playerCareer/world';
import { worldMovesView } from '../src/lib/game/playerCareer/worldView';

const FAZE = 'faze-clan-2026';
const nicks = (seed: string, season: number) => [...worldRosters(seed, season)].map(([id, roster]) => `${id}=${roster.map((member) => member.nick).join(',')}`).sort();
const atFaze = (seed: string, extra: Partial<PlayerCareerState> = {}): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  return startSeason({ ...base, orgId: FAZE, pendingDraw: null, drawDone: true, seatsTaken: [], ...extra });
};

describe('banco dos times', () => {
  it('broky está no banco da FaZe desde o começo, fora dos 5 titulares e com a identidade da coleta', () => {
    const bench = benchIn('banco-broky', 1, FAZE);
    expect(bench.map((entry) => entry.member.nick)).toEqual(['broky']);
    expect(bench[0].member).toMatchObject({ country: 'Latvia', birthDate: '2001-02-14', roles: ['awp'] });
    expect(bench[0].member.overall).toBeGreaterThan(70);
    expect(worldRosters('banco-broky', 1).get(FAZE)?.some((member) => member.nick === 'broky')).toBe(false);
    expect(sceneOrgById.get(FAZE)?.roster).toHaveLength(5);
  });

  it('a pesquisa de 2026-11-12 entra no começo: 25 no banco (incluindo de outro time) e 55 sem time, todos com overall', () => {
    const seed = 'banco-pesquisa';
    const benched = sceneOrgs.flatMap((org) => benchIn(seed, 1, org.id).map((entry) => ({ org: org.name, nick: entry.member.nick, overall: entry.member.overall })));
    expect(benched).toHaveLength(25);
    expect(benched).toEqual(expect.arrayContaining([
      expect.objectContaining({ org: 'Astralis', nick: 'jabbi' }),
      expect.objectContaining({ org: 'Astralis', nick: 'HooXi' }),
      expect.objectContaining({ org: 'PARIVISION', nick: 'slaxejezzz' }) // banco de outro time que não o da coleta
    ]));
    const free = freeAgentsIn(seed, 1);
    expect(free).toHaveLength(55);
    expect(free.map((entry) => entry.member.nick)).toEqual(expect.arrayContaining(['jL', 'brnz4n', 'Perfecto', 'riskyb0b']));
    for (const entry of [...benched, ...free.map((item) => ({ nick: item.member.nick, overall: item.member.overall }))]) expect(entry.overall).toBeGreaterThan(40);
  });

  it('sem registro (simulação, testes) o banco não se mexe: o mundo é o de sempre e o broky envelhece no banco', () => {
    const seed = 'banco-sem-registro';
    for (let season = 2; season <= 5; season += 1) {
      expect(worldHistory(seed, season).benchMoves).toEqual([]);
      expect(benchIn(seed, season, FAZE).map((entry) => entry.member.nick)).toEqual(['broky']);
    }
    // Os sem time do começo continuam sem time (ninguém contrata quando a regra está desligada).
    expect(freeAgentsIn(seed, 5).map((entry) => entry.member.nick)).toEqual(freeAgentsIn(seed, 1).map((entry) => entry.member.nick));
  });

  it('a regra só liga na temporada do save: as temporadas antes dela ficam idênticas ao mundo sem banco', () => {
    const seed = 'banco-protege-save';
    const before = [1, 2, 3, 4, 5].map((season) => nicks(seed, season));
    registerBenchStart(seed, 4);
    try {
      expect([1, 2, 3].map((season) => nicks(seed, season))).toEqual(before.slice(0, 3));
      for (const season of [2, 3]) expect(worldHistory(seed, season).benchMoves).toEqual([]);
    } finally {
      registerBenchStart(seed, undefined);
    }
    expect([1, 2, 3, 4, 5].map((season) => nicks(seed, season))).toEqual(before); // desligar volta ao mundo de sempre
  });

  it('ligado, o banco se mexe: volta ao time, troca de time, vira free agent e quem é contratado sai do banco', () => {
    const kinds = new Set<string>();
    let brokyMoved = 0;
    for (let index = 0; index < 30; index += 1) {
      const seed = `banco-vivo-${index}`;
      registerBenchStart(seed, 2);
      try {
        for (let season = 2; season <= 6; season += 1) {
          for (const move of worldHistory(seed, season).benchMoves) {
            kinds.add(move.kind);
            if (move.nick.toLowerCase() === 'broky') brokyMoved += 1;
            // Contratado ou de volta: ele está num elenco ou num banco na temporada, nunca sumido (as trocas normais do
            // mundo na mesma virada podem levá-lo do time que o contratou para outro).
            if (move.kind === 'promoted' || move.kind === 'signed' || move.kind === 'faSigned') {
              const key = move.nick.toLowerCase();
              const starter = [...worldRosters(seed, season).values()].some((roster) => roster.some((member) => member.nick.toLowerCase() === key));
              const onBench = sceneOrgs.some((org) => benchIn(seed, season, org.id).some((entry) => entry.member.nick.toLowerCase() === key));
              const released = worldHistory(seed, season).benchMoves.some((other) => other.nick.toLowerCase() === key && other.kind === 'released');
              expect(starter || onBench || released).toBe(true);
            }
          }
          // Ninguém está em dois lugares: titular, banco e sem time não se cruzam.
          const starters = new Set([...worldRosters(seed, season).values()].flat().map((member) => member.nick.toLowerCase()));
          const benched = sceneOrgs.flatMap((org) => benchIn(seed, season, org.id).map((entry) => entry.member.nick.toLowerCase()));
          const free = freeAgentsIn(seed, season).map((entry) => entry.member.nick.toLowerCase());
          for (const nick of [...benched, ...free]) expect(starters.has(nick)).toBe(false);
          expect(new Set([...benched, ...free]).size).toBe(benched.length + free.length);
          for (const org of sceneOrgs) expect(benchIn(seed, season, org.id).length).toBeLessThanOrEqual(2);
        }
      } finally {
        registerBenchStart(seed, undefined);
      }
    }
    expect(brokyMoved).toBeGreaterThan(0);
    for (const kind of ['promoted', 'signed', 'released', 'benched']) expect(kinds).toContain(kind);
  }, 60000);

  it('carreira nova liga o banco na 2; save de antes do banco liga na seguinte à que está (nada já visto muda)', () => {
    expect(createPlayerCareer({ nick: 'novo', country: 'Brazil', role: 'awper', seed: 'banco-novo' }).benchFrom).toBe(2);
    const old = atFaze('banco-save-velho', { seasonNumber: 3 });
    const { benchFrom: _drop, ...withoutBench } = old;
    expect(ensureSquad(withoutBench as PlayerCareerState).benchFrom).toBe(4);
    expect(ensureSquad({ ...old, benchFrom: 2 }).benchFrom).toBe(2);
  });

  it('a ficha do time mostra o banco; no seu time, você aparece no banco quando foi bancado', () => {
    const state = atFaze('banco-ficha');
    registerCareerWorld(state);
    expect(teamBench(state, FAZE).map((line) => line.nick)).toContain('broky');
    const benched = { ...state, benchedEvents: 2 };
    const lines = teamBench(benched, FAZE);
    expect(lines[0]).toMatchObject({ nick: 'tester', me: true });
    expect(lines[0].note).toMatch(/próximos 2 campeonatos/);
    const other = sceneOrgs.find((org) => org.id !== FAZE && !benchIn(state.seed, 1, org.id).length)!;
    expect(teamBench(benched, other.id)).toEqual([]); // o seu banco não aparece na ficha dos outros
  });

  it('quem saiu do seu time a seu pedido não some: aparece sem time na busca (e o que foi para o seu banco, no banco)', () => {
    let checked = 0;
    for (let index = 0; index < 30 && !checked; index += 1) {
      const state = { ...atFaze(`banco-pedido-${index}`), overall: 95, reputation: 90, fame: 60000 };
      registerCareerWorld(state);
      const mate = matesOf(state)[0];
      const nick = mate.player.nickname!;
      const result = kickMate(state, mate.player.id);
      if (!result.accepted) continue;
      checked += 1;
      registerCareerWorld(result.state);
      const [hit] = scoutPlayers(result.state, nick).filter((entry) => entry.nick.toLowerCase() === nick.toLowerCase());
      expect(hit).toMatchObject({ status: 'livre', orgId: null });
      expect(hit.note).toMatch(/Saiu da FaZe/);
    }
    expect(checked).toBe(1);
    // O reserva que toma a vaga manda o titular para o seu banco: ele aparece no banco, não sem time.
    const base = atFaze('banco-reserva-busca');
    const { state: withReserve } = addReserve(base, 'jovem');
    const target = matesOf(withReserve)[0];
    const { state: promoted } = promoteReserve(withReserve, target.player.id);
    registerCareerWorld(promoted);
    const benchedNick = planOf(promoted).reserve!.nick;
    const [benched] = scoutPlayers(promoted, benchedNick).filter((entry) => entry.nick.toLowerCase() === benchedNick.toLowerCase());
    expect(benched?.status).toBe('reserva');
  });

  it('a busca acha quem está no banco e quem está sem time; as trocas do banco entram no mercado do mundo', () => {
    const state = atFaze('banco-busca');
    registerCareerWorld(state);
    const [hit] = scoutPlayers(state, 'broky');
    expect(hit).toMatchObject({ nick: 'broky', status: 'reserva', orgId: FAZE });
    expect(hit.note).toMatch(/banco da FaZe/i);
    // Numa carreira com o banco ligado, alguma virada tem movimentação do banco no mercado.
    let seen = false;
    for (let index = 0; index < 20 && !seen; index += 1) {
      const later = atFaze(`banco-mercado-${index}`, { seasonNumber: 3, benchFrom: 2 });
      registerCareerWorld(later);
      seen = worldMovesView(later).some((group) => group.kind === 'banco' && group.lines.length > 0)
        || worldMovesView({ ...later, seasonNumber: 2 }).some((group) => group.kind === 'banco' && group.lines.length > 0);
      registerBenchStart(later.seed, undefined);
    }
    expect(seen).toBe(true);
  }, 60000);
});
