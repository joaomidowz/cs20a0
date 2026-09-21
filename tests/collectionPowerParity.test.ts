// tests/collectionPowerParity.test.ts
// O número da tela é o número que joga.
//
// A tela de montar time (`CollectionWorkspace.svelte`) e o servidor (`room-manager.ts`, `toTournamentOrganization`)
// montam o time por caminhos separados. Enquanto a régua valia 1, uma diferença entre os dois sumia na primeira casa
// decimal; com a régua de níveis (`COURT_SPREAD`) a mesma diferença vira vários níveis na cara do jogador.
//
// Este arquivo joga uma sala de verdade e compara o poder que o servidor mandou para a quadra com o que a tela mostra,
// e cobra que AWPer-IGL, star e coach contem em jogo — as três peças que o dono viu sumirem.
import { describe, expect, it } from 'vitest';
import { players, teams } from '../server/data';
import { RoomManager, type PreparedLineup } from '../server/room-manager';
import { applyCollectionLineup, collectionBaseTeam, synergyOf, toSelectedPlayer, type CollectionSlotRole } from '../src/lib/game/online/collection-lineup';
import { collectionCoachById, collectionTeams } from '../src/lib/game/online/collection-pool';
import { applyCoachToTeam, coachAffinity } from '../src/lib/game/dynasty/coach';
import { COURT_SPREAD, withPlayerFloor } from '../src/lib/game/courtPower';
import { courtRating } from '../src/lib/game/powerRating';
import { DEFAULT_ROOM_CONFIG, type RoomConfig } from '../src/lib/game/online/contracts';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { QUEUE_ROOM_CONFIG } from '../server/queue';
import { BOT_LEVEL_BAND } from '../src/lib/game/balance';
import { COURT_TOP } from '../src/lib/game/courtPower';
import type { Player } from '../src/lib/game/types';

const CONFIG: RoomConfig = { ...DEFAULT_ROOM_CONFIG, entryStage: 'playoffs', capacity: 4, draftDeadlineSeconds: 60, simulationSpeed: 'ultra', seasonRuns: 1 };
let counter = 0;
const requestId = () => `parity-${(counter += 1).toString().padStart(8, '0')}`;

/** O time do dono: SK com FalleN de AWPer-IGL e star, e o coach do próprio time. */
const IDS = ['taco-2018', 'fallen-2016', 'coldzera-2017', 'fnx-2016', 'fer-2017'];
const ROLES: CollectionSlotRole[] = ['entry', 'awper-igl', 'rifler', 'support', 'lurker'];
const STAR = 'fallen-2016';
const COACH = 'coach-sk-2016';
const cards = IDS.map((id) => players.find((player) => player.id === id)!);

/** O que a tela mostra (`CollectionWorkspace.svelte`): base, sinergia, coach e o piso do jogador. */
function screenPower(options: { star?: string | null; coachId?: string | null; roles?: CollectionSlotRole[] } = {}) {
  const roles = options.roles ?? ROLES;
  const star = options.star === undefined ? STAR : options.star;
  const coachId = options.coachId === undefined ? COACH : options.coachId;
  const lineup = cards.map((player, index) => toSelectedPlayer(player.id, roles[index]));
  const base = collectionBaseTeam(cards, 'tactical', lineup, 'preview');
  const synergized = applyCollectionLineup(base, { players: cards, roles, starPlayerId: star, style: 'tactical', coachId });
  const coach = coachId ? collectionCoachById.get(coachId) : undefined;
  const withCoach = coach ? applyCoachToTeam(synergized, coach, coachAffinity(coach, cards, collectionTeams)) : synergized;
  return withPlayerFloor(withCoach.power);
}

/** O poder que o SERVIDOR levou para a quadra, por uma sala de verdade. */
function serverPower(options: { star?: string | null; coachId?: string | null; roles?: CollectionSlotRole[] } = {}) {
  const roles = options.roles ?? ROLES;
  const prepared: PreparedLineup = {
    userId: 'dono',
    lineup: cards.map((player, index) => toSelectedPlayer(player.id, roles[index])),
    style: 'tactical',
    starPlayerId: options.star === undefined ? STAR : options.star,
    coachId: options.coachId === undefined ? COACH : options.coachId,
    mapPreferences: [...getDefaultMapSelection(cards as Player[], teams)]
  };
  const manager = new RoomManager();
  const code = manager.createRoom(CONFIG, 1_000, `parity-${requestId()}`);
  const ticket = manager.prepareLineup(code, prepared, 1_000);
  const me = manager.join(code, 'Dono', 'SK', 1_001, ticket);
  // O segundo também entra com time da coleção, senão a sala fica no draft e nunca monta as organizações.
  const outros = players.filter((player) => !IDS.includes(player.id)).slice(0, 5);
  const ticketB = manager.prepareLineup(code, { userId: 'outro', lineup: outros.map((player, index) => toSelectedPlayer(player.id, (['igl', 'awper', 'entry', 'support', 'lurker'] as CollectionSlotRole[])[index])), style: 'balanced', starPlayerId: null, coachId: null, mapPreferences: [...getDefaultMapSelection(outros, teams)] }, 1_000);
  manager.join(code, 'Bot', 'Org B', 1_002, ticketB);
  manager.execute(code, me.participantId, { type: 'start', requestId: requestId() }, 1_010);
  const snapshot = manager.getSnapshot(code, me.participantId, 1_010);
  const mine = snapshot.organizations?.find((organization) => organization.id === me.participantId);
  expect(mine, 'o servidor precisa ter posto o time do jogador na quadra').toBeTruthy();
  return mine!.power;
}

