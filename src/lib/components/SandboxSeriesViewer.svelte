<script lang="ts">
  import { onDestroy } from 'svelte';
  import RoundFeed from '$lib/components/RoundFeed.svelte';
  import RoundStrip from '$lib/components/RoundStrip.svelte';
  import RoundFlash from '$lib/components/live/RoundFlash.svelte';
  import { getMapName } from '$lib/game/maps';
  import { countPistols, getMapHeadline } from '$lib/game/roundPresentation';
  import { aggregateKills } from '$lib/game/rounds';
  import { getCommittedRounds, getVisibleMapScore, shouldCommitInstantly } from '$lib/game/seriesPresentation';
  import { getSandboxDecidedMaps, SANDBOX_PHASE_LABELS } from '$lib/game/sandbox/presentation';
  import type { SandboxMajorMatch } from '$lib/game/sandbox/types';

  export let match: SandboxMajorMatch;
  export let delay = 1500;
  export let auto = false;
  export let userTeamId = '';
  /** Interactive Sandbox: the route drives the series and tells the viewer what is visible. */
  export let controlled = false;
  export let controlledActiveMap = 0;
  export let controlledVisibleRounds = 0;
  export let controlledStarted = false;
  export let controlledFinished = false;
  export let onTeam: (teamId: string) => void = () => {};
  export let onComplete: () => void = () => {};
  export let onStart: () => void = () => {};
  export let onSkipMap: () => void = () => {};

  let activeMap = 0;
  let visibleRounds = 0;
  let started = false;
  let finished = false;
  let notified = false;
  let runId = 0;
  let appliedDelay = delay;
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
  $: displayStarted = controlled ? controlledStarted : started;
  $: displayFinished = controlled ? controlledFinished : finished;
  $: decidedMaps = getSandboxDecidedMaps(match);
  $: currentMap = match.maps[displayActiveMap];
  $: currentMapFinished = Boolean(currentMap && currentMap.winnerId && displayVisibleRounds >= currentMap.rounds.length && currentMap.rounds.length > 0);
  $: liveDetail = displayVisibleRounds > 0 ? currentMap?.details?.find((detail) => detail?.number === displayVisibleRounds) ?? null : null;
  // The revealed round stays in progress (score, strip and ending unchanged) until its kill feed resolves it.
  $: instantCommit = shouldCommitInstantly({ delay, finished: displayFinished, mapFinished: currentMapFinished });
  $: committedRounds = getCommittedRounds(displayVisibleRounds, resolved.map === displayActiveMap ? resolved.round : 0, Boolean(liveDetail?.kills.length), instantCommit);
  $: roundInProgress = displayStarted && committedRounds < displayVisibleRounds;
  $: committedDetail = committedRounds > 0 ? currentMap?.details?.find((detail) => detail?.number === committedRounds) ?? null : null;
  $: visibleRoundScores = currentMap ? currentMap.rounds.slice(0, committedRounds) : [];
  $: currentRound = committedRounds > 0 ? currentMap?.rounds[committedRounds - 1] : null;
  $: previousRound = committedRounds > 1 ? currentMap?.rounds[committedRounds - 2] : null;
  $: lastRoundWinner = currentRound
    ? (previousRound ? (currentRound.a > previousRound.a ? 'a' : 'b') : currentRound.a > 0 ? 'a' : 'b')
    : null;
  $: inOvertime = Boolean(displayStarted && !displayFinished && !currentMapFinished && currentRound && (currentRound.overtime || (currentRound.a >= 12 && currentRound.b >= 12)));
  $: currentMapScore = currentMap
    ? getVisibleMapScore(currentMap, currentRound, { isComplete: displayFinished || currentMapFinished, isLive: displayStarted })
    : null;
  $: completedMapCount = displayFinished
    ? match.maps.length
    : match.maps.slice(0, displayActiveMap + (currentMapFinished ? 1 : 0)).length;
  $: visibleScoreA = match.maps.slice(0, completedMapCount).filter((map) => map.winnerId === match.teamA.id).length;
  $: visibleScoreB = match.maps.slice(0, completedMapCount).filter((map) => map.winnerId === match.teamB.id).length;
  $: userIsA = match.teamA.id === userTeamId;
  $: userWon = displayFinished && match.winnerId === userTeamId;
  $: teamNames = { a: match.teamA.name, b: match.teamB.name };
  $: teamNameById = { [match.teamA.id]: match.teamA.name, [match.teamB.id]: match.teamB.name } as Record<string, string>;
  $: headline = currentMap && currentMapFinished ? getMapHeadline(currentMap, teamNames, 'pt-BR') : null;
  // Computed reactively (not via a template helper) so labels update when the playback state changes.
  $: mapStates = decidedMaps.map((decided, index) => mapState(index, Boolean(decided.result), { finished: displayFinished, started: displayStarted, activeMap: displayActiveMap, visibleRounds: displayVisibleRounds, currentMapFinished }));
  $: mapExtras = match.maps.map((map) => {
    const details = map.details ?? [];
    return { pistols: countPistols(details), top: aggregateKills(details)[0] ?? null };
  });
  $: if (!controlled && auto && !started && !finished) void play();
  $: if (!controlled && delay === 0 && started && !finished) finishSeries();
  $: if (!controlled && delay !== appliedDelay) applyDelay(delay);

  function applyDelay(nextDelay: number) {
    appliedDelay = nextDelay;
    // Restart the pending wait so the new speed is felt immediately instead of after the current round.
    if (started && !finished && nextDelay > 0) clearWait(true);
  }

  function clearWait(skipped: boolean) {
    if (pendingTimeout !== null) window.clearTimeout(pendingTimeout);
    pendingTimeout = null;
    const resolve = resolvePendingWait;
    resolvePendingWait = null;
    resolve?.(skipped);
  }

  function notifyComplete() {
    if (notified) return;
    notified = true;
    onComplete();
  }

  function finishSeries() {
    runId += 1;
    clearWait(true);
    activeMap = Math.max(0, match.maps.length - 1);
    visibleRounds = match.maps.at(-1)?.rounds.length ?? 0;
    started = false;
    finished = true;
    notifyComplete();
  }

  async function play() {
    if (controlled) {
      onStart();
      return;
    }
    if (started || finished) return;
    if (delay === 0 || match.maps.length === 0) {
      finishSeries();
      return;
    }

    started = true;
    const thisRun = ++runId;
    for (let mapIndex = activeMap; mapIndex < match.maps.length; mapIndex += 1) {
      activeMap = mapIndex;
      visibleRounds = 0;
      const rounds = match.maps[mapIndex].rounds;
      while (visibleRounds < rounds.length && thisRun === runId) {
        if (delay === 0) {
          finishSeries();
          return;
        }
        const skipped = await wait(delay);
        if (!skipped) visibleRounds += 1;
      }
      if (thisRun === runId && mapIndex < match.maps.length - 1) await wait(Math.min(900, Math.max(delay, 250)));
    }
    if (thisRun !== runId) return;
    started = false;
    finished = true;
    notifyComplete();
  }

  function handleRoundResolved(round: number) {
    resolved = { map: displayActiveMap, round };
  }

  function skipMap() {
    if (controlled) {
      onSkipMap();
      return;
    }
    if (!started || !currentMap) return;
    visibleRounds = currentMap.rounds.length;
    clearWait(true);
  }

  function mapState(index: number, hasResult: boolean, state: { finished: boolean; started: boolean; activeMap: number; visibleRounds: number; currentMapFinished: boolean }) {
    if (state.finished) return hasResult ? 'FINAL' : 'NÃO DISPUTADO';
    if (index < state.activeMap) return 'FINAL';
    if (index === state.activeMap && state.started) return state.currentMapFinished ? 'FINAL' : `AO VIVO · ROUND ${state.visibleRounds}`;
    return 'A DISPUTAR';
  }

  onDestroy(() => {
    runId += 1;
    clearWait(true);
  });
