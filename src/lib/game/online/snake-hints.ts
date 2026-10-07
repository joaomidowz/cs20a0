import { collectionRoleOf, slotRolesOf, themeOf } from './collection-lineup';
import type { ThemeLine } from './collection-theme';
import { getEligibleSlotRoles } from '../roleRules';
import type { LineupSlotRole, Player, SelectedPlayer } from '../types';

/**
 * Fila Draft: dicas de sinergia durante o snake (dono, 2026-10-07: "time 95 sem carinho fica ruim"). Módulo puro, sem
 * dados: lê a line parcial e diz o que falta das três funções que a quadra cobra (IGL, AWPer, suporte), que temas estão
 * se formando (mesmo time, país ou ano) e, carta a carta do pool, qual preenche uma função que falta ou engrossa um tema.
 * A regra de "química" é a mesma de `synergyOf`: uma linha com três ou mais, e a era frouxa não conta.
 */
export const SNAKE_CORE_ROLES: readonly LineupSlotRole[] = ['igl', 'awper', 'support'];
/** Cartas de um mesmo tema a partir das quais a química fecha (espelha `no_chemistry` em `synergyOf`). */
export const SNAKE_CHEMISTRY_MIN = 3;

export interface SnakeThemeHint {
  key: ThemeLine['key'];
  theme: string;
  count: number;
  exact: boolean;
  power: number;
  /** Já fecha química: três ou mais, e não é só a mesma era. */
  locks: boolean;
}

export interface SnakeLineHints {
  picks: number;
  missingCore: LineupSlotRole[];
  themes: SnakeThemeHint[];
  chemistry: boolean;
}

export interface SnakeCardHint {
  /** Função central que a carta preencheria (a line ainda não a tem). */
  fills: LineupSlotRole | null;
  /** Tema que a carta engrossaria (contagem sobe com ela), já com a contagem resultante. */
  theme: SnakeThemeHint | null;
}

const locksChemistry = (line: ThemeLine): boolean => line.count >= SNAKE_CHEMISTRY_MIN && !(line.key === 'theme_year' && !line.exact);

const toHint = (line: ThemeLine): SnakeThemeHint => ({ key: line.key, theme: line.theme, count: line.count, exact: line.exact, power: line.power, locks: locksChemistry(line) });

const themesOf = (players: Player[], roles: ReturnType<typeof collectionRoleOf>[]): SnakeThemeHint[] =>
  themeOf({ players, roles, starPlayerId: null }).map(toHint).sort((left, right) => right.count - left.count || right.power - left.power);

function resolve(lineup: readonly SelectedPlayer[], lookup: (id: string) => Player | undefined) {
  const players: Player[] = [];
  const roles: ReturnType<typeof collectionRoleOf>[] = [];
  for (const pick of lineup) {
    const player = lookup(pick.playerId);
    if (!player) continue;
    players.push(player);
    roles.push(collectionRoleOf(pick));
  }
  return { players, roles };
}

/** O que a line parcial já tem e o que falta. */
export function snakeLineHints(lineup: readonly SelectedPlayer[], lookup: (id: string) => Player | undefined): SnakeLineHints {
  const { players, roles } = resolve(lineup, lookup);
  const covered = new Set<LineupSlotRole>(roles.flatMap((role) => slotRolesOf(role)));
  const themes = themesOf(players, roles);
  return {
    picks: players.length,
    missingCore: SNAKE_CORE_ROLES.filter((role) => !covered.has(role)),
    themes,
    chemistry: themes.some((line) => line.locks)
  };
}

/** O que esta carta do pool acrescentaria à line: uma função central que falta e/ou um tema que cresce. */
export function snakeCardHint(candidate: Player, lineup: readonly SelectedPlayer[], lookup: (id: string) => Player | undefined, hints: SnakeLineHints): SnakeCardHint {
  const eligible = getEligibleSlotRoles(candidate);
  const fills = hints.picks >= 5 ? null : hints.missingCore.find((role) => eligible.includes(role)) ?? null;
  let theme: SnakeThemeHint | null = null;
  if (hints.picks > 0 && hints.picks < 5) {
    const { players, roles } = resolve(lineup, lookup);
    const after = themesOf([...players, candidate], [...roles, eligible[0] ?? 'rifler']);
    const grown = after
      .filter((line) => line.count >= 2 && line.count > (hints.themes.find((before) => before.key === line.key && before.theme === line.theme)?.count ?? 0))
      // Prefere o que fecha química, depois o nível exato, depois a linha maior.
      .sort((left, right) => Number(right.locks) - Number(left.locks) || Number(right.exact) - Number(left.exact) || right.count - left.count || right.power - left.power);
    theme = grown[0] ?? null;
  }
  return { fills, theme };
}

/** Dicas de todas as cartas livres do pool, por id. */
export function snakeCardHints(pool: readonly Player[], lineup: readonly SelectedPlayer[], lookup: (id: string) => Player | undefined): Map<string, SnakeCardHint> {
  const hints = snakeLineHints(lineup, lookup);
  const taken = new Set(lineup.map((pick) => pick.playerId));
  const result = new Map<string, SnakeCardHint>();
  for (const player of pool) {
    if (taken.has(player.id)) continue;
    const hint = snakeCardHint(player, lineup, lookup, hints);
    if (hint.fills || hint.theme) result.set(player.id, hint);
  }
  return result;
}
