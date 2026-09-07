import type { BuyType, Language, MapResult, MapSide, RoundDetail, RoundEnding, RoundHighlight, RoundTag, TeamSide, Weapon } from './types';

export const BUY_LABELS: Record<Language, Record<BuyType, string>> = {
  'pt-BR': { pistol: 'PISTOL', eco: 'ECO', force: 'FORÇADO', full: 'FULL BUY' },
  es: { pistol: 'PISTOL', eco: 'ECO', force: 'FORZADO', full: 'FULL BUY' },
  en: { pistol: 'PISTOL', eco: 'ECO', force: 'FORCE', full: 'FULL BUY' }
};

export const SIDE_LABELS: Record<Language, Record<MapSide, string>> = {
  'pt-BR': { ct: 'CT', t: 'TR' },
  es: { ct: 'CT', t: 'TR' },
  en: { ct: 'CT', t: 'T' }
};

export const ENDING_LABELS: Record<Language, Record<RoundEnding, string>> = {
  'pt-BR': { elimination: 'Eliminação', bomb: 'Bomba explodiu', defuse: 'Bomba desarmada', time: 'Tempo esgotado' },
  es: { elimination: 'Eliminación', bomb: 'La bomba explotó', defuse: 'Bomba desactivada', time: 'Tiempo agotado' },
  en: { elimination: 'Elimination', bomb: 'Bomb exploded', defuse: 'Bomb defused', time: 'Time ran out' }
};

export const WEAPON_LABELS: Record<Weapon, string> = {
  ak47: 'AK-47', m4a1: 'M4A1-S', awp: 'AWP', usp: 'USP-S', glock: 'Glock-18', deagle: 'Desert Eagle',
  famas: 'FAMAS', galil: 'Galil AR', mac10: 'MAC-10', mp9: 'MP9', fiveseven: 'Five-SeveN', p250: 'P250',
  tec9: 'Tec-9', knife: 'Faca'
};

/** Short badges shown next to a round; only the tags worth a viewer's attention get one. */
export const ROUND_TAG_LABELS: Record<Language, Partial<Record<RoundTag, string>>> = {
  'pt-BR': { pistol: 'PISTOL', 'anti-eco': 'ANTI-ECO', 'force-win': 'FORÇADO VENCEU', 'eco-win': 'ECO VENCEU', clutch: 'CLUTCH', 'streak-break': 'QUEBROU A SÉRIE', 'comeback-alert': 'REAÇÃO', 'match-point': 'MATCH POINT', 'half-end': 'FIM DO TEMPO', '3k': '3K', '4k': '4K', ace: 'ACE' },
  es: { pistol: 'PISTOL', 'anti-eco': 'ANTI-ECO', 'force-win': 'GANÓ EL FORZADO', 'eco-win': 'GANÓ EL ECO', clutch: 'CLUTCH', 'streak-break': 'CORTÓ LA RACHA', 'comeback-alert': 'REACCIÓN', 'match-point': 'MATCH POINT', 'half-end': 'FIN DEL TIEMPO', '3k': '3K', '4k': '4K', ace: 'ACE' },
  en: { pistol: 'PISTOL', 'anti-eco': 'ANTI-ECO', 'force-win': 'FORCE BUY WIN', 'eco-win': 'ECO WIN', clutch: 'CLUTCH', 'streak-break': 'STREAK BROKEN', 'comeback-alert': 'FIGHTING BACK', 'match-point': 'MATCH POINT', 'half-end': 'HALF TIME', '3k': '3K', '4k': '4K', ace: 'ACE' }
};

const TAG_PRIORITY: RoundTag[] = ['ace', 'clutch', '4k', 'eco-win', 'force-win', 'comeback-alert', '3k', 'streak-break', 'anti-eco', 'match-point', 'pistol', 'half-end'];
/** Tags knowable from the round number before the outcome is committed. */
const IN_PROGRESS_TAG_PRIORITY: RoundTag[] = ['pistol', 'half-end'];

/** The single most interesting tag of a round, or null. */
export function highlightTag(detail: Pick<RoundDetail, 'tags'> | null | undefined): RoundTag | null {
  if (!detail) return null;
  return TAG_PRIORITY.find((tag) => detail.tags.includes(tag)) ?? null;
}

