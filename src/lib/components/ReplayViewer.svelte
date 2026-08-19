<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { playerById } from '$lib/game/data';
  import { translate, translateTeamName } from '$lib/game/i18n';
  import { drawRadarBase, drawReplayFrame, configureReplayCanvas } from '$lib/game/replay/canvas/draw';
  import { ReplayClock } from '$lib/game/replay/canvas/clock';
  import { hitTestReplay } from '$lib/game/replay/canvas/hit-testing';
  import { interpolateReplayFrame } from '$lib/game/replay/canvas/interpolation';
  import {
    createViewportTransform,
    panViewport,
    zoomViewportAt,
    type ViewportTransform
  } from '$lib/game/replay/canvas/transform';
  import { expandReplayPlan, sliceReplayThroughRound } from '$lib/game/replay/expand';
  import {
    getReplayPlaybackWindowMs,
    getReplayRoundAtMs,
    getReplayRoundStartMs,
    ReplayLiveQueue
  } from '$lib/game/replay/live';
  import { createReplayPlan } from '$lib/game/replay/plan';
  import { aggregateReplayStats } from '$lib/game/replay/stats';
  import { getMapGraph } from '$lib/game/replay/topology/maps';
  import { createRadarPlan } from '$lib/game/replay/topology/radar';
  import type { RadarPlan } from '$lib/game/replay/topology/types';
  import type {
    ReplayFrameV1,
    ReplayKillEventV1,
    ReplayPlanV1,
    ReplayPlaybackSpeed,
    ReplayV1
  } from '$lib/game/replay/types';
  import type { Language, SeriesResult, Theme } from '$lib/game/types';

  export let series: SeriesResult;
  export let mapIndex: number;
  export let visibleRounds: number;
  export let language: Language = 'en';
  export let theme: Theme = 'dark';

  let baseCanvas: HTMLCanvasElement;
  let liveCanvas: HTMLCanvasElement;
  let stage: HTMLDivElement;
  let baseContext: CanvasRenderingContext2D | null = null;
  let liveContext: CanvasRenderingContext2D | null = null;
  let viewport: ViewportTransform = createViewportTransform(1, 1);
  let plan: ReplayPlanV1;
  let radar: RadarPlan;
  let fullReplay: ReplayV1;
  let visibleReplay: ReplayV1;
  let currentFrame: ReplayFrameV1 | null = null;
  let playbackSpeed: ReplayPlaybackSpeed = 'normal';
  let currentMs = 0;
  let playing = false;
  let mounted = false;
  let previousDurationMs = -1;
  let previousVisibleRounds = -1;
  let manuallyPaused = false;
  let followingLive = true;
  let playbackRound = 0;
  let activeRoundBacklog = 0;
  let renderedRoundEnd = 0;
  let animationFrame: number | null = null;
  let boundaryFrame: number | null = null;
  let previousAnimationAt = 0;
  let resizeObserver: ResizeObserver | null = null;
  let reducedMotionQuery: MediaQueryList | null = null;
  let hiddenWasPlaying = false;
  let dragging = false;
  let dragPointerId: number | null = null;
  let dragX = 0;
  let dragY = 0;
  let tooltipVisible = false;
  let tooltipText = '';
  let tooltipX = 0;
  let tooltipY = 0;
  const clock = new ReplayClock(0);
  const liveQueue = new ReplayLiveQueue();

  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const teamAOrganizationId = () => series.teamA.organizationId ?? series.teamA.id;
  const teamBOrganizationId = () => series.teamB.organizationId ?? series.teamB.id;

  $: plan = createReplayPlan(series, mapIndex);
  $: clock.setRoundDurations(plan.rounds.map((round) => round.durationMs));
  $: radar = createRadarPlan(getMapGraph(plan.mapId), plan.id);
  $: fullReplay = expandReplayPlan(plan, getMapGraph(plan.mapId));
  $: visibleReplay = sliceReplayThroughRound(fullReplay, Math.min(visibleRounds, plan.rounds.length));
  $: replayStats = aggregateReplayStats({
    ...plan,
    rounds: plan.rounds.slice(0, Math.min(visibleRounds, plan.rounds.length))
  });
  $: receivedRounds = Math.min(visibleRounds, plan.rounds.length);
  $: syncVisibleReplay(visibleReplay.durationMs, receivedRounds);
  $: currentRound = followingLive && playbackRound > 0
    ? playbackRound
    : visibleReplay.frames.length
      ? getReplayRoundAtMs(plan.rounds.slice(0, receivedRounds), currentMs)
      : Math.min(Math.max(visibleRounds, 1), plan.rounds.length);
  $: currentRoundFrames = visibleReplay.frames.filter((frame) => frame.roundNumber === currentRound);
  $: currentFrame = currentRoundFrames.length
    ? interpolateReplayFrame(currentRoundFrames, currentMs)
    : null;
  $: currentRoundPlan = plan.rounds[currentRound - 1];
  $: currentRoundStartMs = getReplayRoundStartMs(plan.rounds, currentRound);
  $: roundRemainingMs = currentRoundPlan
    ? Math.max(0, currentRoundPlan.durationMs - Math.max(0, currentMs - currentRoundStartMs))
    : 0;
  $: replayScore = scoreAt(plan, currentMs);
  $: visibleKills = visibleReplay.events
    .filter((event): event is ReplayKillEventV1 => event.type === 'kill' && event.atMs <= currentMs)
    .slice(-4)
    .reverse();
  $: frameEvents = currentFrame
    ? visibleReplay.events.filter((event) =>
        event.roundNumber === currentRound && Math.abs(event.atMs - currentFrame!.atMs) <= 250)
    : [];
  $: activeLevels = currentFrame
    ? [...new Set(currentFrame.players.filter((player) => player.alive).map((player) => player.level))]
        .sort((left, right) => right - left)
    : radar.levels;
  $: hasDamageEvents = plan.rounds
    .slice(0, receivedRounds)
    .some((round) => round.events.some((event) => event.type === 'damage'));

  function scoreAt(replayPlan: ReplayPlanV1, atMs: number) {
    let scoreA = 0;
    let scoreB = 0;
    let roundEndAt = 0;
    for (const round of replayPlan.rounds) {
      roundEndAt += round.durationMs;
      if (atMs < roundEndAt) break;
      if (round.winnerOrganizationId === teamAOrganizationId()) scoreA += 1;
      else if (round.winnerOrganizationId === teamBOrganizationId()) scoreB += 1;
    }
    return { a: scoreA, b: scoreB };
  }

  function playerLabel(playerId: string) {
    return playerById.get(playerId)?.nickname ?? playerId.split(':').at(-1) ?? playerId;
  }

  function sideForOrganization(organizationId: string) {
    if (!currentRoundPlan) return '';
    return currentRoundPlan.tOrganizationId === organizationId ? 'T' : 'CT';
  }

  function formatTime(milliseconds: number) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function arrivalTimeMs() {
    return typeof performance === 'undefined' ? Date.now() : performance.now();
  }

  function getRoundEndMs(roundNumber: number) {
    const round = plan.rounds[roundNumber - 1];
    return getReplayRoundStartMs(plan.rounds, roundNumber) + (round?.durationMs ?? 0);
  }

  function setActiveRoundWindow() {
    clock.setRoundPlaybackWindow(getReplayPlaybackWindowMs(
      playbackSpeed,
      liveQueue.meanArrivalIntervalMs,
      activeRoundBacklog
    ));
  }

  function startQueuedRound(roundNumber: number, pendingBefore: number) {
    if (roundNumber <= 0 || !plan.rounds[roundNumber - 1]) return;
    playbackRound = roundNumber;
    activeRoundBacklog = pendingBefore;
    renderedRoundEnd = 0;
    const roundStartMs = getReplayRoundStartMs(plan.rounds, roundNumber);
    const roundEndMs = getRoundEndMs(roundNumber);
    clock.setDuration(roundEndMs);
    setActiveRoundWindow();
    clock.setSpeed(playbackSpeed);
    if (playbackSpeed === 'ultra') {
      clock.scrub(roundEndMs);
      clock.pause();
      currentMs = clock.currentMs;
      playing = false;
      if (mounted) {
        redrawLive();
        scheduleBoundaryAdvance();
      }
      return;
    }
    clock.scrub(roundStartMs + 1);
    if (!manuallyPaused) clock.play();
    currentMs = clock.currentMs;
    playing = clock.playing;
    if (mounted && playing) startAnimation();
  }

  function syncVisibleReplay(durationMs: number, roundCount: number) {
    if (durationMs === previousDurationMs && roundCount === previousVisibleRounds) return;
    previousDurationMs = durationMs;
    previousVisibleRounds = roundCount;
    liveQueue.receive(roundCount, arrivalTimeMs());
    if (durationMs <= 0) {
      clock.pause();
    } else if (!followingLive) {
      clock.setDuration(durationMs);
    } else if (playbackRound === 0 || playbackRound > roundCount) {
      startQueuedRound(liveQueue.currentRound, 0);
    } else if (renderedRoundEnd === playbackRound && liveQueue.pendingRounds.length) {
      scheduleBoundaryAdvance();
    }
    currentMs = clock.currentMs;
    playing = clock.playing;
    if (mounted) {
      if (playing) startAnimation();
      redrawLive();
    }
  }

  function resizeCanvases() {
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    viewport = createViewportTransform(width, height);
    baseContext = configureReplayCanvas(baseCanvas, width, height, window.devicePixelRatio);
    liveContext = configureReplayCanvas(liveCanvas, width, height, window.devicePixelRatio);
    redrawBase();
    redrawLive();
  }

  function redrawBase() {
    if (!baseContext) return;
    drawRadarBase(baseContext, radar, viewport, theme);
  }

  function redrawLive() {
    if (!liveContext) return;
    const roundForFrame = followingLive && playbackRound > 0
      ? playbackRound
      : getReplayRoundAtMs(plan.rounds.slice(0, receivedRounds), currentMs);
    const frames = visibleReplay.frames.filter((frame) => frame.roundNumber === roundForFrame);
    if (!frames.length) {
      liveContext.clearRect(0, 0, viewport.width, viewport.height);
      return;
    }
    currentFrame = interpolateReplayFrame(frames, currentMs);
    const events = visibleReplay.events.filter((event) =>
      event.roundNumber === roundForFrame && Math.abs(event.atMs - currentFrame!.atMs) <= 250);
    drawReplayFrame(liveContext, currentFrame, events, radar, viewport, theme);
  }

  function stopAnimation() {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  function stopBoundaryAdvance() {
    if (boundaryFrame !== null) cancelAnimationFrame(boundaryFrame);
    boundaryFrame = null;
  }

  function scheduleBoundaryAdvance() {
    if (!mounted || document.hidden || !followingLive || playbackRound <= 0 || boundaryFrame !== null) return;
    boundaryFrame = requestAnimationFrame(() => {
      boundaryFrame = null;
      if (!followingLive || playbackRound <= 0 || currentMs < getRoundEndMs(playbackRound)) return;
      if (renderedRoundEnd !== playbackRound) {
        const roundEndRendered = visibleReplay.events.some((event) =>
          event.type === 'round-end'
          && event.roundNumber === playbackRound
          && event.atMs <= currentMs
        );
        liveQueue.markRoundEndRendered(playbackRound, roundEndRendered);
        renderedRoundEnd = playbackRound;
      }
      const advance = liveQueue.advanceBetweenRounds();
      if (advance) startQueuedRound(advance.roundNumber, advance.pendingBefore);
    });
  }

  function animationLoop(at: number) {
    if (!playing || document.hidden) {
      stopAnimation();
      return;
    }
    const delta = previousAnimationAt ? at - previousAnimationAt : 0;
    previousAnimationAt = at;
    currentMs = clock.advance(delta);
    playing = clock.playing;
    redrawLive();
    if (followingLive && playbackRound > 0 && currentMs >= getRoundEndMs(playbackRound)) {
      clock.pause();
      playing = false;
      animationFrame = null;
      scheduleBoundaryAdvance();
      return;
    }
    animationFrame = playing ? requestAnimationFrame(animationLoop) : null;
  }

  function startAnimation() {
    stopAnimation();
    if (!mounted || !playing || document.hidden) return;
    previousAnimationAt = performance.now();
    animationFrame = requestAnimationFrame(animationLoop);
  }

  function togglePlayback() {
    if (!playing && followingLive && playbackRound > 0 && currentMs >= getRoundEndMs(playbackRound)) {
      scheduleBoundaryAdvance();
      return;
    }
    clock.toggle();
    playing = clock.playing;
    manuallyPaused = !playing;
    currentMs = clock.currentMs;
    if (playing) startAnimation();
    else stopAnimation();
    redrawLive();
  }

  function setPlaybackSpeed(speed: ReplayPlaybackSpeed) {
    playbackSpeed = speed;
    if (followingLive && playbackRound > 0) setActiveRoundWindow();
    clock.setSpeed(speed);
    if (speed === 'ultra') {
      manuallyPaused = false;
      if (followingLive && playbackRound > 0) clock.scrub(getRoundEndMs(playbackRound));
      playing = false;
      stopAnimation();
      currentMs = clock.currentMs;
      redrawLive();
      if (followingLive) scheduleBoundaryAdvance();
    } else if (visibleReplay.durationMs > 0) {
      manuallyPaused = false;
      if (followingLive && playbackRound > 0 && currentMs >= getRoundEndMs(playbackRound)) {
        scheduleBoundaryAdvance();
      }
      else clock.play();
      playing = clock.playing;
      startAnimation();
    }
    currentMs = clock.currentMs;
    redrawLive();
  }

  function scrubTo(atMs: number, userInitiated = true) {
    if (userInitiated) {
      followingLive = false;
      stopBoundaryAdvance();
      clock.setDuration(visibleReplay.durationMs);
      clock.setRoundPlaybackWindow(getReplayPlaybackWindowMs(playbackSpeed, null, 0));
    }
    clock.scrub(atMs);
    currentMs = clock.currentMs;
    redrawLive();
  }

  function chooseReplayRound(roundNumber: number) {
    followingLive = false;
    stopBoundaryAdvance();
    clock.setDuration(visibleReplay.durationMs);
    clock.setRoundPlaybackWindow(getReplayPlaybackWindowMs(playbackSpeed, null, 0));
    const round = plan.rounds[roundNumber - 1];
    const roundStartAt = getReplayRoundStartMs(plan.rounds, roundNumber);
    const target = playbackSpeed === 'ultra'
      ? roundStartAt + (round?.durationMs ?? 0)
      : roundStartAt + 1;
    scrubTo(target, false);
    if (playbackSpeed !== 'ultra') {
      manuallyPaused = false;
      clock.play();
      playing = clock.playing;
      startAnimation();
    }
  }

  function goToLiveEdge() {
    followingLive = true;
    manuallyPaused = false;
    stopBoundaryAdvance();
    liveQueue.resetToLatest(receivedRounds, arrivalTimeMs());
    startQueuedRound(liveQueue.currentRound, 0);
    redrawLive();
  }

  function zoomBy(factor: number, x = viewport.width / 2, y = viewport.height / 2) {
    viewport = zoomViewportAt(viewport, viewport.zoom * factor, { x, y });
    redrawBase();
    redrawLive();
  }

  function stagePoint(event: PointerEvent | WheelEvent) {
    const bounds = stage.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function updateTooltip(event: PointerEvent) {
    if (!currentFrame || dragging) {
      tooltipVisible = false;
      return;
    }
    const point = stagePoint(event);
    const hit = hitTestReplay(currentFrame, radar, viewport, point);
    tooltipVisible = Boolean(hit);
    tooltipX = point.x + 14;
    tooltipY = point.y + 14;
    if (!hit) return;
    if (hit.kind === 'callout') {
      const node = radar.nodes.find((candidate) => candidate.id === hit.id);
      tooltipText = `${hit.id.replaceAll('_', ' ')} · ${t('replayLevel')} ${node?.level ?? 0}`;
      return;
    }
    const player = currentFrame.players.find((candidate) => candidate.playerId === hit.id);
    tooltipText = `${playerLabel(hit.id)} · ${player?.side ?? ''} · ${Math.round(player?.hp ?? 0)} HP`;
  }

  function handlePointerDown(event: PointerEvent) {
    dragging = true;
    dragPointerId = event.pointerId;
    dragX = event.clientX;
    dragY = event.clientY;
    stage.setPointerCapture(event.pointerId);
    tooltipVisible = false;
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragging || dragPointerId !== event.pointerId) {
      updateTooltip(event);
      return;
    }
    viewport = panViewport(viewport, event.clientX - dragX, event.clientY - dragY);
    dragX = event.clientX;
    dragY = event.clientY;
    redrawBase();
    redrawLive();
  }

  function handlePointerUp(event: PointerEvent) {
    if (dragPointerId === event.pointerId) stage.releasePointerCapture(event.pointerId);
    dragging = false;
    dragPointerId = null;
  }

  function handleWheel(event: WheelEvent) {
    const point = stagePoint(event);
    zoomBy(event.deltaY < 0 ? 1.14 : 0.88, point.x, point.y);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === ' ') {
      event.preventDefault();
      togglePlayback();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scrubTo(currentMs - 5_000);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      scrubTo(currentMs + 5_000);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(1.14);
    } else if (event.key === '-') {
      event.preventDefault();
      zoomBy(0.88);
    }
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      hiddenWasPlaying = playing;
      clock.pause();
      playing = false;
      stopAnimation();
    } else if (hiddenWasPlaying && playbackSpeed !== 'ultra') {
      clock.play();
      playing = clock.playing;
      hiddenWasPlaying = false;
      startAnimation();
    } else if (followingLive && playbackRound > 0 && currentMs >= getRoundEndMs(playbackRound)) {
      scheduleBoundaryAdvance();
    }
  }

  onMount(() => {
    mounted = true;
    resizeObserver = new ResizeObserver(resizeCanvases);
    resizeObserver.observe(stage);
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotionQuery.matches) setPlaybackSpeed('ultra');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    resizeCanvases();
    if (playing) startAnimation();
  });

  onDestroy(() => {
    mounted = false;
    stopAnimation();
    stopBoundaryAdvance();
    resizeObserver?.disconnect();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  $: if (mounted) {
    theme;
    radar;
    redrawBase();
    redrawLive();
  }
</script>

<section class="replay-viewer" aria-label={t('replay')}>
  <header class="replay-toolbar">
    <div>
      <span class="eyebrow">{t('replay')} · 4 HZ</span>
      <strong>{plan.mapId.toUpperCase()}</strong>
    </div>
    <div class="replay-toolbar-status">
      <div class="replay-live-state" class:delayed={!followingLive}>
        <span>{followingLive ? t('replayLive') : t('replayDelayed')}</span>
        <strong>R{currentRound}</strong>
      </div>
      {#if !followingLive}
        <button type="button" class="replay-go-live" on:click={goToLiveEdge}>{t('replayGoLive')}</button>
      {/if}
      <div class="replay-legend" aria-hidden="true">
        <span class="terrorist">T</span>
        <span class="counter-terrorist">CT</span>
        <span class="vertical">↕ {t('replayLevel')}</span>
      </div>
    </div>
  </header>

  <div class="replay-layout">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions (canvas pan/zoom surface has complete keyboard controls) -->
    <div
      class="replay-stage"
      bind:this={stage}
      role="application"
      tabindex="0"
      aria-label={t('replayControls')}
      on:keydown={handleKeydown}
      on:pointerdown={handlePointerDown}
      on:pointermove={handlePointerMove}
      on:pointerup={handlePointerUp}
      on:pointercancel={handlePointerUp}
      on:pointerleave={() => tooltipVisible = false}
      on:wheel|preventDefault={handleWheel}
    >
      <canvas bind:this={baseCanvas} class="replay-canvas replay-canvas-base"></canvas>
      <canvas bind:this={liveCanvas} class="replay-canvas replay-canvas-live"></canvas>

      <div class="replay-hud">
        <div class="replay-hud-team team-a">
          <small>{sideForOrganization(teamAOrganizationId())}</small>
          <strong>{translateTeamName(language, series.teamA.name)}</strong>
        </div>
        <div class="replay-hud-score">
          <span>{replayScore.a}</span><i>:</i><span>{replayScore.b}</span>
          <small>R{currentRound} · {formatTime(roundRemainingMs)}</small>
        </div>
        <div class="replay-hud-team team-b">
          <small>{sideForOrganization(teamBOrganizationId())}</small>
          <strong>{translateTeamName(language, series.teamB.name)}</strong>
        </div>
      </div>

      <div class="replay-levels">{t('replayLevel')} {activeLevels.map((level) => level).join(' / ')}</div>

      {#if visibleRounds === 0}
        <div class="replay-waiting"><span></span><p>{t('replayWaiting')}</p></div>
      {/if}

      {#if tooltipVisible}
        <div class="replay-tooltip" style={`left:${tooltipX}px;top:${tooltipY}px`}>{tooltipText}</div>
      {/if}
    </div>

    <aside class="replay-sidepanel">
      <div class="replay-kill-feed" aria-live="polite">
        <span class="eyebrow">KILL FEED</span>
        {#if visibleKills.length}
          {#each visibleKills as kill}
            <div>
              <strong>{playerLabel(kill.killerPlayerId)}</strong>
              <span>{kill.weapon}</span>
              <b>{playerLabel(kill.victimPlayerId)}</b>
            </div>
          {/each}
        {:else}
          <p>—</p>
        {/if}
      </div>

      <div class="replay-stats">
        <span class="eyebrow">{t('replayStats')}</span>
        <div class="replay-stats-scroll">
          <table class="replay-stats-table">
            <thead><tr><th>PLAYER</th><th>{t('replayKills')}</th><th>{t('replayDeaths')}</th>{#if hasDamageEvents}<th>{t('replayDamage')}</th>{/if}<th>{t('replayAssists')}</th></tr></thead>
            <tbody>
              {#each replayStats.players as stats}
                <tr>
                  <th>{playerLabel(stats.playerId)}</th>
                  <td>{stats.kills}</td>
                  <td>{stats.deaths}</td>
                  {#if hasDamageEvents}<td>{stats.damage}</td>{/if}
                  <td>{stats.assists}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <small>{replayStats.rulesVersion} · {t('replayFlashAssists')} / {t('replayTrades')}</small>
      </div>
    </aside>
  </div>

  <div class="replay-controls">
    <button type="button" class="replay-play" disabled={!visibleReplay.durationMs} aria-label={playing ? t('replayPause') : t('replayPlay')} on:click={togglePlayback}>
      {playing ? 'Ⅱ' : '▶'}
    </button>
    <span>{formatTime(currentMs)}</span>
    <input
      type="range"
      min="0"
      max={Math.max(1, visibleReplay.durationMs)}
      step="250"
      value={currentMs}
      aria-label={t('replayControls')}
      disabled={!visibleReplay.durationMs}
      on:input={(event) => scrubTo(event.currentTarget.valueAsNumber)}
    />
    <span>{formatTime(visibleReplay.durationMs)}</span>
    <label class="replay-round-select">
      <span>{t('round')}</span>
      <select
        aria-label={t('replayChooseRound')}
        value={currentRound}
        disabled={!receivedRounds}
        on:change={(event) => chooseReplayRound(Number(event.currentTarget.value))}
      >
        {#each Array.from({ length: receivedRounds }, (_, index) => index + 1) as roundNumber}
          <option value={roundNumber}>R{roundNumber}</option>
        {/each}
      </select>
    </label>
    <div class="replay-speed" aria-label={t('speed')}>
      <button type="button" class:active={playbackSpeed === 'normal'} aria-pressed={playbackSpeed === 'normal'} on:click={() => setPlaybackSpeed('normal')}>{t('normal')}</button>
      <button type="button" class:active={playbackSpeed === 'fast'} aria-pressed={playbackSpeed === 'fast'} on:click={() => setPlaybackSpeed('fast')}>{t('fast')}</button>
      <button type="button" class:active={playbackSpeed === 'ultra'} aria-pressed={playbackSpeed === 'ultra'} on:click={() => setPlaybackSpeed('ultra')}>{t('ultra')}</button>
    </div>
    <div class="replay-zoom" aria-label="Zoom">
      <button type="button" aria-label="Zoom out" on:click={() => zoomBy(0.88)}>−</button>
      <button type="button" aria-label="Zoom in" on:click={() => zoomBy(1.14)}>+</button>
    </div>
  </div>
</section>
