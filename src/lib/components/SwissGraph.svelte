<script lang="ts">
  import TeamBadge from './TeamBadge.svelte';
  import type { SwissGraph } from '$lib/game/majorOverview';

  export let graph: SwissGraph;
  export let userTeamId = '';
  export let showLiveScores = false;
  export let labels: { round: string; playoffs: string; eliminated: string; live: string; pending: string; noRounds: string };
  export let onTeam: (teamId: string) => void = () => {};

  const clickable = (teamId: string) => teamId !== userTeamId;
</script>

<div class="swiss-graph" role="region" aria-label="Swiss">
  {#if !graph.columns.length}
    <p class="swiss-empty">{labels.noRounds}</p>
  {:else}
    <div class="swiss-scroll">
      {#each graph.columns as column (column.roundNumber)}
        <section class="swiss-column">
          <header><span>{labels.round} {column.roundNumber}</span></header>
          {#each column.groups as group (group.record)}
            <article class="swiss-group" class:top={group.losses === 0} class:bottom={group.wins === 0 && group.losses > 0}>
              <b class="swiss-record">{group.record}</b>
              {#each group.series as entry (entry.series.id)}
                {@const winnerA = entry.status === 'completed' && entry.series.winnerId === entry.series.teamA.id}
                {@const winnerB = entry.status === 'completed' && entry.series.winnerId === entry.series.teamB.id}
                <div class="swiss-match" class:live={entry.status === 'live'} class:mine={entry.series.teamA.id === userTeamId || entry.series.teamB.id === userTeamId}>
                  <button type="button" class="swiss-team" class:winner={winnerA} class:loser={entry.status === 'completed' && !winnerA} class:user={entry.series.teamA.id === userTeamId} disabled={!clickable(entry.series.teamA.id)} on:click={() => onTeam(entry.series.teamA.id)}>
                    <TeamBadge id={entry.series.teamA.id} name={entry.series.teamA.name} highlight={entry.series.teamA.id === userTeamId} /><span>{entry.series.teamA.name}</span>
                    {#if entry.status === 'completed' || (showLiveScores && entry.status === 'live')}<b>{entry.series.scoreA}</b>{/if}
                  </button>
                  <button type="button" class="swiss-team" class:winner={winnerB} class:loser={entry.status === 'completed' && !winnerB} class:user={entry.series.teamB.id === userTeamId} disabled={!clickable(entry.series.teamB.id)} on:click={() => onTeam(entry.series.teamB.id)}>
                    <TeamBadge id={entry.series.teamB.id} name={entry.series.teamB.name} highlight={entry.series.teamB.id === userTeamId} /><span>{entry.series.teamB.name}</span>
                    {#if entry.status === 'completed' || (showLiveScores && entry.status === 'live')}<b>{entry.series.scoreB}</b>{/if}
                  </button>
                  <small>{entry.status === 'live' ? labels.live : entry.status === 'pending' ? labels.pending : `MD${entry.series.bestOf}`}</small>
                </div>
              {/each}
            </article>
          {/each}
        </section>
      {/each}
      {#if graph.qualified.length || graph.eliminated.length}
        <section class="swiss-column outcomes">
          {#if graph.qualified.length}
            <article class="swiss-outcome qualified">
              <header><span>{labels.playoffs}</span></header>
              {#each graph.qualified as outcome (outcome.record)}
                <b class="swiss-record">{outcome.record}</b>
                {#each outcome.teams as team (team.id)}
                  <button type="button" class="swiss-team" class:user={team.id === userTeamId} disabled={!clickable(team.id)} on:click={() => onTeam(team.id)}><TeamBadge id={team.id} name={team.name} highlight={team.id === userTeamId} /><span>{team.name}</span></button>
                {/each}
              {/each}
            </article>
          {/if}
          {#if graph.eliminated.length}
            <article class="swiss-outcome eliminated">
              <header><span>{labels.eliminated}</span></header>
              {#each graph.eliminated as outcome (outcome.record)}
                <b class="swiss-record">{outcome.record}</b>
                {#each outcome.teams as team (team.id)}
                  <button type="button" class="swiss-team" class:user={team.id === userTeamId} disabled={!clickable(team.id)} on:click={() => onTeam(team.id)}><TeamBadge id={team.id} name={team.name} highlight={team.id === userTeamId} /><span>{team.name}</span></button>
                {/each}
              {/each}
            </article>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .swiss-graph{min-width:0}
  .swiss-empty{margin:0;color:var(--muted);font-size:.72rem;text-align:center}
  .swiss-scroll{display:flex;gap:10px;align-items:flex-start;padding-bottom:8px;overflow-x:auto;scrollbar-width:thin;scroll-snap-type:x proximity}
  .swiss-column{display:grid;flex:0 0 232px;gap:8px;scroll-snap-align:start}
  .swiss-column>header span,.swiss-outcome>header span{display:block;padding:6px 8px;border:1px solid var(--line);color:var(--muted);font-size:.55rem;font-weight:900;letter-spacing:.12em;text-align:center;text-transform:uppercase}
  .swiss-group,.swiss-outcome{display:grid;gap:4px;padding:8px;border:1px solid var(--line);background:var(--surface-2)}
  .swiss-group.top{border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}.swiss-group.bottom{border-color:color-mix(in srgb,var(--danger) 45%,var(--line))}
  .swiss-record{margin:0 0 2px;color:var(--muted);font:900 .8rem 'Arial Narrow',Impact,sans-serif;letter-spacing:.06em}
  .swiss-group.top .swiss-record{color:var(--accent)}.swiss-group.bottom .swiss-record{color:var(--danger)}
  .swiss-match{position:relative;display:grid;gap:2px;padding:6px 6px 4px;border:1px solid var(--line);background:var(--surface)}
  .swiss-match.mine{border-color:color-mix(in srgb,var(--accent) 60%,var(--line))}
  .swiss-match.live{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent)}
  .swiss-match small{color:var(--muted);font-size:.5rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.swiss-match.live small{color:#ff7676}
  .swiss-team{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:6px;min-height:30px;padding:2px 4px;border:0;color:var(--text);background:transparent;font:inherit;text-align:left;cursor:pointer}
  .swiss-team:disabled{cursor:default;opacity:1}.swiss-team:not(:disabled):hover span{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
  .swiss-team span{overflow:hidden;font-size:.68rem;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.swiss-team b{font:900 .95rem 'Arial Narrow',Impact,sans-serif}
  .swiss-team.loser span,.swiss-team.loser b{color:var(--muted)}.swiss-team.winner b{color:var(--accent)}.swiss-team.user span{color:var(--accent)}
  .swiss-outcome.qualified{border-color:var(--accent);box-shadow:0 0 18px color-mix(in srgb,var(--accent) 18%,transparent)}.swiss-outcome.qualified .swiss-record,.swiss-outcome.qualified>header span{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 60%,var(--line))}
  .swiss-outcome.eliminated{border-color:var(--danger)}.swiss-outcome.eliminated .swiss-record,.swiss-outcome.eliminated>header span{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 60%,var(--line))}
  .outcomes{flex-basis:220px}
  @media(max-width:679px){.swiss-column{flex-basis:210px}}
</style>