/**
 * Badge safe to show in the feed. Before resolution it deliberately excludes every tag derived from the winner,
 * score change or kill feed, so neither the text nor its color can reveal the result early.
 */
export function getVisibleRoundTag(detail: Pick<RoundDetail, 'tags'> | null | undefined, resolved: boolean): RoundTag | null {
  if (!detail) return null;
  if (resolved) return highlightTag(detail);
  return IN_PROGRESS_TAG_PRIORITY.find((tag) => detail.tags.includes(tag)) ?? null;
}

export const getRoundTagLabel = (language: Language, tag: RoundTag): string => ROUND_TAG_LABELS[language][tag] ?? ROUND_TAG_LABELS['pt-BR'][tag] ?? tag.toUpperCase();

export interface HighlightLabel {
  title: string;
  subtitle: string;
}

const KILLS_WORD: Record<Language, string> = { 'pt-BR': 'kills', es: 'kills', en: 'kills' };

/** Title and subtitle for an individual feat, e.g. { title: 'ACE', subtitle: 's1mple · 5 kills' } or { title: 'CLUTCH 1v3', subtitle: 'NiKo' }. */
export function getHighlightLabel(language: Language, highlight: RoundHighlight): HighlightLabel {
  const kills = KILLS_WORD[language] ?? KILLS_WORD['pt-BR'];
  switch (highlight.kind) {
    case 'ace':
      return { title: 'ACE', subtitle: `${highlight.playerName} · ${highlight.kills} ${kills}` };
    case 'quad':
      return { title: '4K', subtitle: `${highlight.playerName} · ${highlight.kills} ${kills}` };
    case 'triple':
      return { title: '3K', subtitle: `${highlight.playerName} · ${highlight.kills} ${kills}` };
    case 'clutch':
      return { title: `CLUTCH 1v${Math.max(2, highlight.against ?? 2)}`, subtitle: highlight.playerName };
  }
}

export type RoundFlashKind = RoundHighlight['kind'] | 'eco-win' | 'force-win' | 'comeback' | 'streak-break';

export interface RoundFlash {
  kind: RoundFlashKind;
  title: string;
  subtitle: string;
  /** Side celebrated by the flash: feat author for individual highlights, round winner for team events. */
  side: TeamSide;
}

const ROUND_EVENT_FLASHES: Record<Language, Record<Extract<RoundFlashKind, 'eco-win' | 'force-win' | 'comeback' | 'streak-break'>, HighlightLabel>> = {
  'pt-BR': {
    'eco-win': { title: 'ECO VENCEU', subtitle: 'Pistolas contra rifles' },
    'force-win': { title: 'FORÇADO VENCEU', subtitle: 'A compra forçada deu certo' },
    comeback: { title: 'REAÇÃO', subtitle: 'A virada está no ar' },
    'streak-break': { title: 'QUEBROU A SÉRIE', subtitle: 'Fim da sequência do rival' }
  },
  es: {
    'eco-win': { title: 'GANÓ EL ECO', subtitle: 'Pistolas contra rifles' },
    'force-win': { title: 'GANÓ EL FORZADO', subtitle: 'La compra forzada funcionó' },
    comeback: { title: 'REACCIÓN', subtitle: 'La remontada está en marcha' },
    'streak-break': { title: 'CORTÓ LA RACHA', subtitle: 'Se acabó la racha del rival' }
  },
  en: {
    'eco-win': { title: 'ECO WIN', subtitle: 'Pistols beat rifles' },
    'force-win': { title: 'FORCE BUY WIN', subtitle: 'The force buy paid off' },
    comeback: { title: 'FIGHTING BACK', subtitle: 'A comeback is brewing' },
    'streak-break': { title: 'STREAK BROKEN', subtitle: 'The rival run is over' }
  }
};

/**
 * What to flash on screen for a round, following the tag priority: an ace, a clutch or a 4k first, then the round-level
 * turnarounds (eco-win, force-win, comeback alert), then a 3k, then a broken streak. Null when nothing stands out.
 */
