<script lang="ts">
  import type { SeriesResult } from '$lib/game/types';

  export let series: SeriesResult;
  export let delay = 1500;
  export let auto = false;
  export let labels: {
    start: string;
    skip: string;
    round: string;
    map?: string;
    final?: string;
    waiting?: string;
  };
  export let onComplete: () => void = () => {};

  let activeMap = 0;
  let visibleRounds = 0;
  let started = false;
  let finished = false;
  let runId = 0;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  $: currentMap = series.maps[activeMap];
  $: currentRound = visibleRounds > 0 ? currentMap?.rounds[visibleRounds - 1] : null;
  $: if (auto && !started && !finished) void play();

  async function play() {
    if (started || finished) return;
    started = true;
    const thisRun = ++runId;
    for (let mapIndex = activeMap; mapIndex < series.maps.length; mapIndex += 1) {
      activeMap = mapIndex;
      visibleRounds = 0;
      const rounds = series.maps[mapIndex].rounds;
      while (visibleRounds < rounds.length && thisRun === runId) {
        await sleep(delay);
        visibleRounds += 1;
      }
      await sleep(Math.min(900, delay));
    }
    if (thisRun !== runId) return;
    finished = true;
    started = false;
    onComplete();
  }

  function skipMap() {
    if (!currentMap) return;
    visibleRounds = currentMap.rounds.length;
  }
</script>

<section class="series panel">
  <div class="series-header">
    <div>
      <span class="eyebrow">{series.phase.toUpperCase()} · MD{series.bestOf}</span>
      <h2>{series.teamA.name} <span>vs</span> {series.teamB.name}</h2>
    </div>
    <div class="series-score">{activeMap >= series.maps.length - 1 && finished ? series.scoreA : series.maps.slice(0, activeMap).filter((map) => map.winnerId === series.teamA.id).length} : {activeMap >= series.maps.length - 1 && finished ? series.scoreB : series.maps.slice(0, activeMap).filter((map) => map.winnerId === series.teamB.id).length}</div>
  </div>

  <div class="map-list">
    {#each series.maps.slice(0, finished ? series.maps.length : activeMap + 1) as map, index}
      {@const isPast = index < activeMap || finished}
      {@const liveRound = index === activeMap ? currentRound : null}
      {@const currentMapFinished = index === activeMap && visibleRounds === map.rounds.length}
      <article class:live={index === activeMap && started} class="map-row">
        <div>
          <strong>{labels.map ?? 'Mapa'} {map.map}</strong>
          <small>{isPast || currentMapFinished ? labels.final ?? 'FINAL' : index === activeMap && started ? `${labels.round} ${visibleRounds}` : labels.waiting ?? 'WAITING'}</small>
        </div>
        <div class="map-score">
          <b>{isPast ? map.scoreA : liveRound?.a ?? 0}</b>
          <span>:</span>
          <b>{isPast ? map.scoreB : liveRound?.b ?? 0}</b>
        </div>
        {#if (isPast && map.overtime) || liveRound?.overtime}<span class="ot">OT</span>{/if}
      </article>
    {/each}
  </div>

  {#if !started && !finished}
    <button class="primary wide" type="button" on:click={play}>{labels.start}</button>
  {:else if started}
    <button class="secondary wide" type="button" on:click={skipMap}>{labels.skip}</button>
  {/if}
</section>
