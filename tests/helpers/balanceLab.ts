// tests/helpers/balanceLab.ts
// Laboratório de equilíbrio: monta as lines de referência pela MESMA cadeia que o servidor usa e joga séries de verdade.
// Tudo que decide "o jogo está justo?" passa por aqui, para a resposta sair do motor e não de uma fórmula.
import { collectionCoachById, collectionPlayerById, collectionTeams } from '../../src/lib/game/online/collection-pool';
import { applyCollectionLineup, collectionBaseTeam, toSelectedPlayer, type CollectionSlotRole } from '../../src/lib/game/online/collection-lineup';
import { botFieldPower } from '../../src/lib/game/online/bot-field';
import { withPlayerFloor } from '../../src/lib/game/courtPower';
import { createLiveSeries, runSeriesToEnd, toSeriesResult, type PowerScale } from '../../src/lib/game/online/live-series';
import { createBotMapStrategy, createUserMapStrategy, type MapStrategy } from '../../src/lib/game/map-veto';
import { getDefaultMapSelection } from '../../src/lib/game/maps';
import { applyCoachToTeam, coachAffinity } from '../../src/lib/game/dynasty/coach';
import { calculateHistoricalTeamPower } from '../../src/lib/game/simulation';
import { players as corePlayers, teams as coreTeams } from '../../server/data';
import type { CombatTeam, HistoricalTeam, MapId, OrgStyle, Player, Roster } from '../../src/lib/game/types';

export interface LabBuild {
  name: string;
  ids: string[];
  roles: CollectionSlotRole[];
  style: OrgStyle;
  star: string | null;
  coachId: string | null;
}

export interface LabSide {
  team: CombatTeam;
  strategy: MapStrategy;
  roster: Roster;
}

const cardsOf = (build: LabBuild): Player[] => build.ids.map((id) => {
  const player = collectionPlayerById.get(id);
  if (!player) throw new Error(`balanceLab: carta ${id} não existe mais no pool`);
  return player;
});

/** A collection lineup as the server sends it to the tournament (`server/room-manager.ts`, `toTournamentOrganization`). */
export function labLineup(build: LabBuild): LabSide {
  const cards = cardsOf(build);
  const lineup = cards.map((player, index) => toSelectedPlayer(player.id, build.roles[index]));
  const base = collectionBaseTeam(cards, build.style, lineup, build.name);
  const synergized = applyCollectionLineup(base, { players: cards, roles: build.roles, starPlayerId: build.star, style: build.style, coachId: build.coachId });
  const coach = build.coachId ? collectionCoachById.get(build.coachId) : undefined;
  const withCoach = coach ? applyCoachToTeam(synergized, coach, coachAffinity(coach, cards, collectionTeams)) : synergized;
  // The floor the server applies before the match (`server/room-manager.ts`): the lab has to mirror it or the
  // measurements lie about anyone starting out.
  const team = { ...withCoach, power: withPlayerFloor(withCoach.power) };
  const maps = getDefaultMapSelection(cards, collectionTeams) as [MapId, MapId, MapId];
  return {
    team: { ...team, id: build.name, name: build.name },
    strategy: createUserMapStrategy(build.name, maps, cards, collectionTeams),
    roster: { players: cards, roles: new Map(lineup.map((pick) => [pick.playerId, pick.selectedSlotRole])) }
  };
}

/** A historical team as a bot of the online field, with its placement buff (or the zebra boost). */
export function labBot(teamId: string, zebra = false): LabSide {
  const source = coreTeams.find((team) => team.id === teamId) as HistoricalTeam | undefined;
  if (!source) throw new Error(`balanceLab: time ${teamId} não existe mais`);
  const combat = calculateHistoricalTeamPower(source, corePlayers);
  const playerById = new Map(corePlayers.map((player) => [player.id, player]));
  const id = `bot-${teamId}`;
  return {
    team: { ...combat, id, power: botFieldPower(combat.power, source, zebra, 0, playerById) },
    strategy: { ...createBotMapStrategy(source), teamId: id },
    roster: { players: corePlayers.filter((player) => (source.players ?? []).includes(player.id)) }
  };
}

