<script lang="ts">
  import { onDestroy } from 'svelte';
  import { translateTeamName } from '$lib/game/i18n';
  import type { Language, SeriesResult } from '$lib/game/types';

  export let series: SeriesResult;
  export let delay = 1500;
  export let auto = false;
  export let controlled = false;
  export let controlledActiveMap = 0;
  export let controlledVisibleRounds = 0;
  export let controlledStarted = false;
  export let controlledFinished = false;
  export let language: Language = 'en';
  export let interactiveTeamId: string | null = null;
  export let interactiveTeamIds: string[] = [];
  export let labels: {
    start: string;
    skip: string;
    round: string;
    map?: string;
    final?: string;
    waiting?: string;
    pending?: string;
    inProgress?: string;
    mapInProgress?: string;
  };
  export let onComplete: () => void = () => {};
  export let onTeamHover: (teamId: string) => void = () => {};
  export let onTeamHoverEnd: () => void = () => {};
  export let onTeamClick: (teamId: string) => void = () => {};
  export let onOrgClick: () => void = () => {};

  let activeMap = 0;
  let visibleRounds = 0;
  let started = false;
  let finished = false;
  let runId = 0;
  let pendingTimeout: number | null = null;
  let resolvePendingWait: ((skipped: boolean) => void) | null = null;

  const wait = (ms: number) => new Promise<boolean>((resolve) => {
    resolvePendingWait = resolve;
    pendingTimeout = window.setTimeout(() => {
      pendingTimeout = null;
      resolvePendingWait = null;
      resolve(false);
    }, ms);
  });
  $: displayActiveMap = controlled ? controlledActiveMap : activeMap;
  $: displayVisibleRounds = controlled ? controlledVisibleRounds : visibleRounds;
  $: displayStarted = controlled ? controlledStarted : started;
  $: displayFinished = controlled ? controlledFinished : finished;
  $: currentMap = series.maps[displayActiveMap];
  $: currentRound = displayVisibleRounds > 0 ? currentMap?.rounds[displayVisibleRounds - 1] : null;
  $: visibleMaps = series.maps.slice(0, displayActiveMap + (currentMap && displayVisibleRounds >= currentMap.rounds.length ? 1 : 0));
  $: visibleScoreA = visibleMaps.filter((map) => map.winnerId === series.teamA.id).length;
  $: visibleScoreB = visibleMaps.filter((map) => map.winnerId === series.teamB.id).length;
  $: mapsLabel = language === 'en' ? 'MAPS' : 'MAPAS';
  $: if (!controlled && auto && !started && !finished) void play();

  async function play() {
    if (controlled || started || finished) return;
    started = true;
    const thisRun = ++runId;
    for (let mapIndex = activeMap; mapIndex < series.maps.length; mapIndex += 1) {
      activeMap = mapIndex;
      visibleRounds = 0;
      const rounds = series.maps[mapIndex].rounds;
      while (visibleRounds < rounds.length && thisRun === runId) {
        const skipped = await wait(delay);
        if (skipped) continue;
        visibleRounds += 1;
      }
      await wait(Math.min(900, delay));
    }
    if (thisRun !== runId) return;
    finished = true;
    started = false;
    onComplete();
  }

  function skipMap() {
    if (controlled || !currentMap) return;
    visibleRounds = currentMap.rounds.length;
    if (pendingTimeout !== null) window.clearTimeout(pendingTimeout);
    pendingTimeout = null;
    const resolve = resolvePendingWait;
    resolvePendingWait = null;
    resolve?.(true);
  }

  function isInteractiveTeam(teamId: string) {
    return interactiveTeamId === teamId || interactiveTeamIds.includes(teamId);
  }

  function handleTeamHover(teamId: string) {
    if (isInteractiveTeam(teamId)) onTeamHover(teamId);
  }

  function handleTeamClick(teamId: string) {
    if (isInteractiveTeam(teamId)) onTeamClick(teamId);
  }

  function activateTeam(teamId: string, isUser = false) {
    if (isInteractiveTeam(teamId)) handleTeamClick(teamId);
    else if (isUser) onOrgClick();
  }

  onDestroy(() => {
    runId += 1;
    if (pendingTimeout !== null) window.clearTimeout(pendingTimeout);
    resolvePendingWait?.(true);
  });
</script>

