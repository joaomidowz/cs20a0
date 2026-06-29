<script lang="ts">
  import { translateTeamName } from '$lib/game/i18n';
  import {
    teamAverageOverall,
    teamPlacementLabel,
    teamPlayers,
    teamStyle,
    teamTags
  } from '$lib/game/teamViews';
  import type { HistoricalTeam, Language } from '$lib/game/types';

  export let team: HistoricalTeam;
  export let language: Language = 'en';
  export let onOpen: (team: HistoricalTeam) => void = () => {};

  $: roster = teamPlayers(team);
  $: average = teamAverageOverall(team, roster);
  $: tags = teamTags(team);
  $: placement = teamPlacementLabel(team);
  $: style = teamStyle(team, roster);
</script>

<button class="team-card" type="button" aria-label={`Abrir ${team.name ?? team.id} ${team.year ?? ''}`} on:click={() => onOpen(team)}>
  <header>
    <span class="team-avatar">{(team.name ?? 'T').slice(0, 2).toUpperCase()}</span>
    <div>
      <span class="eyebrow">{team.game ?? 'CS'} · {team.year ?? ''}</span>
      <h3>{translateTeamName(language, team.name ?? team.id)}</h3>
      <p>{placement} · {style}</p>
    </div>
    <strong>{average}</strong>
  </header>

  <div class="team-card-tags">
    {#each tags as tag}<span>{tag}</span>{/each}
  </div>

  <div class="team-card-roster">
    {#each roster.slice().sort((a, b) => (a.role ?? '').localeCompare(b.role ?? '')) as player (player.id)}
      <span>{player.nickname ?? 'Unknown'} <small>{player.role ?? 'rifler'}</small></span>
    {/each}
  </div>
</button>