/** Share of best-of-three series `a` wins against `b`, sides alternated so neither always opens the veto. */
export function winRate(a: LabSide, b: LabSide, scale: PowerScale, series = 500): number {
  let wins = 0;
  for (let index = 0; index < series; index += 1) {
    const [left, right] = index % 2 === 0 ? [a, b] : [b, a];
    const state = createLiveSeries({
      id: `lab-${index}`,
      phase: 'stage3',
      bestOf: 3,
      teamA: left.team,
      teamB: right.team,
      seed: `lab:${a.team.id}:${b.team.id}:${index}`,
      mode: 'premier',
      strategies: { a: left.strategy, b: right.strategy },
      rosters: { a: left.roster, b: right.roster },
      controllers: { a: 'bot', b: 'bot' },
      interactiveVeto: false,
      powerScale: scale
    });
    runSeriesToEnd(state);
    if (toSeriesResult(state).winnerId === a.team.id) wins += 1;
  }
  return Math.round((wins / series) * 100);
}

/** The reference lineups every balance decision is measured on. Card ids are pinned: a dataset change fails loudly. */
export const LAB = {
  /** The same five cards as `goatsBuilt`, every role filled, but no thought: any plan, no star, no coach. */
  goatsLazy: { name: 'goats-preguicosos', ids: ['fallen-2019', 'coldzera-2017', 's1mple-2021', 'donk-2024', 'jl-2024'], roles: ['igl', 'awper', 'awper', 'entry', 'support'], style: 'balanced', star: null, coachId: null },
  /** `goatsLazy` with the caller swapped for another 98 rifler: the only thing missing is an IGL. */
  goatsLazyNoIgl: { name: 'goats-preguicosos-sem-igl', ids: ['niko-2017', 'coldzera-2017', 's1mple-2021', 'donk-2024', 'jl-2024'], roles: ['rifler', 'awper', 'awper', 'entry', 'support'], style: 'balanced', star: null, coachId: null },
  /** Four 99s and a 98 thrown together: no caller, no support, no star, no coach. The owner's "5 GOATs sem IGL". */
  goatsNoIgl: { name: 'goats-sem-igl', ids: ['s1mple-2021', 'donk-2024', 'coldzera-2017', 'zywoo-2023', 'niko-2017'], roles: ['awper', 'rifler', 'rifler', 'awper', 'rifler'], style: 'balanced', star: null, coachId: null },
  goatsBuilt: { name: 'goats-montados', ids: ['fallen-2019', 'coldzera-2017', 's1mple-2021', 'donk-2024', 'jl-2024'], roles: ['igl', 'awper', 'awper', 'entry', 'support'], style: 'aggressive', star: 'donk-2024', coachId: 'coach-natus-vincere-2021' },
  superstarsBuilt: { name: 'superstars-montados', ids: ['gla1ve-2021', 'molodoy-2026', 'yekindar-2026', 'niko-2026', 'rpk-2019'], roles: ['igl', 'awper', 'entry', 'rifler', 'support'], style: 'aggressive', star: 'yekindar-2026', coachId: 'coach-natus-vincere-2021' },

  superstarsThrown: { name: 'superstars-jogados', ids: ['gla1ve-2021', 'molodoy-2026', 'yekindar-2026', 'niko-2026', 'rpk-2019'], roles: ['igl', 'awper', 'entry', 'rifler', 'support'], style: 'balanced', star: null, coachId: null },
  beginner: { name: 'iniciante', ids: ['graviti-2026', 'maka-2026', 'grim-2026', 'ex3rcice-2026', 'sjuush-2026'], roles: ['igl', 'awper', 'entry', 'rifler', 'support'], style: 'balanced', star: null, coachId: null },
  ownerSk: { name: 'sk-do-dono', ids: ['taco-2016', 'fallen-2017', 'coldzera-2017', 'fer-2017', 'fnx-2016'], roles: ['entry', 'awper-igl', 'rifler', 'lurker', 'support'], style: 'aggressive', star: 'coldzera-2017', coachId: 'coach-sk-2017' },
  /** Five Elite cards (~85 overall), every role filled: the middle of the collection. */
  elites: { name: 'elites', ids: ['msl-2018', 'fox-2016', 'apex-2018', 'naf-2016', 'perfecto-2021'], roles: ['igl', 'awper', 'entry', 'rifler', 'support'], style: 'balanced', star: null, coachId: null }
} satisfies Record<string, LabBuild>;

/** The bot of each step of the bracket, from the opening one to the final wall. */
export const LAB_BOTS = {
  semHistoria: 'og-2023',
  top8: 'liquid-2023',
  semifinal: 'heroic-2021',
  vice: 'furia-2026',
  campeao: 'faze-2022',
  campeaoForte: 'astralis-2018'
} as const;

/** The champion bot closest to the average champion (raw 102.2 against a mean of 102.3). */
export const LAB_CHAMPION_BOT = LAB_BOTS.campeao;
