<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getMapName } from '$lib/game/maps';
  import { getVisibleMapScore } from '$lib/game/seriesPresentation';
  import { getSandboxDecidedMaps, SANDBOX_BUY_LABELS, SANDBOX_ENDING_LABELS, SANDBOX_PHASE_LABELS, SANDBOX_SIDE_LABELS, SANDBOX_WEAPON_LABELS } from '$lib/game/sandbox/presentation';
  import { aggregateSandboxKills, countSandboxPistolWins, type SandboxRoundDetail } from '$lib/game/sandbox/rounds';
  import type { SandboxMajorMatch } from '$lib/game/sandbox/types';
  import { WEAPON_ICONS } from '$lib/game/sandbox/weaponIcons';

  export let match: SandboxMajorMatch;
  export let delay = 1500;
  export let auto = false;
  export let userTeamId = '';
  export let onTeam: (teamId: string) => void = () => {};
  export let onComplete: () => void = () => {};

  let activeMap = 0;
  let visibleRounds = 0;
  let started = false;
  let finished = false;
  let notified = false;
  let runId = 0;
  let appliedDelay = delay;
  let pendingTimeout: number | null = null;
  let resolvePendingWait: ((skipped: boolean) => void) | null = null;
  let shownKills = 0;
  let killTimers: number[] = [];
  let killCursor = '';

  const wait = (ms: number) => new Promise<boolean>((resolve) => {
    resolvePendingWait = resolve;
    pendingTimeout = window.setTimeout(() => {
      pendingTimeout = null;
      resolvePendingWait = null;
      resolve(false);
    }, ms);
  });

  $: decidedMaps = getSandboxDecidedMaps(match);
  $: currentMap = match.maps[activeMap];
  $: currentRound = visibleRounds > 0 ? currentMap?.rounds[visibleRounds - 1] : null;
  $: previousRound = visibleRounds > 1 ? currentMap?.rounds[visibleRounds - 2] : null;
  $: lastRoundWinner = currentRound
    ? (previousRound ? (currentRound.a > previousRound.a ? 'a' : 'b') : currentRound.a > 0 ? 'a' : 'b')
    : null;
  $: currentMapFinished = Boolean(currentMap && visibleRounds >= currentMap.rounds.length);
  $: inOvertime = Boolean(started && !finished && !currentMapFinished && currentRound && (currentRound.overtime || (currentRound.a >= 12 && currentRound.b >= 12)));
  $: currentMapScore = currentMap
    ? getVisibleMapScore(currentMap, currentRound, { isComplete: finished || currentMapFinished, isLive: started })
    : null;
  $: completedMapCount = finished
    ? match.maps.length
    : match.maps.slice(0, activeMap + (currentMapFinished ? 1 : 0)).length;
  $: visibleScoreA = match.maps.slice(0, completedMapCount).filter((map) => map.winnerId === match.teamA.id).length;
  $: visibleScoreB = match.maps.slice(0, completedMapCount).filter((map) => map.winnerId === match.teamB.id).length;
  $: userIsA = match.teamA.id === userTeamId;
  $: userWon = finished && match.winnerId === userTeamId;
  $: roundTicks = currentMap ? currentMap.rounds.slice(0, visibleRounds).map((round, index) => {
    const before = index > 0 ? currentMap.rounds[index - 1] : { a: 0, b: 0 };
    return round.a > before.a ? 'a' : 'b';
  }) : [];
  // Computed reactively (not via a template helper) so labels update when the playback state changes.
  $: mapStates = decidedMaps.map((decided, index) => mapState(index, Boolean(decided.result), { finished, started, activeMap, visibleRounds, currentMapFinished }));
  $: if (auto && !started && !finished) void play();
  $: if (delay === 0 && started && !finished) finishSeries();
  $: if (delay !== appliedDelay) applyDelay(delay);

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

  function skipMap() {
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

  $: teamNames = { [match.teamA.id]: match.teamA.name, [match.teamB.id]: match.teamB.name } as Record<string, string>;
  $: currentDetail = visibleRounds > 0 ? currentMap?.details?.[visibleRounds - 1] ?? null : null;
  $: revealKills(currentDetail ? `${activeMap}:${visibleRounds}` : '', currentDetail, delay);
  $: visibleKills = currentDetail ? currentDetail.kills.slice(0, shownKills) : [];
  $: fragLeaders = currentMap?.details ? aggregateSandboxKills(currentMap.details, visibleRounds).slice(0, 3) : [];
  $: mapExtras = match.maps.map((map) => {
    const details = map.details ?? [];
    return { pistols: countSandboxPistolWins(details), top: aggregateSandboxKills(details)[0] ?? null };
  });

  function clearKillTimers() {
    killTimers.forEach((timer) => window.clearTimeout(timer));
    killTimers = [];
  }

  // Kills of the last completed round trickle in during the wait for the next round, paced by their in-round time.
  function revealKills(cursor: string, detail: SandboxRoundDetail | null, roundDelay: number) {
    if (cursor === killCursor) return;
    killCursor = cursor;
    clearKillTimers();
    if (!detail) {
      shownKills = 0;
      return;
    }
    if (roundDelay < 400) {
      shownKills = detail.kills.length;
      return;
    }
    shownKills = 0;
    const span = roundDelay * 0.85;
    const last = Math.max(1, detail.kills.at(-1)?.second ?? 1);
    detail.kills.forEach((kill, index) => {
      killTimers.push(window.setTimeout(() => { shownKills = index + 1; }, Math.round(span * kill.second / last)));
    });
  }

  onDestroy(() => {
    runId += 1;
    clearWait(true);
    clearKillTimers();
  });
</script>

<section class="series panel sandbox-series" class:won={userWon} class:lost={finished && !userWon} aria-live="polite">
  <header class="series-header">
    <div>
      <span class="eyebrow">{SANDBOX_PHASE_LABELS[match.phase]} · MD{match.bestOf}</span>
      <h2 class="series-teams"><button type="button" class:mine={userIsA} disabled={userIsA} on:click={() => onTeam(match.teamA.id)}>{match.teamA.name}</button><i>vs</i><button type="button" class:mine={!userIsA} disabled={!userIsA} on:click={() => onTeam(match.teamB.id)}>{match.teamB.name}</button></h2>
    </div>
    {#if finished}
      <div class="series-score"><b class:mine={userIsA}>{match.scoreA}</b><i>:</i><b class:mine={!userIsA}>{match.scoreB}</b></div>
    {:else if started}
      <div class="sandbox-live"><span><i></i>AO VIVO</span><strong>{getMapName(currentMap?.mapId, currentMap?.map)}</strong><b>{visibleScoreA} – {visibleScoreB}</b></div>
    {:else}
      <div class="sandbox-pending">A DISPUTAR</div>
    {/if}
  </header>

  {#if started && currentMap && currentMapScore}
    <div class="live-map">
      <div class="live-map-score">
        <span class:mine={userIsA}>{match.teamA.name}</span>
        <b class:leading={currentMapScore.a > currentMapScore.b}>{currentMapScore.a}</b>
        <i>:</i>
        <b class:leading={currentMapScore.b > currentMapScore.a}>{currentMapScore.b}</b>
        <span class:mine={!userIsA}>{match.teamB.name}</span>
      </div>
      {#if inOvertime && currentMapScore}<strong class="ot-alert" role="status">⚠ OVERTIME · {currentMapScore.a}-{currentMapScore.b}</strong>{/if}
      <div class="round-strip" aria-hidden="true">
        {#each roundTicks as winner}<i class:a={winner === 'a'} class:b={winner === 'b'} class:user={(winner === 'a') === userIsA}></i>{/each}
      </div>
      <small>{currentMapFinished ? `${getMapName(currentMap.mapId, currentMap.map)} encerrado${currentMap.overtime ? ' na prorrogação' : ''}` : lastRoundWinner ? `Round ${visibleRounds} · ${lastRoundWinner === 'a' ? match.teamA.name : match.teamB.name}` : 'Início do mapa'}</small>
      {#if currentDetail}
        <div class="round-detail">
          <div class="round-economy">
            <span class="buy {currentDetail.economy.a.buy}" class:mine={userIsA}><i>{SANDBOX_SIDE_LABELS[currentDetail.sideA]}</i>{SANDBOX_BUY_LABELS[currentDetail.economy.a.buy]}{#if currentDetail.economy.a.awp}<em>AWP</em>{/if}</span>
            <em class="round-number">R{currentDetail.number}</em>
            <span class="buy right {currentDetail.economy.b.buy}" class:mine={!userIsA}>{#if currentDetail.economy.b.awp}<em>AWP</em>{/if}{SANDBOX_BUY_LABELS[currentDetail.economy.b.buy]}<i>{SANDBOX_SIDE_LABELS[currentDetail.sideA === 'ct' ? 't' : 'ct']}</i></span>
          </div>
          <ul class="kill-feed" aria-label="Feed de kills">
            {#each visibleKills as kill, index (`${currentDetail.number}-${index}`)}
              <li class:user={(kill.killerSide === 'a') === userIsA}>
                <b class="killer">{kill.killerName}</b>
                <span class="weapon" role="img" aria-label={SANDBOX_WEAPON_LABELS[kill.weapon]} title={SANDBOX_WEAPON_LABELS[kill.weapon]}>{@html WEAPON_ICONS[kill.weapon]}</span>
                {#if kill.headshot}<i class="hs" title="Headshot">HS</i>{/if}
                <b class="victim">{kill.victimName}</b>
                <time>{kill.second}s</time>
              </li>
            {/each}
          </ul>
          {#if shownKills >= currentDetail.kills.length}
            <small class="round-ending" class:user={(currentDetail.winner === 'a') === userIsA}>{SANDBOX_ENDING_LABELS[currentDetail.ending]}</small>
          {/if}
        </div>
      {/if}
      {#if fragLeaders.length}
        <ol class="frag-leaders" aria-label="Frags do mapa">
          {#each fragLeaders as line (line.playerId)}<li class:user={(line.side === 'a') === userIsA}><span>{line.name}</span><b>{line.kills}</b><small>/{line.deaths}</small></li>{/each}
        </ol>
      {/if}
    </div>
  {/if}

  <div class="decided-map-list">
    {#each decidedMaps as decided, index}
      {@const result = decided.result}
      {@const isLive = index === activeMap && started}
      <article class:live={isLive} class:done={finished || index < activeMap} class:not-played={finished && !result} class:user-pick={decided.teamId === userTeamId}>
        <div>
          <small>{decided.action === 'decider' ? 'DECIDER' : `PICK · ${teamNames[decided.teamId ?? ''] ?? ''}`}</small>
          <strong>{getMapName(decided.mapId)}</strong>
          <span>{mapStates[index]}</span>
          {#if (finished || index < activeMap) && result && mapExtras[index]?.top}
            <small class="map-extra">PISTOLS {mapExtras[index].pistols.a}–{mapExtras[index].pistols.b} · TOP {mapExtras[index].top?.name} {mapExtras[index].top?.kills}K</small>
          {/if}
        </div>
        {#if finished || index < activeMap}
          {#if result}<b class:won={result.winnerId === userTeamId} class:lostmap={userTeamId && result.winnerId !== userTeamId}>{result.scoreA} : {result.scoreB}</b>{:else}<b class="muted">— : —</b>{/if}
        {:else if isLive && currentMapScore}
          <b>{currentMapScore.a} : {currentMapScore.b}</b>
        {:else}
          <b class="muted">— : —</b>
        {/if}
      </article>
    {/each}
  </div>

  {#if !started && !finished}
    <button class="primary wide" type="button" on:click={play}>Iniciar série</button>
  {:else if started}
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
  .live-map-score b{min-width:1.4em;font:900 clamp(2.2rem,8vw,3.4rem)/1 'Arial Narrow',Impact,sans-serif;text-align:center;color:var(--muted);transition:color .2s ease}.live-map-score b.leading{color:var(--text)}.live-map-score i{color:var(--line);font:900 2rem/1 'Arial Narrow',Impact,sans-serif;font-style:normal}
  .round-strip{display:flex;flex-wrap:wrap;gap:3px;min-height:8px}.round-strip i{width:12px;height:8px;background:var(--line);animation:tickIn .18s ease-out}.round-strip i.user{background:var(--accent)}.round-strip i:not(.user){background:color-mix(in srgb,var(--danger) 70%,var(--line))}
  .live-map small{color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
  .decided-map-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:18px 0}
  .decided-map-list article{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;min-height:104px;padding:14px;border:1px solid var(--line);background:var(--surface-2);transition:border-color .2s ease,opacity .2s ease}
  .decided-map-list article.live{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent)}.decided-map-list article.not-played{opacity:.5}.decided-map-list article.user-pick small{color:var(--accent)}
  .decided-map-list small,.decided-map-list strong,.decided-map-list span{display:block}.decided-map-list small{min-height:1.2em;color:var(--muted);font-size:.5rem;font-weight:900;letter-spacing:.08em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .decided-map-list strong{margin-top:5px;font-size:1.15rem;text-transform:uppercase}.decided-map-list span{margin-top:7px;color:var(--muted);font-size:.52rem;font-weight:800;letter-spacing:.06em}
  .decided-map-list b{font:900 1.75rem 'Arial Narrow',Impact,sans-serif;white-space:nowrap}.decided-map-list b.muted{color:var(--line)}.decided-map-list b.won{color:var(--accent)}.decided-map-list b.lostmap{color:var(--danger)}
  .wide{width:100%}
  .ot-alert{justify-self:center;padding:5px 12px;border:1px solid var(--accent-2);color:var(--accent-2);font:900 .7rem 'Arial Narrow',Impact,sans-serif;letter-spacing:.18em;text-transform:uppercase;animation:otBlink .7s steps(2,start) infinite}
  @keyframes otBlink{to{visibility:hidden;box-shadow:0 0 16px var(--accent-2)}}
  @keyframes tickIn{from{transform:scaleY(.2);opacity:0}}
  .round-detail{display:grid;gap:8px;padding-top:8px;border-top:1px solid var(--line)}
  .round-economy{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:8px}
  .round-economy .buy{display:flex;align-items:center;gap:6px;min-width:0;color:var(--muted);font-size:.62rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}.round-economy .buy.right{justify-content:flex-end}
  .round-economy .buy i{padding:2px 5px;border:1px solid var(--line);color:var(--text);font-size:.5rem;font-style:normal}.round-economy .buy.mine i{border-color:var(--accent);color:var(--accent)}
  .round-economy .buy em{padding:2px 5px;background:var(--accent-2);color:var(--bg);font-size:.5rem;font-style:normal;letter-spacing:.06em}
  .round-economy .buy.full{color:var(--text)}.round-economy .buy.eco{color:var(--danger)}.round-economy .buy.force{color:var(--accent-2)}
  .round-number{color:var(--muted);font:900 .8rem 'Arial Narrow',Impact,sans-serif;letter-spacing:.1em}
  .kill-feed{display:grid;gap:4px;min-height:24px;margin:0;padding:0;list-style:none}
  .kill-feed li{display:flex;align-items:center;gap:8px;min-width:0;padding:4px 8px;border-left:2px solid color-mix(in srgb,var(--danger) 70%,var(--line));background:color-mix(in srgb,var(--surface) 75%,transparent);font-size:.78rem;animation:slideIn .3s ease-out}.kill-feed li.user{border-left-color:var(--accent)}
  .kill-feed .killer{overflow:hidden;color:var(--text);text-overflow:ellipsis;white-space:nowrap}.kill-feed li.user .killer{color:var(--accent)}
  .kill-feed .victim{overflow:hidden;color:var(--muted);font-weight:600;text-overflow:ellipsis;white-space:nowrap}
  .kill-feed .weapon{display:inline-flex;flex:none;width:46px;height:16px;color:var(--text)}.kill-feed .weapon :global(svg){width:100%;height:100%}
  .kill-feed .hs{flex:none;padding:1px 4px;border:1px solid var(--accent-2);color:var(--accent-2);font-size:.5rem;font-style:normal;font-weight:900}
  .kill-feed time{flex:none;margin-left:auto;color:var(--muted);font-size:.6rem;font-variant-numeric:tabular-nums}
  .live-map small.round-ending{color:var(--danger)}.live-map small.round-ending.user{color:var(--accent)}
  .frag-leaders{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0;padding:8px 0 0;border-top:1px solid var(--line);list-style:none}
  .frag-leaders li{display:flex;align-items:baseline;gap:4px;color:var(--muted);font-size:.66rem}.frag-leaders li span{font-weight:800;text-transform:uppercase}.frag-leaders li.user span{color:var(--accent)}.frag-leaders b{color:var(--text);font:900 .95rem 'Arial Narrow',Impact,sans-serif}.frag-leaders small{font-size:.58rem}
  .decided-map-list .map-extra{margin-top:6px;white-space:normal}
  @keyframes slideIn{from{transform:translateX(-8px);opacity:0}}
  @media (prefers-reduced-motion:reduce){.kill-feed li,.round-strip i{animation:none}}
  @media(max-width:620px){.series-header{align-items:flex-start;flex-direction:column}.sandbox-live{justify-items:start}.decided-map-list{grid-template-columns:1fr 1fr}.decided-map-list article{min-height:88px;padding:12px}.live-map{padding:12px}.live-map-score{grid-template-columns:auto auto auto;justify-content:center}.live-map-score span{display:none}.kill-feed time{display:none}.kill-feed li{font-size:.72rem}}
  @media(max-width:400px){.decided-map-list{grid-template-columns:1fr}}
</style>
