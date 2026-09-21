import { COURT_TOP, courtPower, rawFromCourt } from '../courtPower';
import { BOT_NATURAL_RANGE, PEDIGREE_LEVEL_BAND, SOLO_CHAMPIONS_RELIEF, SOLO_RANDOM_RELIEF, ZEBRA_LEVEL_CAP, ZEBRA_LIFT_COURT, type BotPedigree } from '../balance';
import { createSeededRng } from '../simulation';
import type { HistoricalTeam, Player } from '../types';

/**
 * Bot field of an online run. The draw used to be uniform over every team-year, which left three runs in ten without
 * a single Major champion and made the title a farm. Now a run always has champions to beat, the teams that went far
 * in a real Major are a little stronger than their sheet, and one to three underdogs come with wind in their sails.
 *
 * Every number here was tuned on the real series engine, not on `getWinProbability`: in a best-of-three two points of
 * power are already 67/33 and four are 82/18, and match-day power is cut at MAX_TEAM_POWER + 4 for everybody. A buff
 * that looks small on paper is large on the server.
 */

/** Best real Major placement of a team-year, from `majorSummary`. */
export type BotPlacement = 'champion' | 'finalist' | 'semifinal' | 'top8' | 'none';

/**
 * Where each kind of bot sits on the court scale: the tournament's own ladder, from the team with no Major history
 * (the opening step) up to the champion (the final wall). The numbers live in `src/lib/game/balance.ts`.
 */
export { BOT_NATURAL_RANGE, PEDIGREE_LEVEL_BAND };

/** A escada da taxonomia, do degrau de entrada à parede final. */
export const PEDIGREE_ORDER: readonly BotPedigree[] = [
  'noneFiller',
  'nonePotencial',
  'top8',
  'semifinalista',
  'viceUnderdog',
  'viceMerecedor',
  'campeaoUnderdog',
  'campeaoForte',
  'dinastia'
];

/** Elenco médio a partir do qual um time sem colocação deixa de ser mero preenchimento. */
const POTENTIAL_MIN_OVERALL = 82.5;
/** Campeão com este ranking ou melhor (ou elenco deste tamanho) dominou o ano, não pegou carona na zebra. */
const CHAMPION_DOMINANT_RANK = 5;
const CHAMPION_DOMINANT_OVERALL = 91;
/** Vice que merecia o título: ranking, recorrência (F+SF) ou elenco de campeão. */
const VICE_DESERVING_RANK = 6;
const VICE_DESERVING_RUNS = 3;
const VICE_DESERVING_OVERALL = 91;

/**
 * Julgamentos à mão, com o conflito anotado no relatório da taxonomia: o dataset dá rank 2 ao Outsiders do Rio
 * 2022, mas aquele título foi zebra histórica de um elenco de 88 — o dono classificou como campeão underdog.
 */
const PEDIGREE_OVERRIDES: Readonly<Record<string, BotPedigree>> = {
  'outsiders-2022': 'campeaoUnderdog'
};

/**
 * O PEDIGREE fino de um time-ano: nove categorias combinadas com o dono em 2026-09-21
 * (`docs/reports/2026-09-21-taxonomia-pedigree.md`). As eras vêm das regras gerais: a Astralis pós-títulos só
 * volta a ameaçar pela força do elenco (tier S/S+, como a de 2020 — o ano sem Major), e a Vitality fora da era
 * 2023–2025 é só mais um time pelo elenco e ranking.
 */
export function pedigreeOf(team: HistoricalTeam, playerById: ReadonlyMap<string, Pick<Player, 'overall'>>): BotPedigree {
  const override = PEDIGREE_OVERRIDES[team.id];
  if (override) return override;
  const summary = team.majorSummary;
  const titles = summary?.titles ?? 0;
  const finals = summary?.finals ?? 0;
  const semis = summary?.semifinals ?? 0;
  const top8 = summary?.top8 ?? 0;
  const rank = team.sourceRank ?? Number.POSITIVE_INFINITY;
  const overall = rosterAverageOverall(team, playerById);
  if (titles >= 2) return 'dinastia';
  if (titles === 1) return rank <= CHAMPION_DOMINANT_RANK || overall >= CHAMPION_DOMINANT_OVERALL ? 'campeaoForte' : 'campeaoUnderdog';
  if (finals >= 1) return rank <= VICE_DESERVING_RANK || finals + semis >= VICE_DESERVING_RUNS || overall >= VICE_DESERVING_OVERALL ? 'viceMerecedor' : 'viceUnderdog';
  if (semis >= 1) return 'semifinalista';
  if (top8 >= 1) return 'top8';
  return (team.tier === 'S' || team.tier === 'S+' || overall >= POTENTIAL_MIN_OVERALL) ? 'nonePotencial' : 'noneFiller';
}

