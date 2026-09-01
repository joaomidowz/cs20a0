<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { playerById } from '$lib/game/data';
  import { translate, translateTeamName } from '$lib/game/i18n';
  import { ReplayClock } from '$lib/game/replay/canvas/clock';
  import { createReplayPlan } from '$lib/game/replay/plan';
  import {
    drawGoldenMirageFrame,
    drawGoldenMirageMap,
    loadGoldenMirageRadar
  } from '$lib/game/replay/golden/render';
  import {
    simulateGoldenMirage,
    type GoldenSimulatedRoundReplayV1
  } from '$lib/game/replay/golden/simulate';
  import { readGoldenPlayerSnapshot } from '$lib/game/replay/golden/snapshot';
  import type {
    GoldenPlayerSnapshot,
    GoldenReplayEvent,
    GoldenRoundReplayV1
  } from '$lib/game/replay/golden/types';
  import type { ReplayPlaybackSpeed, ReplayPlanV1, ReplaySide } from '$lib/game/replay/types';
  import type { Language, SeriesResult, Theme } from '$lib/game/types';

  export let series: SeriesResult;
  export let mapIndex: number;
  export let visibleRounds: number;
  export let language: Language = 'en';
  export let theme: Theme = 'dark';
  export let autoplay = false;
  export let initialSpeed: ReplayPlaybackSpeed = 'normal';
  export let onComplete: () => void = () => {};

  let canvas: HTMLCanvasElement;
  let canvasWrap: HTMLDivElement;
  let context: CanvasRenderingContext2D | null = null;
  let radarImage: HTMLImageElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let animationFrame: number | null = null;
  let previousAnimationAt = 0;
  let canvasSize = 1;
  let mounted = false;
  let selectedRound = 1;
  let syncedPlanId = '';
  let syncedVisibleRounds = -1;
  let currentMs = 0;
  let currentFrame = 0;
  let playing = false;
  let playbackSpeed: ReplayPlaybackSpeed = initialSpeed;
  let completedPlanId = '';
  let highlightedPlayerIndex = -1;
  const clock = new ReplayClock(0);

  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const teamAOrganizationId = () => series.teamA.organizationId ?? series.teamA.id;
  const teamBOrganizationId = () => series.teamB.organizationId ?? series.teamB.id;

  $: plan = createReplayPlan(series, mapIndex);
  $: matchReplay = simulateGoldenMirage(plan);
  $: availableRounds = Math.min(plan.rounds.length, Math.max(1, visibleRounds));
  $: syncReplay(plan, availableRounds);
  $: round = matchReplay.rounds[selectedRound - 1];
  $: roundPlan = plan.rounds[selectedRound - 1];
  $: currentFrame = round
    ? Math.min(round.frames - 1, currentMs * round.tickRate / 1_000 / round.frameStrideTicks)
    : 0;
  $: currentTick = Math.floor(currentFrame * (round?.frameStrideTicks ?? 2));
  $: score = scoreAt(plan, selectedRound, Boolean(round && currentMs >= round.durationMs - 1));
  $: killFeed = round
    ? round.events
        .filter((event) => event.type === 'kill' && event.tick <= currentTick)
        .slice(-4)
        .reverse()
    : [];
  $: leftRows = playerRows(plan, round, teamAOrganizationId(), currentFrame, currentTick);
  $: rightRows = playerRows(plan, round, teamBOrganizationId(), currentFrame, currentTick);
  $: phase = phaseAt(round, currentTick);
  $: timeLabel = timeAt(round, currentMs, currentTick);
  $: bombSeconds = bombTimeAt(round, currentTick);
  $: if (mounted && round && currentFrame >= 0 && canvasSize > 0) {
    redraw(round, currentFrame, canvasSize, highlightedPlayerIndex);
  }

  interface PlayerRow {
    id: string;
    name: string;
    role: string;
    side: ReplaySide;
    snapshot: GoldenPlayerSnapshot;
    money: number;
    kills: number;
    deaths: number;
  }

  const grenadeTypes = ['he', 'flash', 'smoke', 'molotov'] as const;

  function playerName(playerId: string): string {
    return playerById.get(playerId)?.nickname ?? playerId.split(':').at(-1) ?? playerId;
  }

  function playerRows(
    replayPlan: ReplayPlanV1,
    replayRound: GoldenSimulatedRoundReplayV1 | undefined,
    organizationId: string,
    frame: number,
    tick: number
  ): PlayerRow[] {
    if (!replayRound) return [];
    return replayRound.playerIds.flatMap((playerId, playerIndex) => {
      const player = replayPlan.players.find((candidate) => candidate.id === playerId);
      if (!player || player.organizationId !== organizationId) return [];
      const start = replayRound.startState.find((candidate) => candidate.playerId === playerId);
      return [{
        id: playerId,
        name: playerName(playerId),
        role: player.role,
        side: replayRound.sides[playerIndex],
        snapshot: readGoldenPlayerSnapshot(replayRound, frame, playerIndex),
        money: start?.money ?? 0,
        kills: replayRound.events.filter((event) =>
          event.type === 'kill' && event.playerId === playerId && event.tick <= tick).length,
        deaths: replayRound.events.filter((event) =>
          event.type === 'kill' && event.targetPlayerId === playerId && event.tick <= tick).length
      }];
    });
  }

  function scoreAt(replayPlan: ReplayPlanV1, roundNumber: number, includeCurrent: boolean) {
    let a = 0;
    let b = 0;
    const limit = Math.max(0, roundNumber - (includeCurrent ? 0 : 1));
    for (const replayRound of replayPlan.rounds.slice(0, limit)) {
      if (replayRound.winnerOrganizationId === teamAOrganizationId()) a += 1;
      if (replayRound.winnerOrganizationId === teamBOrganizationId()) b += 1;
    }
    return { a, b };
  }

  function sideFor(organizationId: string): ReplaySide {
    return roundPlan?.tOrganizationId === organizationId ? 'T' : 'CT';
  }

  function teamInitials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  }

  function phaseAt(replayRound: GoldenRoundReplayV1 | undefined, tick: number): string {
    if (!replayRound || tick < replayRound.tickRate * 5) return 'FREEZE TIME';
    const planted = replayRound.events.some((event) => event.type === 'plant' && event.tick <= tick);
    const ended = replayRound.events.some((event) => event.type === 'round-end' && event.tick <= tick);
    if (ended) return 'ROUND ENCERRADO';
    return planted ? 'BOMBA PLANTADA' : 'ROUND AO VIVO';
  }

  function timeAt(replayRound: GoldenRoundReplayV1 | undefined, milliseconds: number, tick: number): string {
    if (!replayRound) return '0:00';
    if (tick < replayRound.tickRate * 5) {
      return `0:${String(Math.ceil(5 - tick / replayRound.tickRate)).padStart(2, '0')}`;
    }
    const seconds = Math.max(0, Math.ceil((replayRound.durationMs - milliseconds) / 1_000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function bombTimeAt(replayRound: GoldenRoundReplayV1 | undefined, tick: number): number | null {
    if (!replayRound) return null;
    const plant = replayRound.events.filter((event) => event.type === 'plant' && event.tick <= tick).at(-1);
    if (!plant) return null;
    const resolved = replayRound.events.some((event) =>
      (event.type === 'defuse' || event.type === 'explode') && event.tick >= plant.tick && event.tick <= tick);
    return resolved ? null : Math.max(0, 40 - (tick - plant.tick) / replayRound.tickRate);
  }

  function syncReplay(replayPlan: ReplayPlanV1, receivedRounds: number): void {
    if (replayPlan.id === syncedPlanId && receivedRounds === syncedVisibleRounds) return;
    const changedPlan = replayPlan.id !== syncedPlanId;
    syncedPlanId = replayPlan.id;
    syncedVisibleRounds = receivedRounds;
    if (changedPlan) completedPlanId = '';
    selectRound(changedPlan ? 1 : receivedRounds, autoplay);
  }

  function selectRound(roundNumber: number, autoplay = false): void {
    const nextRound = Math.max(1, Math.min(availableRounds, roundNumber));
    selectedRound = nextRound;
    const selected = matchReplay?.rounds[nextRound - 1];
    const duration = selected?.durationMs ?? 0;
    clock.setDuration(duration);
    clock.scrub(0);
    clock.setSpeed(playbackSpeed);
    currentMs = clock.currentMs;
    playing = autoplay && playbackSpeed !== 'ultra';
    if (playing) clock.play();
    else clock.pause();
    if (autoplay && playbackSpeed === 'ultra' && mounted) scheduleAutoplayAdvance();
  }

  function setSpeed(speed: ReplayPlaybackSpeed): void {
    playbackSpeed = speed;
    clock.setSpeed(speed);
    currentMs = clock.currentMs;
    if (speed === 'ultra') {
      playing = false;
      if (autoplay) scheduleAutoplayAdvance();
    } else if (autoplay) {
      clock.play();
      playing = clock.playing;
    }
  }

  function togglePlayback(): void {
    if (!round) return;
    if (currentMs >= round.durationMs - 1) {
      clock.scrub(0);
      currentMs = 0;
    }
    if (playing) clock.pause();
    else clock.play();
    playing = clock.playing;
  }

  function scrub(milliseconds: number): void {
    clock.scrub(milliseconds);
    currentMs = clock.currentMs;
    playing = false;
    clock.pause();
  }

  function animate(now: number): void {
    const delta = previousAnimationAt ? Math.min(100, now - previousAnimationAt) : 0;
    previousAnimationAt = now;
    currentMs = clock.advance(delta);
    playing = clock.playing;
    if (autoplay && round && !playing && currentMs >= round.durationMs) scheduleAutoplayAdvance();
    animationFrame = requestAnimationFrame(animate);
  }

  function notifyComplete(): void {
    if (completedPlanId === plan.id) return;
    completedPlanId = plan.id;
    onComplete();
  }

  function scheduleAutoplayAdvance(): void {
    requestAnimationFrame(() => {
      if (!autoplay || !round || currentMs < round.durationMs) return;
      if (selectedRound < availableRounds) {
        selectRound(selectedRound + 1, true);
      } else if (availableRounds >= plan.rounds.length) {
        notifyComplete();
      }
    });
  }

  function resizeCanvas(): void {
    if (!canvas || !canvasWrap) return;
    const rect = canvasWrap.getBoundingClientRect();
    const nextSize = Math.max(240, Math.floor(Math.min(rect.width - 16, rect.height - 16)));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const pixelSize = Math.round(nextSize * dpr);
    if (canvas.width === pixelSize && canvas.height === pixelSize) return;
    canvasSize = nextSize;
    canvas.width = pixelSize;
    canvas.height = pixelSize;
    canvas.style.width = `${nextSize}px`;
    canvas.style.height = `${nextSize}px`;
    requestAnimationFrame(() => {
      if (mounted && round && radarImage) redraw(round, currentFrame, nextSize, highlightedPlayerIndex);
    });
  }

  function redraw(
    replayRound: GoldenRoundReplayV1,
    frame: number,
    size: number,
    highlighted: number
  ): void {
    if (!context || !radarImage) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    drawGoldenMirageMap(context, radarImage, size, dpr);
    drawGoldenMirageFrame(context, replayRound, frame, {
      size,
      dpr,
      playerNames: replayRound.playerIds.map(playerName),
      highlightedPlayerIndex: highlighted
    });
  }

  function eventSide(event: GoldenReplayEvent): ReplaySide {
    const index = round?.playerIds.indexOf(event.playerId ?? '') ?? -1;
    return index >= 0 ? round?.sides[index] ?? 'T' : 'T';
  }

  function roundWinnerSide(roundNumber: number): ReplaySide | null {
    const replayRound = matchReplay.rounds[roundNumber - 1];
    const replayRoundPlan = plan.rounds[roundNumber - 1];
    if (!replayRound || !replayRoundPlan || roundNumber > Math.max(visibleRounds, 1)) return null;
    return replayRound.winnerOrganizationId === replayRoundPlan.tOrganizationId ? 'T' : 'CT';
  }

  function formatSeconds(milliseconds: number): string {
    return `${(Math.max(0, milliseconds) / 1_000).toFixed(1)}s`;
  }

  onMount(() => {
    mounted = true;
    context = canvas.getContext('2d');
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvasWrap);
    resizeCanvas();
    loadGoldenMirageRadar().then((image) => {
      radarImage = image;
      if (round) redraw(round, currentFrame, canvasSize, highlightedPlayerIndex);
    });
    animationFrame = requestAnimationFrame(animate);
    if (autoplay && playbackSpeed === 'ultra') scheduleAutoplayAdvance();
  });

  onDestroy(() => {
    mounted = false;
    resizeObserver?.disconnect();
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  });
</script>

<section class="golden-viewer" data-theme={theme} aria-label="Replay Mirage">
  <div class="golden-topbar">
    <div class="golden-team">
      <span class:ct={sideFor(teamAOrganizationId()) === 'CT'} class:t={sideFor(teamAOrganizationId()) === 'T'} class="golden-logo">
        {teamInitials(series.teamA.name)}
      </span>
      <div>
        <strong>{translateTeamName(language, series.teamA.name)}</strong>
        <small>{sideFor(teamAOrganizationId()) === 'CT' ? 'COUNTER-TERRORISTS' : 'TERRORISTS'}</small>
      </div>
    </div>
    <div class="golden-score">
      <b class:ct={sideFor(teamAOrganizationId()) === 'CT'} class:t={sideFor(teamAOrganizationId()) === 'T'}>{score.a}</b>
      <span>MIRAGE<strong>ROUND {selectedRound} / {plan.rounds.length}</strong></span>
      <b class:ct={sideFor(teamBOrganizationId()) === 'CT'} class:t={sideFor(teamBOrganizationId()) === 'T'}>{score.b}</b>
    </div>
    <div class="golden-team right">
      <div>
        <strong>{translateTeamName(language, series.teamB.name)}</strong>
        <small>{sideFor(teamBOrganizationId()) === 'CT' ? 'COUNTER-TERRORISTS' : 'TERRORISTS'}</small>
      </div>
      <span class:ct={sideFor(teamBOrganizationId()) === 'CT'} class:t={sideFor(teamBOrganizationId()) === 'T'} class="golden-logo">
        {teamInitials(series.teamB.name)}
      </span>
    </div>
  </div>

  <div class="golden-main">
    <aside class="golden-roster left">
      <div class="golden-roster-head"><span>{sideFor(teamAOrganizationId())}</span><b>{leftRows.reduce((sum, row) => sum + row.money, 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</b></div>
      <div class="golden-player-list">
        {#each leftRows as row}
          <button
            type="button"
            class:dead={!row.snapshot.alive}
            class:ct={row.side === 'CT'}
            class:t={row.side === 'T'}
            class="golden-player-card"
            on:mouseenter={() => highlightedPlayerIndex = round?.playerIds.indexOf(row.id) ?? -1}
            on:mouseleave={() => highlightedPlayerIndex = -1}
          >
            <i></i>
            <div class="golden-player-line"><strong>{row.name}</strong><span><b>{row.kills}</b> / {row.deaths}</span></div>
            <div class="golden-health"><span style={`width:${Math.max(0, row.snapshot.hp)}%`}></span></div>
            <div class="golden-loadout"><strong>{row.snapshot.weapon.toUpperCase()}</strong><em>{row.role.toUpperCase()}</em>{#if row.snapshot.hasBomb}<em class="bomb">C4</em>{/if}</div>
            <div class="golden-nades">{#each grenadeTypes as grenade}{#each Array(row.snapshot.grenades[grenade]) as _}<span class={grenade} title={grenade}></span>{/each}{/each}</div>
            <small>${row.money}</small>
          </button>
        {/each}
      </div>
    </aside>

    <div class="golden-stage">
      <div class="golden-stage-top">
        <span>{phase}</span><strong class:danger={timeLabel === '0:00'}>{timeLabel}</strong>
        {#if bombSeconds !== null}<b>◈ {bombSeconds.toFixed(1)}</b>{/if}
        <i></i>
        <small>{'strategy' in round ? round.strategy.replace('_', ' ').toUpperCase() : ''} · {'ctFormation' in round ? round.ctFormation : ''}</small>
      </div>
      <div class="golden-canvas-wrap" bind:this={canvasWrap}>
        <canvas class="golden-map-canvas" bind:this={canvas}></canvas>
        <div class="golden-kill-feed" aria-live="polite">
          {#each killFeed as event}
            <div>
              <strong class:ct={eventSide(event) === 'CT'} class:t={eventSide(event) === 'T'}>{playerName(event.playerId ?? '')}</strong>
              <span>{event.weapon?.toUpperCase() ?? 'RIFLE'}</span>
              <b>{playerName(event.targetPlayerId ?? '')}</b>
            </div>
          {/each}
        </div>
        {#if round && currentMs >= round.durationMs - 1}
          <div class="golden-banner">
            <small>ROUND {selectedRound}</small>
            <strong>{roundWinnerSide(selectedRound)} VENCE</strong>
            <span>{score.a} – {score.b}</span>
          </div>
        {/if}
      </div>
    </div>

    <aside class="golden-roster right">
      <div class="golden-roster-head"><span>{sideFor(teamBOrganizationId())}</span><b>{rightRows.reduce((sum, row) => sum + row.money, 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</b></div>
      <div class="golden-player-list">
        {#each rightRows as row}
          <button
            type="button"
            class:dead={!row.snapshot.alive}
            class:ct={row.side === 'CT'}
            class:t={row.side === 'T'}
            class="golden-player-card"
            on:mouseenter={() => highlightedPlayerIndex = round?.playerIds.indexOf(row.id) ?? -1}
            on:mouseleave={() => highlightedPlayerIndex = -1}
          >
            <i></i>
            <div class="golden-player-line"><strong>{row.name}</strong><span><b>{row.kills}</b> / {row.deaths}</span></div>
            <div class="golden-health"><span style={`width:${Math.max(0, row.snapshot.hp)}%`}></span></div>
            <div class="golden-loadout"><strong>{row.snapshot.weapon.toUpperCase()}</strong><em>{row.role.toUpperCase()}</em>{#if row.snapshot.hasBomb}<em class="bomb">C4</em>{/if}</div>
            <div class="golden-nades">{#each grenadeTypes as grenade}{#each Array(row.snapshot.grenades[grenade]) as _}<span class={grenade} title={grenade}></span>{/each}{/each}</div>
            <small>${row.money}</small>
          </button>
        {/each}
      </div>
    </aside>
  </div>

  <div class="golden-bottom">
    <div class="golden-timeline">
      <span>1º TEMPO</span>
      <div>
        {#each Array.from({ length: Math.min(12, plan.rounds.length) }, (_, index) => index + 1) as roundNumber}
          <button type="button" class:ct={roundWinnerSide(roundNumber) === 'CT'} class:t={roundWinnerSide(roundNumber) === 'T'} class:current={selectedRound === roundNumber} disabled={roundNumber > availableRounds} on:click={() => selectRound(roundNumber)}>{roundNumber}</button>
        {/each}
      </div>
      {#if plan.rounds.length > 12}<i></i><span>2º TEMPO</span><div>
        {#each Array.from({ length: Math.min(12, plan.rounds.length - 12) }, (_, index) => index + 13) as roundNumber}
          <button type="button" class:ct={roundWinnerSide(roundNumber) === 'CT'} class:t={roundWinnerSide(roundNumber) === 'T'} class:current={selectedRound === roundNumber} disabled={roundNumber > availableRounds} on:click={() => selectRound(roundNumber)}>{roundNumber}</button>
        {/each}
      </div>{/if}
      <small>CLIQUE EM UM ROUND PARA VER O REPLAY</small>
    </div>
    <div class="golden-controls">
      <button type="button" class="icon" disabled={selectedRound <= 1} on:click={() => selectRound(selectedRound - 1)}>⏮</button>
      {#if !autoplay}
        <button type="button" class="play" on:click={togglePlayback}>{playing ? 'Ⅱ PAUSA' : '▶ PLAY'}</button>
      {/if}
      <button type="button" class="icon" disabled={selectedRound >= availableRounds} on:click={() => selectRound(selectedRound + 1)}>⏭</button>
      <div class="golden-speeds" aria-label={t('speed')}>
        <button type="button" class:active={playbackSpeed === 'simulate'} on:click={() => setSpeed('simulate')}>SIMULAR · 10s/ROUND</button>
        <button type="button" class:active={playbackSpeed === 'normal'} on:click={() => setSpeed('normal')}>NORMAL · 4×</button>
        <button type="button" class:active={playbackSpeed === 'fast'} on:click={() => setSpeed('fast')}>RÁPIDO · 8×</button>
        <button type="button" class:active={playbackSpeed === 'ultra'} on:click={() => setSpeed('ultra')}>ULTRA · INSTANTÂNEO</button>
      </div>
      <div class="golden-scrub">
        <input type="range" min="0" max={Math.max(1, round?.durationMs ?? 1)} step="125" value={currentMs} aria-label={t('replayControls')} on:input={(event) => scrub(event.currentTarget.valueAsNumber)} />
        <span>{formatSeconds(currentMs)} / {formatSeconds(round?.durationMs ?? 0)}</span>
      </div>
    </div>
  </div>
</section>

<style>
  .golden-viewer{--bg:#080a0e;--bg2:#0d1117;--panel:#11171f;--panel2:#161e28;--line:#1f2a36;--line2:#2b3947;--tx:#dfe6ee;--tx2:#93a3b4;--tx3:#5e6f80;--ct:#5aa9e6;--ct-dim:#2b5f8c;--ct-bg:#0f2131;--t:#e8b44f;--t-dim:#8a6a24;--t-bg:#2a2110;--red:#e5484d;--grn:#3ddc84;--org:#ff7a2f;--mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;--sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;flex-direction:column;height:min(760px,82vh);min-height:620px;overflow:hidden;background:var(--bg);color:var(--tx);font:13px var(--sans);border:1px solid var(--line);border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.38)}
  button{font-family:inherit;color:inherit}
  .golden-topbar{display:flex;align-items:stretch;height:62px;flex:0 0 auto;background:linear-gradient(180deg,#131b25,#0d1219);border-bottom:1px solid var(--line)}
  .golden-team{display:flex;align-items:center;gap:10px;padding:0 16px;flex:1;min-width:0}.golden-team.right{justify-content:flex-end;text-align:right}.golden-team strong{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.golden-team small{display:block;margin-top:2px;font-size:9.5px;font-weight:700;letter-spacing:1px;color:var(--tx3)}
  .golden-logo{width:30px;height:30px;border-radius:6px;display:grid;place-items:center;font-weight:800;font-size:13px;flex:0 0 auto}.golden-logo.ct{background:var(--ct-bg);color:var(--ct);box-shadow:inset 0 0 0 1px var(--ct-dim)}.golden-logo.t{background:var(--t-bg);color:var(--t);box-shadow:inset 0 0 0 1px var(--t-dim)}
  .golden-score{display:flex;align-items:center;gap:14px;padding:0 20px;background:#0a0e14;border-inline:1px solid var(--line)}.golden-score>b{font:700 30px/1 var(--mono);min-width:44px;text-align:center}.golden-score>b.ct{color:var(--ct)}.golden-score>b.t{color:var(--t)}.golden-score>span{text-align:center;color:var(--tx3);font-size:9.5px;letter-spacing:1.2px;font-weight:700}.golden-score>span strong{display:block;font:700 12px var(--mono);color:var(--tx2);letter-spacing:0;margin-top:3px}
  .golden-main{display:flex;flex:1;min-height:0}.golden-roster{width:218px;flex:0 0 auto;background:var(--bg2);display:flex;flex-direction:column;overflow:hidden}.golden-roster.left{border-right:1px solid var(--line)}.golden-roster.right{border-left:1px solid var(--line)}
  .golden-roster-head{padding:7px 10px;font-size:9.5px;font-weight:700;letter-spacing:1.2px;color:var(--tx3);border-bottom:1px solid var(--line);display:flex;justify-content:space-between;background:#0a0e14}.golden-roster-head b{font:10.5px var(--mono);letter-spacing:0}
  .golden-player-list{padding:5px;display:flex;flex-direction:column;gap:4px;overflow:auto}.golden-player-card{position:relative;width:100%;text-align:left;background:var(--panel);color:var(--tx);border:1px solid var(--line);border-radius:5px;padding:6px 8px 7px;overflow:hidden;cursor:default}.golden-player-card.dead{opacity:.36}.golden-player-card>i{position:absolute;left:0;top:0;bottom:0;width:2.5px}.golden-player-card.ct>i{background:var(--ct)}.golden-player-card.t>i{background:var(--t)}
  .golden-player-line{display:flex;gap:6px;align-items:center}.golden-player-line strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.golden-player-line span{font:10px var(--mono);color:var(--tx3)}.golden-player-line span b{color:var(--tx2)}
  .golden-health{height:4px;background:#0a0e14;border-radius:2px;margin:5px 0 4px;overflow:hidden}.golden-health span{display:block;height:100%;background:var(--grn);border-radius:2px}.golden-player-card:not(.dead) .golden-health span[style*="width:0"]{background:var(--red)}
  .golden-loadout{display:flex;align-items:center;gap:5px;min-height:13px}.golden-loadout strong{flex:1;font:10px var(--mono)}.golden-loadout em{font-style:normal;font-size:8px;padding:1px 3px;border-radius:2px;background:#1e2630;color:#9fb1c2;border:1px solid #2e3b49}.golden-loadout em.bomb{background:#422817;color:#ffad68;border-color:#7a4826}
  .golden-nades{display:flex;gap:2.5px;margin-top:4px;min-height:9px}.golden-nades span{width:8px;height:9px;border-radius:2px;opacity:.9}.golden-nades .he{background:#5f7f4a}.golden-nades .flash{background:#c9c05a}.golden-nades .smoke{background:#9aa5ad}.golden-nades .molotov{background:#d4622a}.golden-player-card>small{position:absolute;right:8px;bottom:5px;font:10px var(--mono);color:#5f9e6f}
  .golden-stage{flex:1;min-width:0;display:flex;flex-direction:column;background:#05070a;position:relative}.golden-stage-top{height:34px;flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:0 12px;background:#0a0e14;border-bottom:1px solid var(--line)}.golden-stage-top>span{font-size:10px;font-weight:700;letter-spacing:1.1px;color:var(--tx3)}.golden-stage-top>strong{font:700 17px var(--mono)}.golden-stage-top>strong.danger{color:var(--red)}.golden-stage-top>b{font:700 11px var(--mono);background:#2a1408;color:var(--org);padding:2px 7px;border:1px solid #52290f;border-radius:3px}.golden-stage-top>i{flex:1}.golden-stage-top>small{font-size:9px;letter-spacing:.7px;color:var(--tx3);font-weight:700;text-align:right}
  .golden-canvas-wrap{flex:1;position:relative;display:grid;place-items:center;overflow:hidden;padding:8px}.golden-map-canvas{display:block;background:#05070b;border-radius:4px;box-shadow:0 0 0 1px #1a2530,0 10px 40px rgba(0,0,0,.55)}
  .golden-kill-feed{position:absolute;top:10px;right:12px;display:flex;flex-direction:column;gap:3px;pointer-events:none}.golden-kill-feed>div{display:flex;align-items:center;gap:6px;background:rgba(8,11,16,.86);border:1px solid var(--line);border-radius:3px;padding:3px 7px;font-size:11px;backdrop-filter:blur(3px)}.golden-kill-feed strong.ct{color:var(--ct)}.golden-kill-feed strong.t{color:var(--t)}.golden-kill-feed span{color:var(--tx2);font:10px var(--mono)}
  .golden-banner{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);z-index:8;text-align:center;background:rgba(6,9,14,.8);border:1px solid #22303e;border-radius:10px;padding:14px 34px;backdrop-filter:blur(4px);box-shadow:0 12px 44px rgba(0,0,0,.6)}.golden-banner small{display:block;font-size:11px;letter-spacing:2.5px;font-weight:700;color:var(--tx3)}.golden-banner strong{display:block;font-size:26px;margin-top:4px}.golden-banner span{display:block;font-size:11px;color:var(--tx2);margin-top:5px}
  .golden-bottom{flex:0 0 auto;background:var(--bg2);border-top:1px solid var(--line)}.golden-timeline{display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--line);overflow-x:auto}.golden-timeline>span{font-size:9px;letter-spacing:1px;color:var(--tx3);font-weight:700;white-space:nowrap}.golden-timeline>div{display:flex;gap:2px}.golden-timeline>i{width:1px;height:20px;background:var(--line2);margin:0 5px;flex:0 0 auto}.golden-timeline button{width:19px;height:22px;border-radius:2.5px;background:#0e141b;border:1px solid var(--line);display:grid;place-items:center;font:8.5px var(--mono);color:var(--tx3);cursor:pointer}.golden-timeline button.ct{background:#102a3e;border-color:#1d4a6d;color:#8ecbf5}.golden-timeline button.t{background:#332612;border-color:#6b5220;color:#f0ca79}.golden-timeline button.current{box-shadow:0 0 0 2px var(--tx2)}.golden-timeline button:disabled{opacity:.32;cursor:not-allowed}.golden-timeline>small{margin-left:auto;font-size:9px;letter-spacing:1px;color:var(--tx3);font-weight:700;white-space:nowrap}
  .golden-controls{display:flex;align-items:center;gap:8px;padding:7px 12px}.golden-controls>button,.golden-speeds button{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:5px 10px;font-size:11px;font-weight:600;color:var(--tx2);cursor:pointer;white-space:nowrap}.golden-controls>button:disabled{opacity:.35;cursor:not-allowed}.golden-controls>button.play{background:#153b2a;border-color:#1f5c40;color:#6ee7a8;min-width:74px}.golden-controls>button.icon{padding-inline:9px;font-family:var(--mono)}
  .golden-speeds{display:flex;gap:2px;background:#0a0e14;border:1px solid var(--line);border-radius:4px;padding:2px}.golden-speeds button{padding:3px 7px;border:0;background:transparent;font:600 9px var(--mono);color:var(--tx3)}.golden-speeds button.active{background:var(--ct);color:#04121e}
  .golden-scrub{flex:1;display:flex;align-items:center;gap:8px;min-width:120px}.golden-scrub input{flex:1;accent-color:var(--ct)}.golden-scrub span{font:10.5px var(--mono);color:var(--tx3);min-width:92px;text-align:right}
  @media(max-width:900px){.golden-viewer{height:auto;min-height:0;max-height:none}.golden-team{padding-inline:8px}.golden-team strong{font-size:12px}.golden-team small{display:none}.golden-score{gap:5px;padding-inline:8px}.golden-score>b{font-size:24px;min-width:28px}.golden-main{display:grid;grid-template-columns:1fr 1fr}.golden-stage{grid-column:1/-1;grid-row:1;min-height:min(82vw,540px)}.golden-roster{width:auto;min-width:0;max-height:210px}.golden-roster.left{grid-column:1;grid-row:2;border-right:1px solid var(--line)}.golden-roster.right{grid-column:2;grid-row:2}.golden-player-list{display:grid;grid-template-columns:1fr;overflow:auto}.golden-player-card{padding-block:4px}.golden-controls{flex-wrap:wrap}.golden-speeds{order:2;overflow-x:auto}.golden-scrub{order:3;flex-basis:100%}.golden-timeline>small{display:none}}
  @media(max-width:560px){.golden-topbar{height:52px}.golden-logo{display:none}.golden-team{max-width:25%}.golden-team.right{justify-content:flex-end}.golden-score{flex:1}.golden-score>span{font-size:8px}.golden-stage{min-height:96vw}.golden-stage-top>small{display:none}.golden-roster{max-height:178px}.golden-player-card>small,.golden-nades{display:none}.golden-loadout em{display:none}.golden-timeline{padding-inline:7px}.golden-controls{gap:5px;padding:7px}.golden-speeds{width:100%}.golden-speeds button{flex:1;font-size:8px}.golden-scrub span{min-width:82px}}
</style>
