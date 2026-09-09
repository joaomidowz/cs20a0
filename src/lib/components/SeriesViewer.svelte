<script lang="ts">
  import { onDestroy } from 'svelte';
  import RoundFeed from '$lib/components/RoundFeed.svelte';
  import RoundStrip from '$lib/components/RoundStrip.svelte';
  import RoundFlash from '$lib/components/live/RoundFlash.svelte';
  import { translate, translateTeamName } from '$lib/game/i18n';
  import { countPistols, getMapHeadline } from '$lib/game/roundPresentation';
  import { getCommittedRounds, getDecidedMaps, getVisibleMapScore, isSeriesVisuallyStarted, shouldCommitInstantly } from '$lib/game/seriesPresentation';
  import { getMapName } from '$lib/game/maps';
  import type { Language, RoundDetail, SeriesResult } from '$lib/game/types';

  export let series: SeriesResult;
  export let delay = 1500;
  export let auto = false;
  export let controlled = false;
  export let controlledActiveMap = 0;
  export let controlledVisibleRounds = 0;
  export let controlledStarted = false;
  export let controlledFinished = false;
  export let language: Language = 'en';
  /** Round details of the live map when they arrive separately from `series` (online snapshots send a rolling window). */
  export let liveDetails: RoundDetail[] | null = null;
  /** Simple mode: the round strip and the result stay, the kill feed goes away. */
  export let simpleFeed = false;
  /** Kill feed pacing in controlled mode (ms per round). */
  export let controlledDelay = 1500;
  export let interactiveTeamId: string | null = null;
  export let interactiveTeamIds: string[] = [];
  export let labels: {
    start: string;
    skip: string;
    round: string;
    live: string;
    map?: string;
    final?: string;
    waiting?: string;
    pending?: string;
    inProgress?: string;
    mapInProgress?: string;
    veto?: string;
    ban?: string;
    pick?: string;
    decider?: string;
    notPlayed?: string;
    mapStart?: string;
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
  /** Last round whose kill feed finished playing (per map), reported by RoundFeed. */
  let resolved = { map: -1, round: 0 };

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
  $: displayFinished = controlled ? controlledFinished : finished;
  $: displayStarted = isSeriesVisuallyStarted({
    controlled,
    controlledStarted,
    started,
    auto,
    finished: displayFinished
  });
  $: currentMap = series.maps[displayActiveMap];
  $: currentMapFinished = Boolean(currentMap && displayVisibleRounds >= currentMap.rounds.length && currentMap.rounds.length > 0 && currentMap.winnerId);
  $: currentDetails = liveDetails ?? currentMap?.details ?? null;
  $: feedDelay = controlled ? controlledDelay : delay;
  $: liveDetail = displayVisibleRounds > 0 ? currentDetails?.find((detail) => detail?.number === displayVisibleRounds) ?? null : null;
  // The revealed round stays in progress (score, strip and ending unchanged) until its kill feed resolves it.
  $: instantCommit = shouldCommitInstantly({ delay: feedDelay, finished: displayFinished, mapFinished: currentMapFinished });
  $: committedRounds = getCommittedRounds(displayVisibleRounds, resolved.map === displayActiveMap ? resolved.round : 0, Boolean(liveDetail?.kills.length), instantCommit);
  $: roundInProgress = displayStarted && committedRounds < displayVisibleRounds;
  $: committedDetail = committedRounds > 0 ? currentDetails?.find((detail) => detail?.number === committedRounds) ?? null : null;
  $: currentRound = committedRounds > 0 ? currentMap?.rounds[committedRounds - 1] : null;
  $: currentMapScore = currentMap ? getVisibleMapScore(currentMap, currentRound, {
    isComplete: displayFinished || currentMapFinished,
    isLive: displayStarted
  }) : null;
  $: visibleMaps = series.maps.slice(0, displayActiveMap + (currentMap && displayVisibleRounds >= currentMap.rounds.length ? 1 : 0));
  // Bans are never shown: only the maps that will actually be played.
  $: decidedMaps = getDecidedMaps(series);
  $: visibleRoundScores = currentMap ? currentMap.rounds.slice(0, committedRounds) : [];
  $: roundTicks = visibleRoundScores.map((round, index) => {
    const before = index > 0 ? visibleRoundScores[index - 1] : { a: 0, b: 0 };
    return round.a > before.a ? 'a' : 'b';
  });
  $: lastRoundWinner = roundTicks.length ? roundTicks[roundTicks.length - 1] : null;
  $: userIsA = series.teamA.isUser ? true : series.teamB.isUser ? false : null;
  $: teamNames = { a: translateTeamName(language, series.teamA.name), b: translateTeamName(language, series.teamB.name) };
  $: headline = currentMap && currentMapFinished ? getMapHeadline({ ...currentMap, details: currentDetails ?? currentMap.details }, teamNames, language) : null;
  $: inOvertime = Boolean(displayStarted && !displayFinished && !currentMapFinished && currentMapScore && (currentRound?.overtime || (currentMapScore.a >= 12 && currentMapScore.b >= 12)));
  $: mapStates = decidedMaps.map((decided) => {
    const index = series.maps.findIndex((map) => map.mapId === decided.mapId);
    if (displayFinished) return decided.result ? labels.final ?? 'FINAL' : labels.notPlayed ?? 'Não disputado';
    if (index >= 0 && index < displayActiveMap) return labels.final ?? 'FINAL';
    if (index === displayActiveMap && displayStarted) return currentMapFinished ? labels.final ?? 'FINAL' : `${labels.live} · ${labels.round} ${displayVisibleRounds}`;
    return labels.pending ?? 'A disputar';
  });
  $: mapScore = (decided: (typeof decidedMaps)[number]) => {
    const index = series.maps.findIndex((map) => map.mapId === decided.mapId);
    if (index < 0) return null;
    if (displayFinished || index < displayActiveMap) return { a: series.maps[index].scoreA, b: series.maps[index].scoreB, done: true };
    if (index === displayActiveMap && displayStarted && currentMapScore) return { a: currentMapScore.a, b: currentMapScore.b, done: currentMapFinished };
    return null;
  };
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
        if (thisRun !== runId) return;
        if (skipped) continue;
        visibleRounds += 1;
      }
      if (thisRun !== runId) return;
      if (mapIndex < series.maps.length - 1) await wait(Math.min(900, delay));
    }
    if (thisRun !== runId) return;
    finished = true;
    started = false;
    onComplete();
  }

  function handleRoundResolved(round: number) {
    resolved = { map: displayActiveMap, round };
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

  function vetoTeamName(teamId: string | null) {
    if (teamId === series.teamA.id) return translateTeamName(language, series.teamA.name);
    if (teamId === series.teamB.id) return translateTeamName(language, series.teamB.name);
    return labels.decider ?? 'Decider';
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
          on:click={() => activateTeam(series.teamB.id, series.teamB.isUser)}
        >
          {translateTeamName(language, series.teamB.name)}
        </button>
      </h2>
      {#if displayStarted && !displayFinished}
        <div class="mobile-series-live">
          <span><i></i>{labels.live}</span>
          <b>MD{series.bestOf}</b>
          <strong>{mapsLabel} {visibleScoreA}-{visibleScoreB}</strong>
          <small>{getMapName(currentMap?.mapId, currentMap?.map ?? displayActiveMap + 1, labels.map ?? 'Mapa')} · R{displayVisibleRounds}</small>
        </div>
      {/if}
    </div>
    {#if displayFinished}
      <div class="series-score">{series.scoreA} : {series.scoreB}</div>
    {:else if displayStarted}
      <div class="series-status live">
        <span><i></i>{labels.live}</span>
        <strong>{getMapName(currentMap?.mapId, currentMap?.map ?? activeMap + 1, labels.map ?? 'Mapa')}</strong>
        <b>{visibleScoreA} - {visibleScoreB}</b>
      </div>
    {:else}
      <div class="series-status">{displayStarted ? labels.inProgress ?? 'Em andamento' : labels.pending ?? 'A disputar'}</div>
    {/if}
  </div>

  {#if displayStarted && !displayFinished && currentMap && currentMapScore}
    <div class="live-map">
      <div class="live-map-score">
        <span class:mine={series.teamA.isUser}>{translateTeamName(language, series.teamA.name)}</span>
        {#key currentMapScore.a}<b class:leading={currentMapScore.a > currentMapScore.b}>{currentMapScore.a}</b>{/key}
        <i>:</i>
        {#key currentMapScore.b}<b class:leading={currentMapScore.b > currentMapScore.a}>{currentMapScore.b}</b>{/key}
        <span class:mine={series.teamB.isUser}>{translateTeamName(language, series.teamB.name)}</span>
      </div>
      <RoundFlash detail={committedDetail} cursor={`${series.id}:${displayActiveMap}:${committedRounds}`} {language} {userIsA} />
      {#if inOvertime}<strong class="ot-alert" role="status">⚠ OVERTIME · {currentMapScore.a}-{currentMapScore.b}</strong>{/if}
      {#if headline}<strong class="map-headline {headline.kind}" class:mine={userIsA !== null && (headline.side === 'a') === userIsA} role="status">{headline.text}</strong>{/if}
      <RoundStrip rounds={visibleRoundScores} details={currentDetails ?? undefined} {userIsA} {language} {teamNames} />
      <small class="round-status" class:in-progress={roundInProgress}>{currentMapFinished ? `${getMapName(currentMap.mapId, currentMap.map, labels.map ?? 'Mapa')} · ${labels.final ?? 'FINAL'}${currentMap.overtime ? ' · OT' : ''}` : roundInProgress ? `${labels.round} ${displayVisibleRounds} · ${translate(language, 'roundInProgress')}` : lastRoundWinner ? `${labels.round} ${committedRounds} · ${translateTeamName(language, lastRoundWinner === 'a' ? series.teamA.name : series.teamB.name)}` : labels.mapStart ?? getMapName(currentMap.mapId, currentMap.map, labels.map ?? 'Mapa')}</small>
      {#if currentDetails?.length && displayVisibleRounds > 0}
        <RoundFeed details={currentDetails} visibleRounds={displayVisibleRounds} {userIsA} delay={feedDelay} {language} {teamNames} onRoundResolved={handleRoundResolved} simple={simpleFeed} />
      {/if}
    </div>
  {/if}

  {#if decidedMaps.length}
    <div class="decided-map-list">
      {#each decidedMaps as decided, index (decided.mapId)}
        {@const score = mapScore(decided)}
        {@const mapIndex = series.maps.findIndex((map) => map.mapId === decided.mapId)}
        {@const isLive = mapIndex === displayActiveMap && displayStarted && !displayFinished}
        {@const pistols = score?.done && decided.result?.details?.length ? countPistols(decided.result.details) : null}
        <article class:live={isLive} class:not-played={displayFinished && !decided.result} class:user-pick={Boolean(decided.teamId) && (decided.teamId === series.teamA.id ? series.teamA.isUser : series.teamB.isUser)}>
          <div>
            <small>{decided.action === 'decider' ? labels.decider ?? 'Decider' : `${labels.pick ?? 'Pick'} · ${vetoTeamName(decided.teamId)}`}</small>
            <strong>{getMapName(decided.mapId)}</strong>
            <span>{mapStates[index]}</span>
            {#if pistols}<small class="map-extra">{translate(language, 'pistols')} {pistols.a}–{pistols.b}{decided.result?.comeback ? ` · ${translate(language, 'comeback')}` : ''}</small>{/if}
          </div>
          {#if score}
            <b class:won={score.done && ((score.a > score.b && series.teamA.isUser) || (score.b > score.a && series.teamB.isUser))} class:lostmap={score.done && ((score.a < score.b && series.teamA.isUser) || (score.b < score.a && series.teamB.isUser))}>{score.a} : {score.b}</b>
          {:else}
            <b class="muted">— : —</b>
          {/if}
          {#if decided.result?.overtime && (score?.done)}<em class="ot">OT</em>{/if}
        </article>
      {/each}
    </div>
  {:else}
    {#key `${displayActiveMap}:${displayVisibleRounds}:${displayStarted}:${displayFinished}`}
      <div class="map-list">
        {#each series.maps.slice(0, displayFinished ? series.maps.length : displayActiveMap + 1) as map, index}
          {@const isPast = index < displayActiveMap || displayFinished}
          <article class="map-row" class:live={index === displayActiveMap && displayStarted}>
            <div>
              <strong>{getMapName(map.mapId, map.map, labels.map ?? 'Mapa')}</strong>
              <small>{isPast || (index === displayActiveMap && currentMapFinished) ? labels.final ?? 'FINAL' : index === displayActiveMap && displayStarted ? `${labels.mapInProgress ?? 'Mapa em progresso'} · ${labels.round} ${displayVisibleRounds}` : labels.pending ?? labels.waiting ?? 'A disputar'}</small>
            </div>
            {#if isPast}
              <div class="map-score"><b>{map.scoreA}</b><span>:</span><b>{map.scoreB}</b></div>
            {:else if index === displayActiveMap && currentMapScore}
              <div class="map-score"><b>{currentMapScore.a}</b><span>:</span><b>{currentMapScore.b}</b></div>
            {:else}
              <span class="map-pending">{labels.pending ?? 'A disputar'}</span>
            {/if}
          </article>
        {/each}
      </div>
    {/key}
  {/if}

  {#if !controlled && !started && !finished}
    <button class="primary wide" type="button" on:click={play}>{labels.start}</button>
  {:else if !controlled && started}
    <button class="secondary wide" type="button" disabled={visibleRounds >= (currentMap?.rounds.length ?? 0)} on:click={skipMap}>{labels.skip}</button>
  {/if}
</section>

<style>
  .live-map{display:grid;gap:10px;margin-top:18px;padding:16px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--line));background:color-mix(in srgb,var(--accent) 6%,var(--surface-2))}
  .live-map-score{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto minmax(0,1fr);align-items:center;gap:10px}
  .live-map-score span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem;font-weight:800;text-transform:uppercase}.live-map-score span:last-child{text-align:right}.live-map-score span.mine{color:var(--accent)}
  .live-map-score b{min-width:1.4em;font:900 clamp(2.2rem,8vw,3.4rem)/1 'Arial Narrow',Impact,sans-serif;text-align:center;color:var(--muted);transition:color .2s ease;animation:scorePulse .45s ease-out}
  @keyframes scorePulse{0%{transform:scale(1.25);color:var(--accent-2)}}
  .live-map small.round-status{min-height:1.2em}.live-map small.in-progress{color:var(--text)}.live-map small.in-progress::after{content:'';display:inline-block;width:6px;height:6px;margin-left:7px;border-radius:50%;background:#ff3b3b;vertical-align:middle;animation:livePulse 1.1s ease-in-out infinite}
  @media (prefers-reduced-motion:reduce){.live-map-score b,.live-map small.in-progress::after{animation:none}}.live-map-score b.leading{color:var(--text)}.live-map-score i{color:var(--line);font:900 2rem/1 'Arial Narrow',Impact,sans-serif;font-style:normal}
  .map-headline{justify-self:center;padding:6px 14px;border:1px solid var(--text);color:var(--text);font:900 .8rem 'Arial Narrow',Impact,sans-serif;letter-spacing:.16em;text-transform:uppercase;animation:headlineIn .4s ease-out}.map-headline.comeback{border-color:var(--accent-2);color:var(--accent-2);box-shadow:0 0 18px color-mix(in srgb,var(--accent-2) 40%,transparent)}.map-headline.mine{border-color:var(--accent);color:var(--accent)}
  .decided-map-list .map-extra{margin-top:6px;white-space:normal}
  @keyframes headlineIn{from{transform:scale(.9);opacity:0}}
  .live-map small{color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
  .decided-map-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:18px 0}
  .decided-map-list article{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;min-height:104px;padding:14px;border:1px solid var(--line);background:var(--surface-2);transition:border-color .2s ease,opacity .2s ease}
  .decided-map-list article.live{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent)}.decided-map-list article.not-played{opacity:.5}.decided-map-list article.user-pick small{color:var(--accent)}
  .decided-map-list small,.decided-map-list strong,.decided-map-list span{display:block}.decided-map-list small{min-height:1.2em;color:var(--muted);font-size:.5rem;font-weight:900;letter-spacing:.08em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .decided-map-list strong{margin-top:5px;font-size:1.15rem;text-transform:uppercase}.decided-map-list span{margin-top:7px;color:var(--muted);font-size:.52rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
  .decided-map-list b{font:900 1.75rem 'Arial Narrow',Impact,sans-serif;white-space:nowrap}.decided-map-list b.muted{color:var(--line)}.decided-map-list b.won{color:var(--accent)}.decided-map-list b.lostmap{color:var(--danger)}
  .decided-map-list .ot{position:absolute;right:6px;top:5px;color:var(--accent-2);font-size:.55rem;font-style:normal;font-weight:900}
  .ot-alert{justify-self:center;padding:5px 12px;border:1px solid var(--accent-2);color:var(--accent-2);font:900 .7rem 'Arial Narrow',Impact,sans-serif;letter-spacing:.18em;text-transform:uppercase;animation:otBlink .7s steps(2,start) infinite}
  @keyframes otBlink{to{visibility:hidden;box-shadow:0 0 16px var(--accent-2)}}
  @media(max-width:620px){.decided-map-list{grid-template-columns:1fr 1fr}.decided-map-list article{min-height:88px;padding:12px}.live-map{padding:12px}.live-map-score{grid-template-columns:auto auto auto;justify-content:center}.live-map-score span{display:none}}
  @media(max-width:400px){.decided-map-list{grid-template-columns:1fr}}
</style>