export function getRoundFlash(language: Language, detail: Pick<RoundDetail, 'winner' | 'tags' | 'highlight'>): RoundFlash | null {
  const events = ROUND_EVENT_FLASHES[language] ?? ROUND_EVENT_FLASHES['pt-BR'];
  const highlight = detail.highlight ? { kind: detail.highlight.kind, ...getHighlightLabel(language, detail.highlight), side: detail.highlight.side } : null;
  if (highlight && highlight.kind !== 'triple') return highlight;
  if (detail.tags.includes('eco-win')) return { kind: 'eco-win', ...events['eco-win'], side: detail.winner };
  if (detail.tags.includes('force-win')) return { kind: 'force-win', ...events['force-win'], side: detail.winner };
  if (detail.tags.includes('comeback-alert')) return { kind: 'comeback', ...events.comeback, side: detail.winner };
  if (highlight) return highlight;
  if (detail.tags.includes('streak-break')) return { kind: 'streak-break', ...events['streak-break'], side: detail.winner };
  return null;
}

export interface MapHeadline {
  kind: 'comeback' | 'overtime' | 'stomp' | 'pistols' | 'close';
  text: string;
  /** Team the headline celebrates. */
  side: TeamSide;
}

const HEADLINES: Record<Language, Record<MapHeadline['kind'], (team: string, extra: string) => string>> = {
  'pt-BR': {
    comeback: (team) => `VIRADA DE ${team}!`,
    overtime: (team, score) => `${team} LEVA NA PRORROGAÇÃO · ${score}`,
    stomp: (team, score) => `ATROPELO DE ${team} · ${score}`,
    pistols: (team) => `${team} FECHA OS DOIS PISTOLS`,
    close: (team, score) => `${team} FECHA NO DETALHE · ${score}`
  },
  es: {
    comeback: (team) => `¡REMONTADA DE ${team}!`,
    overtime: (team, score) => `${team} GANA EN LA PRÓRROGA · ${score}`,
    stomp: (team, score) => `PALIZA DE ${team} · ${score}`,
    pistols: (team) => `${team} SE LLEVA LOS DOS PISTOL`,
    close: (team, score) => `${team} CIERRA POR DETALLES · ${score}`
  },
  en: {
    comeback: (team) => `${team} COMEBACK!`,
    overtime: (team, score) => `${team} TAKES IT IN OVERTIME · ${score}`,
    stomp: (team, score) => `${team} STOMP · ${score}`,
    pistols: (team) => `${team} WINS BOTH PISTOLS`,
    close: (team, score) => `${team} CLOSES IT OUT · ${score}`
  }
};

/** One-line story of a finished map, from the winner's perspective. */
export function getMapHeadline(map: MapResult, names: { a: string; b: string }, language: Language = 'pt-BR'): MapHeadline | null {
  if (!map.winnerId || !map.rounds.length) return null;
  const winner: TeamSide = map.scoreA > map.scoreB ? 'a' : 'b';
  const team = names[winner].toUpperCase();
  const score = `${Math.max(map.scoreA, map.scoreB)}-${Math.min(map.scoreA, map.scoreB)}`;
  const build = HEADLINES[language] ?? HEADLINES['pt-BR'];
  if (map.comeback === winner) return { kind: 'comeback', text: build.comeback(team, score), side: winner };
  if (map.overtime) return { kind: 'overtime', text: build.overtime(team, score), side: winner };
  const pistols = (map.details ?? []).filter((round) => round.tags.includes('pistol'));
  if (Math.abs(map.scoreA - map.scoreB) >= 8) return { kind: 'stomp', text: build.stomp(team, score), side: winner };
  if (pistols.length === 2 && pistols.every((round) => round.winner === winner)) return { kind: 'pistols', text: build.pistols(team, score), side: winner };
  if (Math.abs(map.scoreA - map.scoreB) <= 2) return { kind: 'close', text: build.close(team, score), side: winner };
  return null;
}

/** Pistol rounds each team won on a map. */
export const countPistols = (details: RoundDetail[] | undefined): { a: number; b: number } =>
  (details ?? []).filter((round) => round.tags.includes('pistol')).reduce((acc, round) => ({ ...acc, [round.winner]: acc[round.winner] + 1 }), { a: 0, b: 0 });