</script>

<section class="series panel sandbox-series" class:won={userWon} class:lost={displayFinished && !userWon} aria-live="polite">
  <header class="series-header">
    <div>
      <span class="eyebrow">{SANDBOX_PHASE_LABELS[match.phase]} · MD{match.bestOf}</span>
      <h2 class="series-teams"><button type="button" class:mine={userIsA} disabled={userIsA} on:click={() => onTeam(match.teamA.id)}>{match.teamA.name}</button><i>vs</i><button type="button" class:mine={!userIsA} disabled={!userIsA} on:click={() => onTeam(match.teamB.id)}>{match.teamB.name}</button></h2>
    </div>
    {#if displayFinished}
      <div class="series-score"><b class:mine={userIsA}>{match.scoreA}</b><i>:</i><b class:mine={!userIsA}>{match.scoreB}</b></div>
    {:else if displayStarted}
      <div class="sandbox-live"><span><i></i>AO VIVO</span><strong>{getMapName(currentMap?.mapId, currentMap?.map)}</strong><b>{visibleScoreA} – {visibleScoreB}</b></div>
    {:else}
      <div class="sandbox-pending">A DISPUTAR</div>
    {/if}
  </header>

  {#if displayStarted && currentMap && currentMapScore}
    <div class="live-map">
      <div class="live-map-score">
        <span class:mine={userIsA}>{match.teamA.name}</span>
        {#key currentMapScore.a}<b class:leading={currentMapScore.a > currentMapScore.b}>{currentMapScore.a}</b>{/key}
        <i>:</i>
        {#key currentMapScore.b}<b class:leading={currentMapScore.b > currentMapScore.a}>{currentMapScore.b}</b>{/key}
        <span class:mine={!userIsA}>{match.teamB.name}</span>
      </div>
      <RoundFlash detail={committedDetail} cursor={`${match.id}:${displayActiveMap}:${committedRounds}`} language="pt-BR" {userIsA} />
      {#if inOvertime && currentMapScore}<strong class="ot-alert" role="status">⚠ OVERTIME · {currentMapScore.a}-{currentMapScore.b}</strong>{/if}
      {#if headline}<strong class="map-headline {headline.kind}" class:mine={(headline.side === 'a') === userIsA} role="status">{headline.text}</strong>{/if}
      <RoundStrip rounds={visibleRoundScores} details={currentMap.details} {userIsA} />
      <small class="round-status" class:in-progress={roundInProgress}>{currentMapFinished ? `${getMapName(currentMap.mapId, currentMap.map)} encerrado${currentMap.overtime ? ' na prorrogação' : ''}` : roundInProgress ? `Round ${displayVisibleRounds} · em andamento` : lastRoundWinner ? `Round ${committedRounds} · ${lastRoundWinner === 'a' ? match.teamA.name : match.teamB.name}` : 'Início do mapa'}</small>
      {#if currentMap.details?.length && displayVisibleRounds > 0}
        <RoundFeed details={currentMap.details} visibleRounds={displayVisibleRounds} {userIsA} {delay} language="pt-BR" {teamNames} onRoundResolved={handleRoundResolved} />
      {/if}
    </div>
  {/if}

  <div class="decided-map-list">
    {#each decidedMaps as decided, index}
      {@const result = decided.result}
      {@const isLive = index === displayActiveMap && displayStarted && !displayFinished}
      {@const done = displayFinished || index < displayActiveMap || (index === displayActiveMap && currentMapFinished)}
      <article class:live={isLive} class:done class:not-played={displayFinished && !result} class:user-pick={decided.teamId === userTeamId}>
        <div>
          <small>{decided.action === 'decider' ? 'DECIDER' : `PICK · ${teamNameById[decided.teamId ?? ''] ?? ''}`}</small>
          <strong>{getMapName(decided.mapId)}</strong>
          <span>{mapStates[index]}</span>
          {#if done && result && result.winnerId && mapExtras[index]?.top}
            <small class="map-extra">PISTOLS {mapExtras[index].pistols.a}–{mapExtras[index].pistols.b} · TOP {mapExtras[index].top?.name} {mapExtras[index].top?.kills}K{result.comeback ? ' · VIRADA' : ''}</small>
          {/if}
        </div>
        {#if done && result?.winnerId}
          <b class:won={result.winnerId === userTeamId} class:lostmap={userTeamId && result.winnerId !== userTeamId}>{result.scoreA} : {result.scoreB}</b>
        {:else if isLive && currentMapScore}
          <b>{currentMapScore.a} : {currentMapScore.b}</b>
        {:else}
          <b class="muted">— : —</b>
        {/if}
      </article>
    {/each}
  </div>

  {#if !displayStarted && !displayFinished}
    <button class="primary wide" type="button" on:click={play}>Iniciar série</button>
  {:else if displayStarted && !displayFinished}
    <button class="secondary wide" type="button" on:click={skipMap} disabled={currentMapFinished}>Pular mapa atual</button>
  {/if}
</section>

<style>
  .sandbox-series{padding:22px;transition:border-color .3s ease}.sandbox-series.won{border-color:color-mix(in srgb,var(--accent) 65%,var(--line))}.sandbox-series.lost{border-color:color-mix(in srgb,var(--danger) 55%,var(--line))}
  .series-teams{display:flex;align-items:center;flex-wrap:wrap;gap:.28em}.series-teams button{padding:0;border:0;color:var(--text);background:transparent;font:inherit;cursor:pointer;text-decoration:underline;text-decoration-color:transparent;text-underline-offset:4px;transition:text-decoration-color .15s ease}.series-teams button:disabled{cursor:default;opacity:1}.series-teams button:not(:disabled):hover{text-decoration-color:var(--accent)}.series-teams button.mine{color:var(--accent)}.series-teams i{color:var(--muted);font-size:.65em;font-style:normal}
  .series-score{display:flex;align-items:baseline;gap:.15em;font:900 2.6rem 'Arial Narrow',Impact,sans-serif}.series-score i{color:var(--line);font-style:normal}.series-score b.mine{color:var(--accent)}
  .sandbox-live{display:grid;justify-items:end;gap:3px}.sandbox-live span{display:flex;align-items:center;gap:5px;color:#ff7676;font-size:.55rem;font-weight:900;letter-spacing:.14em}.sandbox-live span i{width:7px;height:7px;border-radius:50%;background:#ff3b3b;animation:livePulse 1.6s infinite}.sandbox-live strong{font-size:.72rem;text-transform:uppercase}.sandbox-live b{font:900 1.8rem 'Arial Narrow',Impact,sans-serif}
  .sandbox-pending{color:var(--muted);font-size:.68rem;font-weight:900;letter-spacing:.1em}
  .live-map{display:grid;gap:10px;margin-top:18px;padding:16px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--line));background:color-mix(in srgb,var(--accent) 6%,var(--surface-2))}
  .live-map-score{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto minmax(0,1fr);align-items:center;gap:10px}
  .live-map-score span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem;font-weight:800;text-transform:uppercase}.live-map-score span:last-child{text-align:right}.live-map-score span.mine{color:var(--accent)}
  .live-map-score b{min-width:1.4em;font:900 clamp(2.2rem,8vw,3.4rem)/1 'Arial Narrow',Impact,sans-serif;text-align:center;color:var(--muted);transition:color .2s ease;animation:scorePulse .45s ease-out}
  @keyframes scorePulse{0%{transform:scale(1.25);color:var(--accent-2)}}
  .live-map small.round-status{min-height:1.2em}.live-map small.in-progress{color:var(--text)}.live-map small.in-progress::after{content:'';display:inline-block;width:6px;height:6px;margin-left:7px;border-radius:50%;background:#ff3b3b;vertical-align:middle;animation:livePulse 1.1s ease-in-out infinite}
  @media (prefers-reduced-motion:reduce){.live-map-score b,.live-map small.in-progress::after{animation:none}}.live-map-score b.leading{color:var(--text)}.live-map-score i{color:var(--line);font:900 2rem/1 'Arial Narrow',Impact,sans-serif;font-style:normal}
  .live-map small{color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
  .map-headline{justify-self:center;padding:6px 14px;border:1px solid var(--text);color:var(--text);font:900 .8rem 'Arial Narrow',Impact,sans-serif;letter-spacing:.16em;text-transform:uppercase;animation:headlineIn .4s ease-out}.map-headline.comeback{border-color:var(--accent-2);color:var(--accent-2);box-shadow:0 0 18px color-mix(in srgb,var(--accent-2) 40%,transparent)}.map-headline.mine{border-color:var(--accent);color:var(--accent)}
  .decided-map-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:18px 0}
  .decided-map-list article{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;min-height:104px;padding:14px;border:1px solid var(--line);background:var(--surface-2);transition:border-color .2s ease,opacity .2s ease}
  .decided-map-list article.live{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent)}.decided-map-list article.not-played{opacity:.5}.decided-map-list article.user-pick small{color:var(--accent)}
  .decided-map-list small,.decided-map-list strong,.decided-map-list span{display:block}.decided-map-list small{min-height:1.2em;color:var(--muted);font-size:.5rem;font-weight:900;letter-spacing:.08em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .decided-map-list strong{margin-top:5px;font-size:1.15rem;text-transform:uppercase}.decided-map-list span{margin-top:7px;color:var(--muted);font-size:.52rem;font-weight:800;letter-spacing:.06em}
  .decided-map-list b{font:900 1.75rem 'Arial Narrow',Impact,sans-serif;white-space:nowrap}.decided-map-list b.muted{color:var(--line)}.decided-map-list b.won{color:var(--accent)}.decided-map-list b.lostmap{color:var(--danger)}
  .decided-map-list .map-extra{margin-top:6px;white-space:normal}
  .wide{width:100%}
  .ot-alert{justify-self:center;padding:5px 12px;border:1px solid var(--accent-2);color:var(--accent-2);font:900 .7rem 'Arial Narrow',Impact,sans-serif;letter-spacing:.18em;text-transform:uppercase;animation:otBlink .7s steps(2,start) infinite}
  @keyframes otBlink{to{visibility:hidden;box-shadow:0 0 16px var(--accent-2)}}
  @keyframes headlineIn{from{transform:scale(.9);opacity:0}}
  @media(max-width:620px){.series-header{align-items:flex-start;flex-direction:column}.sandbox-live{justify-items:start}.decided-map-list{grid-template-columns:1fr 1fr}.decided-map-list article{min-height:88px;padding:12px}.live-map{padding:12px}.live-map-score{grid-template-columns:auto auto auto;justify-content:center}.live-map-score span{display:none}}
  @media(max-width:400px){.decided-map-list{grid-template-columns:1fr}}
</style>
