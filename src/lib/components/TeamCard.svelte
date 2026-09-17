<script lang="ts">
  import { getCatalogContext } from '$lib/game/catalogContext';
  import { translate, translateTeamName } from '$lib/game/i18n';
  import {
    teamAverageOverall,
    teamPlacementLabel,
    teamStyle,
    teamTags
  } from '$lib/game/teamViews';
  import type { HistoricalTeam, Language } from '$lib/game/types';
  import CountryFlag from './CountryFlag.svelte';
  import TeamBadge from './TeamBadge.svelte';

  export let team: HistoricalTeam;
  export let language: Language = 'en';
  export let onOpen: (team: HistoricalTeam) => void = () => {};

  // Rosters, org ids and countries resolve on the page's catalog (core when no page set one: no identities there).
  const catalog = getCatalogContext();
  $: roster = $catalog.getTeamPlayers(team);
  $: average = teamAverageOverall(team, roster);
  $: tags = teamTags(team);
  $: placement = teamPlacementLabel(team);
  $: style = teamStyle(team, roster);
  $: orgId = $catalog.teamOrgId(team);
  $: country = $catalog.teamCountry(team);
</script>

<button class="team-card" type="button" aria-label={`${translate(language, 'openTeam')}: ${team.name ?? team.id} ${team.year ?? ''}`} on:click={() => onOpen(team)}>
  <header>
    <TeamBadge id={team.id} name={team.name ?? ''} size="xl" {orgId} />
    <div>
      <span class="eyebrow"><CountryFlag code={country} {language} /> {team.game ?? 'CS'} · {team.year ?? ''}</span>
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