/** An underdog is a team whose five average this overall or more... */
export const UNDERDOG_MIN_OVERALL = 80;
/** ...and less than this. */
export const UNDERDOG_MAX_OVERALL = 90;
/** Underdogs of a run that get the boost: at least this many... */
export const ZEBRAS_MIN = 1;
/** ...and at most this many, the room seed decides. */
export const ZEBRAS_MAX = 2;
/**
 * Boost of a zebra. Below 20% it never shows: at +15% the average underdog still loses 98% of its series to a strong
 * lineup. At +20% it wins about 15% of them, is a coin flip against a mid lineup and beats a buffed champion one time in four.
 */
export const ZEBRA_BOOST = 0.2;
/** A zebra is dangerous, not a monster: capped around the level of a Major champion, below the best lineups. */
export const ZEBRA_POWER_CAP = 103;
/** Champions every full field has at least (a sixteen-team run); smaller fields scale it down. */
export const GUARANTEED_CHAMPIONS = 2;

export function botPlacementOf(team: Pick<HistoricalTeam, 'majorSummary'>): BotPlacement {
  const summary = team.majorSummary;
  if (summary?.titles) return 'champion';
  if (summary?.finals) return 'finalist';
  if (summary?.semifinals) return 'semifinal';
  if (summary?.top8) return 'top8';
  return 'none';
}

/** Average overall of the roster; 0 when the team has no known player. */
export function rosterAverageOverall(team: Pick<HistoricalTeam, 'players'>, playerById: ReadonlyMap<string, Pick<Player, 'overall'>>): number {
  const overalls = (team.players ?? []).map((id) => playerById.get(id)?.overall).filter((value): value is number => typeof value === 'number');
  return overalls.length ? overalls.reduce((sum, value) => sum + value, 0) / overalls.length : 0;
}

/** Whether an average overall is in the underdog band; shared with the collection lineup, where a player can be one too. */
export const isUnderdogAverage = (average: number): boolean => average >= UNDERDOG_MIN_OVERALL && average < UNDERDOG_MAX_OVERALL;

/** A bot that can be a zebra: underdog roster that never reached a Major semifinal (those already carry their own buff). */
export function isZebraCandidate(team: HistoricalTeam, playerById: ReadonlyMap<string, Pick<Player, 'overall'>>): boolean {
  const placement = botPlacementOf(team);
  return (placement === 'none' || placement === 'top8') && isUnderdogAverage(rosterAverageOverall(team, playerById));
}

export interface BotFieldPlan {
  /** Every team, the ones that open the run first: the engine takes the head of this list. */
  order: HistoricalTeam[];
  zebraIds: ReadonlySet<string>;
}

/**
 * Orders an already shuffled pool so the first `slots` teams hold the guaranteed champions and the zebras of the run.
 * The rest of the field, and everything after it, stays in the shuffled order, so the draw is as random as before.
 * Deterministic: the same seed always gives the same field.
 */
