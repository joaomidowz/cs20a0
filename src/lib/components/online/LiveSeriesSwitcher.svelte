<script lang="ts">
  import { getMapName } from '$lib/game/maps';
  import type { PublicOverviewSeries } from '$lib/game/online/contracts';

  export let series: PublicOverviewSeries[] = [];
  export let activeId: string | null = null;
  export let myTeamId = '';
  export let labels: { title: string; myMatch: string; live: string };
  export let onSelect: (seriesId: string) => void = () => {};

  const isMine = (item: PublicOverviewSeries) => Boolean(myTeamId) && (item.teamA.id === myTeamId || item.teamB.id === myTeamId);
  $: live = series.filter((item) => item.status === 'live').sort((left, right) => Number(isMine(right)) - Number(isMine(left)));
  $: visible = live.length > 1 || (live.length === 1 && live[0].id !== activeId);
  $: mapLabel = (item: PublicOverviewSeries) => item.liveMap ? `${item.liveMap.mapId ? getMapName(item.liveMap.mapId) : '—'} ${item.liveMap.a}–${item.liveMap.b}` : '';
</script>

{#if visible}
  <nav class="series-switcher" aria-label={labels.title}>
    <span class="eyebrow">{labels.title.toUpperCase()} · {live.length}</span>
    <div class="series-strip">
      {#each live as item (item.id)}
        <button type="button" class:active={item.id === activeId} class:mine={isMine(item)} aria-pressed={item.id === activeId} on:click={() => onSelect(item.id)}>
          <small>{isMine(item) ? labels.myMatch : labels.live}{#if item.status === 'live' && !isMine(item)} · MD{item.bestOf}{/if}</small>
          <strong>{item.teamA.name} <em>x</em> {item.teamB.name}</strong>
          <span>{item.scoreA}–{item.scoreB}{#if mapLabel(item)} · {mapLabel(item)}{/if}</span>
        </button>
      {/each}
    </div>
  </nav>
{/if}

<style>
  .series-switcher{display:grid;gap:6px;min-width:0;margin:0 0 12px}
  .series-strip{display:flex;gap:6px;min-width:0;padding-bottom:4px;overflow-x:auto;scrollbar-width:thin;scroll-snap-type:x proximity}
  .series-strip button{display:grid;flex:0 0 auto;gap:2px;min-width:168px;max-width:240px;padding:8px 10px;border:1px solid var(--line);color:var(--text);background:var(--surface-2);font:inherit;text-align:left;cursor:pointer;scroll-snap-align:start}
  .series-strip button:hover,.series-strip button:focus-visible{border-color:color-mix(in srgb,var(--accent) 60%,var(--line))}
  .series-strip button.active{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent);cursor:default}
  .series-strip button.mine small{color:var(--accent)}
  .series-strip small{color:#ff7676;font-size:.5rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
  .series-strip strong{overflow:hidden;font-size:.68rem;text-overflow:ellipsis;white-space:nowrap}.series-strip strong em{color:var(--muted);font-style:normal;font-weight:400}
  .series-strip span{color:var(--muted);font-size:.6rem;font-weight:700;font-variant-numeric:tabular-nums}
</style>
