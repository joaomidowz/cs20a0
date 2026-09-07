<script lang="ts">
  import TeamBadge from './TeamBadge.svelte';
  import type { BracketColumn } from '$lib/game/majorOverview';

  export let columns: BracketColumn[] = [];
  export let userTeamId = '';
  export let championId: string | null = null;
  export let labels: { quarterfinal: string; semifinal: string; final: string; tbd: string; live: string; pending: string };
  export let onTeam: (teamId: string) => void = () => {};
  /** When provided, live matches become buttons that open that series. */
  export let onSeries: ((seriesId: string) => void) | null = null;

  const watchable = (match: BracketColumn['matches'][number]) => Boolean(onSeries) && match.id !== null && match.status === 'live';
  const openSeries = (match: BracketColumn['matches'][number]) => { if (match.id) onSeries?.(match.id); };
  const onSeriesKey = (event: KeyboardEvent, match: BracketColumn['matches'][number]) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    openSeries(match);
  };
</script>

<div class="bracket" role="region" aria-label={labels.final}>
  {#each columns as column (column.phase)}
    <section class="bracket-column {column.phase}">
      <header><span>{labels[column.phase]}</span></header>
      <div class="bracket-matches">
        {#each column.matches as match, index (match.id ?? `${column.phase}-${index}`)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <article class="bracket-match" class:live={match.status === 'live'} class:tbd={match.status === 'tbd'} class:mine={match.a.id === userTeamId || match.b.id === userTeamId} class:watchable={watchable(match)} role={watchable(match) ? 'button' : undefined} tabindex={watchable(match) ? 0 : undefined} aria-label={watchable(match) ? `${match.a.name ?? labels.tbd} x ${match.b.name ?? labels.tbd}` : undefined} on:click={() => watchable(match) && openSeries(match)} on:keydown={(event) => watchable(match) && onSeriesKey(event, match)}>
            {#each [match.a, match.b] as slot, slotIndex}
              {#if slot.id}
                <button type="button" class="bracket-slot" class:winner={slot.winner} class:loser={match.status === 'completed' && !slot.winner} class:user={slot.id === userTeamId} class:champion={column.phase === 'final' && slot.id === championId} disabled={slot.id === userTeamId} on:click|stopPropagation={() => slot.id && onTeam(slot.id)}>
                  <TeamBadge id={slot.id} name={slot.name ?? ''} highlight={slot.id === userTeamId} /><span>{slot.name}</span>{#if slot.score !== null}<b>{slot.score}</b>{/if}
                </button>
              {:else}
                <div class="bracket-slot empty"><i></i><span>{labels.tbd}</span></div>
              {/if}
              {#if slotIndex === 0}<small>{match.status === 'live' ? labels.live : match.status === 'pending' ? labels.pending : ''}</small>{/if}
            {/each}
          </article>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .bracket{display:grid;grid-template-columns:repeat(3,minmax(200px,1fr));gap:18px;min-width:0;overflow-x:auto;scrollbar-width:thin;padding-bottom:6px}
  .bracket-column{display:grid;grid-template-rows:auto 1fr;gap:8px;min-width:200px}
  .bracket-column>header span{display:block;padding:6px 8px;border:1px solid var(--line);color:var(--muted);font-size:.55rem;font-weight:900;letter-spacing:.12em;text-align:center;text-transform:uppercase}
  .bracket-column.final>header span{border-color:var(--accent);color:var(--accent)}
  .bracket-matches{display:flex;flex-direction:column;justify-content:space-around;gap:10px}
  .bracket-match{position:relative;display:grid;gap:2px;padding:6px;border:1px solid var(--line);background:var(--surface-2)}
  .bracket-match.mine{border-color:color-mix(in srgb,var(--accent) 60%,var(--line))}.bracket-match.live{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent)}.bracket-match.tbd{border-style:dashed}
  .bracket-match.watchable{cursor:pointer}.bracket-match.watchable:hover,.bracket-match.watchable:focus-visible{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,var(--surface-2))}.bracket-match.watchable:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  .bracket-column:not(.final) .bracket-match::after{content:'';position:absolute;right:-18px;top:50%;width:18px;height:1px;background:var(--line)}
  .bracket-match small{position:absolute;right:6px;top:-7px;padding:1px 5px;background:var(--surface);color:#ff7676;font-size:.48rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.bracket-match small:empty{display:none}
  .bracket-slot{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:7px;min-height:34px;padding:3px 5px;border:0;color:var(--text);background:transparent;font:inherit;text-align:left;cursor:pointer}
  .bracket-slot:disabled{cursor:default;opacity:1}.bracket-slot:not(:disabled):hover span{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
  .bracket-slot span{overflow:hidden;font-size:.7rem;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.bracket-slot b{font:900 1rem 'Arial Narrow',Impact,sans-serif}
  .bracket-slot.loser span,.bracket-slot.loser b{color:var(--muted)}.bracket-slot.winner b{color:var(--accent)}.bracket-slot.user span{color:var(--accent)}
  .bracket-slot.champion span{color:var(--accent)}.bracket-slot.champion::after{content:'★';color:var(--accent);font-size:.7rem}
  .bracket-slot.empty i{width:26px;height:26px;border:1px dashed var(--line)}.bracket-slot.empty span{color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;font-size:.58rem}
  @media(max-width:679px){.bracket{grid-template-columns:repeat(3,200px)}}
</style>