<section class="series panel">
  <div class="series-header">
    <div>
      <span class="eyebrow">{series.phase.toUpperCase()} · MD{series.bestOf}</span>
      <h2 class="series-teams">
        <button
          type="button"
          class:team-link={isInteractiveTeam(series.teamA.id) || series.teamA.isUser}
          disabled={!isInteractiveTeam(series.teamA.id) && !series.teamA.isUser}
          on:mouseenter={() => handleTeamHover(series.teamA.id)}
          on:mouseleave={onTeamHoverEnd}
          on:focus={() => handleTeamHover(series.teamA.id)}
          on:blur={onTeamHoverEnd}
          on:click={() => activateTeam(series.teamA.id, series.teamA.isUser)}
        >
          {translateTeamName(language, series.teamA.name)}
        </button>
        <span>vs</span>
        <button
          type="button"
          class:team-link={isInteractiveTeam(series.teamB.id) || series.teamB.isUser}
          disabled={!isInteractiveTeam(series.teamB.id) && !series.teamB.isUser}
          on:mouseenter={() => handleTeamHover(series.teamB.id)}
          on:mouseleave={onTeamHoverEnd}
          on:focus={() => handleTeamHover(series.teamB.id)}
          on:blur={onTeamHoverEnd}
          on:click={() => activateTeam(series.teamB.id, series.teamB.isUser)}
        >
          {translateTeamName(language, series.teamB.name)}
        </button>
      </h2>
      {#if displayStarted && !displayFinished}
        <div class="mobile-series-live">
          <span><i></i>Live</span>
          <b>MD{series.bestOf}</b>
          <strong>{mapsLabel} {visibleScoreA}-{visibleScoreB}</strong>
          <small>{labels.map ?? 'Mapa'} {currentMap?.map ?? displayActiveMap + 1} · R{displayVisibleRounds}</small>
        </div>
      {/if}
    </div>
    {#if displayFinished}
      <div class="series-score">{series.scoreA} : {series.scoreB}</div>
    {:else if displayStarted}
      <div class="series-status live">
        <span><i></i>Live</span>
        <strong>{labels.map ?? 'Mapa'} {currentMap?.map ?? activeMap + 1}</strong>
        <b>{visibleScoreA} - {visibleScoreB}</b>
      </div>
    {:else}
      <div class="series-status">{displayStarted ? labels.inProgress ?? 'Em andamento' : labels.pending ?? 'A disputar'}</div>
    {/if}
  </div>

  <div class="map-list">
    {#each series.maps.slice(0, displayFinished ? series.maps.length : displayActiveMap + 1) as map, index}
      {@const isPast = index < displayActiveMap || displayFinished}
      {@const liveRound = index === displayActiveMap ? currentRound : null}
      {@const currentMapFinished = index === displayActiveMap && displayVisibleRounds >= map.rounds.length && map.rounds.length > 0 && Boolean(map.winnerId)}
      <article class:live={index === displayActiveMap && displayStarted} class="map-row">
        <div>
          <strong>{labels.map ?? 'Mapa'} {map.map}</strong>
          <small>{isPast || currentMapFinished ? labels.final ?? 'FINAL' : index === displayActiveMap && displayStarted ? `${labels.mapInProgress ?? 'Mapa em progresso'} · ${labels.round} ${displayVisibleRounds}` : labels.pending ?? labels.waiting ?? 'A disputar'}</small>
        </div>
        {#if isPast || currentMapFinished || liveRound}
          <div class="map-score">
            <b>{isPast || currentMapFinished ? map.scoreA : liveRound?.a}</b>
            <span>:</span>
            <b>{isPast || currentMapFinished ? map.scoreB : liveRound?.b}</b>
          </div>
        {:else}
          <span class="map-pending">{labels.pending ?? 'A disputar'}</span>
        {/if}
        {#if (isPast && map.overtime) || liveRound?.overtime}<span class="ot">OT</span>{/if}
      </article>
    {/each}
  </div>

  {#if !controlled && !started && !finished}
    <button class="primary wide" type="button" on:click={play}>{labels.start}</button>
  {:else if !controlled && started}
    <button class="secondary wide" type="button" disabled={visibleRounds >= (currentMap?.rounds.length ?? 0)} on:click={skipMap}>{labels.skip}</button>
  {/if}
</section>