describe('quem joga sozinho contra bots pega o campo aliviado', () => {
  /** A fila ranqueada sem adversário: a run começa com um humano só e não conta pontos, como o solo. */
  const loneQueueRun = () => {
    const manager = new RoomManager();
    const code = manager.createRoom(QUEUE_ROOM_CONFIG, 1_000, `fila-${requestId()}`, { origin: 'queue', expected: 2 });
    const me = manager.join(code, 'Dono', 'SK', 1_001, manager.prepareLineup(code, {
      userId: 'dono', lineup: cards.map((player, index) => toSelectedPlayer(player.id, ROLES[index])),
      style: 'tactical', starPlayerId: STAR, coachId: COACH, mapPreferences: [...getDefaultMapSelection(cards as Player[], teams)]
    }, 1_000));
    let now = 1_010;
    for (let index = 0; index < 60 && manager.getSnapshot(code, me.participantId, now).phase === 'lobby'; index += 1) {
      now += 5_000;
      manager.tick(now);
    }
    const snapshot = manager.getSnapshot(code, me.participantId, now);
    expect(snapshot.phase, 'a fila sem adversário começa a run mesmo assim').not.toBe('lobby');
    return snapshot;
  };

  it('a fila sem adversário alivia o campo, igual ao solo', () => {
    const snapshot = loneQueueRun();
    const bots = snapshot.organizations!.filter((organization) => !organization.human);
    expect(bots.length).toBeGreaterThan(0);
    // Sem alívio nenhum bot desceria abaixo do degrau de entrada (COURT_TOP − BOT_GAP_FROM_TOP.none).
    const semAlivio = BOT_LEVEL_BAND.none[0];
    const maisFraco = Math.min(...bots.map((bot) => courtRating(bot.power)));
    expect(maisFraco, `bot mais fraco em ${maisFraco.toFixed(1)}, degrau de entrada é ${semAlivio.toFixed(1)}`).toBeLessThan(semAlivio);
  });
});

describe('salvar o time troca a line da run que ainda não começou', () => {
  it('o coach escolhido depois de abrir a sala entra na quadra', () => {
    const semCoach: PreparedLineup = {
      userId: 'dono', lineup: cards.map((player, index) => toSelectedPlayer(player.id, ROLES[index])),
      style: 'tactical', starPlayerId: STAR, coachId: null, mapPreferences: [...getDefaultMapSelection(cards as Player[], teams)]
    };
    const manager = new RoomManager();
    const code = manager.createRoom(CONFIG, 1_000, `refresh-${requestId()}`);
    const me = manager.join(code, 'Dono', 'SK', 1_001, manager.prepareLineup(code, semCoach, 1_000));
    const outros = players.filter((player) => !IDS.includes(player.id)).slice(0, 5);
    manager.join(code, 'Bot', 'Org B', 1_002, manager.prepareLineup(code, { userId: 'outro', lineup: outros.map((player, index) => toSelectedPlayer(player.id, (['igl', 'awper', 'entry', 'support', 'lurker'] as CollectionSlotRole[])[index])), style: 'balanced', starPlayerId: null, coachId: null, mapPreferences: [...getDefaultMapSelection(outros, teams)] }, 1_000));
    // O jogador salva o time com coach enquanto a sala ainda está no lobby.
    expect(manager.refreshPreparedLineup({ ...semCoach, coachId: COACH }, 1_005)).toBeGreaterThan(0);
    manager.execute(code, me.participantId, { type: 'start', requestId: requestId() }, 1_010);
    const mine = manager.getSnapshot(code, me.participantId, 1_010).organizations!.find((organization) => organization.id === me.participantId)!;
    expect(courtRating(mine.power), 'a quadra recebeu o time salvo, com coach').toBeCloseTo(courtRating(screenPower()), 1);
  });

  it('uma run já em andamento mantém o time com que entrou', () => {
    const manager = new RoomManager();
    const code = manager.createRoom(CONFIG, 1_000, `frozen-${requestId()}`);
    const me = manager.join(code, 'Dono', 'SK', 1_001, manager.prepareLineup(code, { userId: 'dono', lineup: cards.map((player, index) => toSelectedPlayer(player.id, ROLES[index])), style: 'tactical', starPlayerId: STAR, coachId: COACH, mapPreferences: [...getDefaultMapSelection(cards as Player[], teams)] }, 1_000));
    const outros = players.filter((player) => !IDS.includes(player.id)).slice(0, 5);
    manager.join(code, 'Bot', 'Org B', 1_002, manager.prepareLineup(code, { userId: 'outro', lineup: outros.map((player, index) => toSelectedPlayer(player.id, (['igl', 'awper', 'entry', 'support', 'lurker'] as CollectionSlotRole[])[index])), style: 'balanced', starPlayerId: null, coachId: null, mapPreferences: [...getDefaultMapSelection(outros, teams)] }, 1_000));
    manager.execute(code, me.participantId, { type: 'start', requestId: requestId() }, 1_010);
    const antes = manager.getSnapshot(code, me.participantId, 1_010).organizations!.find((organization) => organization.id === me.participantId)!.power;
    expect(manager.refreshPreparedLineup({ userId: 'dono', lineup: cards.map((player, index) => toSelectedPlayer(player.id, ROLES[index])), style: 'balanced', starPlayerId: null, coachId: null, mapPreferences: [...getDefaultMapSelection(cards as Player[], teams)] }, 1_020)).toBe(0);
    const depois = manager.getSnapshot(code, me.participantId, 1_020).organizations!.find((organization) => organization.id === me.participantId)!.power;
    expect(depois).toBe(antes);
  });
});

