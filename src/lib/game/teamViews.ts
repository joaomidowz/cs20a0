import { getTeamPlayers } from './data';
import type { GameMode, HistoricalTeam, Player } from './types';

type PlayerWithAwards = Player & {
  hltvTop20?: { year?: number; rank?: number } | null;
  rookieAward?: { year?: number; type?: string } | null;
};

const YEAR_PATTERN = /(20\d{2})/g;

export const shouldShowPlayerAwards = (mode: GameMode | null | undefined, context: 'game' | 'teams' = 'game') =>
  context === 'teams' || mode === 'premier';

export const teamPlayers = (team: HistoricalTeam | null) => getTeamPlayers(team);

export const teamAverageOverall = (team: HistoricalTeam | null, roster = teamPlayers(team)) => {
  if (!team) return 0;
  if (!roster.length) return Number(team.teamPowerPreview ?? team.power ?? 0);
  const total = roster.reduce((sum, player) => sum + Number(player.overall ?? 70), 0);
  return Math.round(total / roster.length);
};

export const teamStyle = (team: HistoricalTeam | null, roster = teamPlayers(team)) => {
  if (team?.style) return String(team.style);
  const firepower = roster.reduce((sum, player) => sum + Number(player.firepower ?? 70), 0) / Math.max(1, roster.length);
  const igl = roster.reduce((sum, player) => sum + Number(player.igl ?? 30), 0) / Math.max(1, roster.length);
  if (firepower >= igl + 8) return 'aggressive';
  if (igl >= firepower + 8) return 'tactical';
  return 'balanced';
};

export const teamPlacementLabel = (team: HistoricalTeam | null) => {
  const summary = team?.majorSummary;
  if (!team) return 'participant';
  if (summary?.bestPlacement) return summary.bestPlacement;
  const badges = team.badges ?? [];
  if (badges.includes('major-champion')) return 'champion';
  if (badges.includes('major-finalist')) return 'finalist';
  if (badges.includes('major-semifinalist')) return 'semifinal';
  if (badges.includes('major-playoff-team')) return 'top8';
  if (badges.includes('major-stage3')) return 'stage3';
  if (badges.includes('major-stage2')) return 'stage2';
  if (badges.includes('major-stage1')) return 'stage1';
  return team.sourceRank ? `Rank #${team.sourceRank}` : 'participant';
};

export const teamPlacementOrder = (team: HistoricalTeam) => {
  const placement = teamPlacementLabel(team).toLowerCase();
  const badges = team.badges ?? [];
  let order = 11;
  if (placement.includes('champion') || badges.includes('major-champion')) order = 1;
  else if (placement.includes('final') || placement.includes('runner') || badges.includes('major-finalist')) order = 2;
  else if (placement.includes('semi') || placement.includes('3-4') || placement.includes('3rd') || badges.includes('major-semifinalist')) order = 3;
  else if (placement.includes('top8') || placement.includes('top 8') || placement.includes('5-8') || badges.includes('major-playoff-team')) order = 4;
  else if (placement.includes('9-11')) order = 5;
  else if (placement.includes('12-14')) order = 6;
  else if (placement.includes('15-16')) order = 7;
  else if (placement.includes('stage3') || placement.includes('stage 3') || badges.includes('major-stage3')) order = 8;
  else if (placement.includes('stage2') || placement.includes('stage 2') || badges.includes('major-stage2')) order = 9;
  else if (placement.includes('stage1') || placement.includes('stage 1') || placement.includes('opening') || badges.includes('major-stage1')) order = 10;
  if (team.needsReview) order += 100;
  return order;
};

export const sortTeamsByPlacement = (left: HistoricalTeam, right: HistoricalTeam) =>
  teamPlacementOrder(left) - teamPlacementOrder(right) ||
  Number(left.sourceRank ?? left.rank ?? 999) - Number(right.sourceRank ?? right.rank ?? 999) ||
  (left.name ?? left.id).localeCompare(right.name ?? right.id);

export const teamTags = (team: HistoricalTeam | null) => {
  const tags = new Set<string>();
  for (const badge of team?.badges ?? []) {
    if (badge.startsWith('hltv-team')) continue;
    tags.add(badge.replace(/^major-/, ''));
  }
  if (!tags.size) tags.add(teamPlacementLabel(team));
  return [...tags].slice(0, 5);
};

const isSameYearAward = (value: string, year?: number | null) => {
  if (!year) return true;
  const years = [...value.matchAll(YEAR_PATTERN)].map((match) => Number(match[1]));
  return !years.length || years.includes(year);
};

const labelFromBadge = (badge: string) => badge
  .replace(/^major-mvp[- ]?/, 'Major MVP ')
  .replace(/^major-evp[- ]?/, 'Major EVP ')
  .replace(/^hltv-top20-rank-(\d+)-(\d{4})$/, 'HLTV Top 20 $2 #$1')
  .replace(/^hltv-top20-(\d{4})$/, 'HLTV Top 20 $1')
  .replace(/^hltv-top20$/, 'HLTV Top 20')
  .replace(/^rookie-of-the-year-(\d{4})$/, 'Rookie of the Year $1')
  .replace(/^rookie-finalist-(\d{4})$/, 'Rookie finalist $1')
  .replace(/^major-champion$/, 'Major Champion')
  .replace(/^major-finalist$/, 'Major Finalist')
  .replace(/-/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase())
  .trim();

export const playerAwardLabels = (player: Player) => {
  const withAwards = player as PlayerWithAwards;
  const labels = new Set<string>();

  if (player.title && !/sem title/i.test(player.title)) labels.add(player.title);
  for (const award of player.awardBadges ?? []) {
    if (isSameYearAward(award, player.year)) labels.add(award);
  }
  if (withAwards.hltvTop20?.rank && withAwards.hltvTop20.year === player.year) {
    labels.add(`HLTV Top 20 ${player.year} #${withAwards.hltvTop20.rank}`);
  }
  const rookieAward = withAwards.rookieAward;
  if (rookieAward && rookieAward.year === player.year && rookieAward.type) {
    labels.add(labelFromBadge(`${rookieAward.type}-${player.year}`));
  }
  for (const badge of player.badges ?? []) {
    const relevant =
      badge.includes('major-mvp') ||
      badge.includes('major-evp') ||
      badge.includes('hltv-top20') ||
      badge.includes('rookie') ||
      badge === 'major-champion' ||
      badge === 'major-finalist';
    if (relevant && isSameYearAward(badge, player.year)) labels.add(labelFromBadge(badge));
  }

  return [...labels].filter(Boolean);
};

export const roleRelevantAttributes = (player: Player) => {
  const role = (player.role ?? 'rifler').toLowerCase();
  const attributes = role.includes('awp')
    ? ['awp', 'firepower', 'clutch', 'consistency']
    : role.includes('igl')
      ? ['igl', 'mental', 'experience', 'support']
      : role.includes('entry')
        ? ['entry', 'firepower', 'mental', 'consistency']
        : role.includes('lurker')
          ? ['clutch', 'firepower', 'mental', 'consistency']
          : role.includes('support')
            ? ['support', 'experience', 'clutch', 'mental']
            : ['firepower', 'clutch', 'entry', 'consistency'];

  return attributes
    .map((attribute) => ({
      key: attribute,
      value: Number(player[attribute as keyof Player])
    }))
    .filter((attribute) => Number.isFinite(attribute.value));
};