export function planBotField(input: { shuffled: readonly HistoricalTeam[]; playerById: ReadonlyMap<string, Pick<Player, 'overall'>>; seed: string; slots: number }): BotFieldPlan {
  const { shuffled, playerById, seed } = input;
  const slots = Math.max(0, Math.min(input.slots, shuffled.length));
  // A quarter of the field at most goes to each guarantee, so a four-bot field is not all champions and zebras.
  const share = Math.floor(slots / 4);
  const championCount = Math.min(GUARANTEED_CHAMPIONS, share);
  const zebraRoll = ZEBRAS_MIN + Math.floor(createSeededRng(`${seed}:zebras`)() * (ZEBRAS_MAX - ZEBRAS_MIN + 1));
  const zebraCount = Math.min(zebraRoll, share);
  const champions = shuffled.filter((team) => botPlacementOf(team) === 'champion').slice(0, championCount);
  const zebras = shuffled.filter((team) => isZebraCandidate(team, playerById)).slice(0, zebraCount);
  const reserved = new Set([...champions, ...zebras].map((team) => team.id));
  const others = shuffled.filter((team) => !reserved.has(team.id));
  // The guaranteed teams keep their shuffled position among the opening slots instead of always taking the top seeds.
  const opening = [...champions, ...zebras, ...others.slice(0, slots - reserved.size)];
  const position = new Map(shuffled.map((team, index) => [team.id, index]));
  opening.sort((left, right) => (position.get(left.id) ?? 0) - (position.get(right.id) ?? 0));
  return { order: [...opening, ...others.slice(slots - reserved.size)], zebraIds: new Set(zebras.map((team) => team.id)) };
}

/**
 * How many levels the whole bot field comes down for a solo run, from the level of the player's team. The "Major
 * normal" uses `SOLO_RANDOM_RELIEF`; the "Major dos Campeões" — the endgame wall — uses `SOLO_CHAMPIONS_RELIEF`,
 * both in `balance.ts`, interpolated between their rows. Zero outside the solo modes.
 */
export function soloFieldRelief(playerLevel: number, field: 'random' | 'champions' = 'champions'): number {
  const rows = field === 'random' ? SOLO_RANDOM_RELIEF : SOLO_CHAMPIONS_RELIEF;
  if (playerLevel <= rows[0][0]) return rows[0][1];
  for (let index = 1; index < rows.length; index += 1) {
    const [level, relief] = rows[index];
    const [previousLevel, previousRelief] = rows[index - 1];
    if (playerLevel <= level) return previousRelief + ((playerLevel - previousLevel) / (level - previousLevel)) * (relief - previousRelief);
  }
  return rows[rows.length - 1][1];
}

/**
 * Fila/festa com 2+ humanos: o campo de bots cai pela METADE do alívio solo, medido pelo humano mais forte da sala.
 * É o "protagonismo" do online — leve, os bots seguem na escada real — e só toca bots: humano contra humano
 * permanece sem qualquer handicap.
 */
export const PARTY_RELIEF_RATIO = 0.5;

export function partyFieldRelief(strongestHumanLevel: number, field: 'random' | 'champions' = 'random'): number {
  return soloFieldRelief(strongestHumanLevel, field) * PARTY_RELIEF_RATIO;
}

/**
 * Power a bot takes to the run: its place on the ladder by Major pedigree, or the zebra boost when the run made it
 * one. A bot is never made weaker than it already was — the ladder only lifts. The one exception is `relief`, the
 * levels the field of a SOLO run comes down as the player's team improves: it is taken off after everything else,
 * so every bot keeps its place relative to the others.
 */
export function botFieldPower(basePower: number, team: HistoricalTeam, zebra: boolean, relief: number, playerById: ReadonlyMap<string, Pick<Player, 'overall'>>, zebraScale = 1): number {
  // 1. O nível do bot: a faixa do pedigree fino dele, e dentro dela o lugar que o elenco merece.
  const [bandMin, bandMax] = PEDIGREE_LEVEL_BAND[pedigreeOf(team, playerById)];
  const [naturalMin, naturalMax] = BOT_NATURAL_RANGE;
  const natural = courtPower(basePower);
  const share = Math.max(0, Math.min(1, (natural - naturalMin) / (naturalMax - naturalMin)));
  const laddered = bandMin + (bandMax - bandMin) * share;
  // 2. O vento nas costas da zebra, com teto próprio: ela é perigosa, não é campeão de Major disfarçado.
  const lifted = zebra ? Math.min(ZEBRA_LEVEL_CAP, laddered + ZEBRA_LIFT_COURT * zebraScale) : laddered;
  // 3. E, por último, o alívio do campo de quem joga sozinho contra bots.
  return rawFromCourt(lifted - Math.max(0, relief));
}