describe('o poder da tela é o poder que joga', () => {
  it('a sala leva para a quadra exatamente o time que a tela mostrou', () => {
    const screen = courtRating(screenPower());
    const server = courtRating(serverPower());
    expect(server, `tela ${screen.toFixed(1)} × servidor ${server.toFixed(1)}`).toBeCloseTo(screen, 1);
  });

  it('o AWPer-IGL conta como capitão E como AWPer em jogo', () => {
    // A volta `toSelectedPlayer` → `collectionRoleOf` já perdeu o papel duplo uma vez; aqui a line inteira só tem
    // capitão porque FalleN acumula, e se o papel se perder o time joga sem IGL (o que custa MISSING_IGL_COURT).
    const lines = synergyOf({ players: cards, roles: ROLES, starPlayerId: STAR, style: 'tactical', coachId: COACH }).map((line) => line.key);
    expect(lines).toContain('igl_hybrid');
    expect(lines).not.toContain('igl_none');
    expect(lines).not.toContain('awp_none');
    expect(lines, 'IGL + AWPer + suporte presentes valem o bônus de núcleo').toContain('core_complete');
    // E o servidor cobra o mesmo: trocar o AWPer-IGL por um AWPer puro tira o capitão e derruba o poder em quadra.
    const semCapitao = serverPower({ roles: ['entry', 'awper', 'rifler', 'support', 'lurker'] });
    // A margem acompanha a régua (`COURT_SPREAD`): o que importa é que jogar sem capitão custe de verdade.
    expect(courtRating(semCapitao)).toBeLessThan(courtRating(serverPower()) - COURT_SPREAD);
  });

  it('a ficha da partida diz quem é o coach do banco', () => {
    const manager = new RoomManager();
    const code = manager.createRoom(CONFIG, 1_000, `coach-${requestId()}`);
    const me = manager.join(code, 'Dono', 'SK', 1_001, manager.prepareLineup(code, { userId: 'dono', lineup: cards.map((player, index) => toSelectedPlayer(player.id, ROLES[index])), style: 'tactical', starPlayerId: STAR, coachId: COACH, mapPreferences: [...getDefaultMapSelection(cards as Player[], teams)] }, 1_000));
    const outros = players.filter((player) => !IDS.includes(player.id)).slice(0, 5);
    manager.join(code, 'Bot', 'Org B', 1_002, manager.prepareLineup(code, { userId: 'outro', lineup: outros.map((player, index) => toSelectedPlayer(player.id, (['igl', 'awper', 'entry', 'support', 'lurker'] as CollectionSlotRole[])[index])), style: 'balanced', starPlayerId: null, coachId: null, mapPreferences: [...getDefaultMapSelection(outros, teams)] }, 1_000));
    manager.execute(code, me.participantId, { type: 'start', requestId: requestId() }, 1_010);
    const organizations = manager.getSnapshot(code, me.participantId, 1_010).organizations!;
    expect(organizations.find((organization) => organization.id === me.participantId)!.coachId, 'o coach vai junto para a ficha').toBe(COACH);
    expect(organizations.find((organization) => !organization.human)!.coachId, 'bot não tem coach da coleção').toBeNull();
  });

  it('o star e o coach contam em jogo, não só na tela', () => {
    const cheio = courtRating(serverPower());
    const semStar = courtRating(serverPower({ star: null }));
    const semCoach = courtRating(serverPower({ coachId: null }));
    expect(semStar, `com star ${cheio.toFixed(1)} × sem star ${semStar.toFixed(1)}`).toBeLessThan(cheio - 0.15 * COURT_SPREAD);
    expect(semCoach, `com coach ${cheio.toFixed(1)} × sem coach ${semCoach.toFixed(1)}`).toBeLessThan(cheio - 0.15 * COURT_SPREAD);
  });
});
