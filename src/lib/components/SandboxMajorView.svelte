<script context="module" lang="ts">
  export type SandboxSimulationMode = 'auto' | 'manual';
</script>

<script lang="ts">
  import ReplayViewer from './ReplayViewer.svelte';
  import { translateTeamName } from '$lib/game/i18n';
  import { getMapName } from '$lib/game/maps';
  import type { ReplayPlaybackSpeed } from '$lib/game/replay/types';
  import type { SandboxMajorState } from '$lib/game/sandbox/types';
  import type { Language, Theme } from '$lib/game/types';

  export let state: SandboxMajorState;
  export let mode: SandboxSimulationMode = 'auto';
  export let language: Language = 'pt-BR';
  export let theme: Theme = 'dark';
  export let initialSpeed: ReplayPlaybackSpeed = 'simulate';
  export let onStart: () => void = () => {};
  export let onAdvance: () => void = () => {};
  export let onRestart: () => void = () => {};

  let activeMapIndex = 0;
  let started = false;
  let syncedMatchId = '';

  $: currentMatch = state.matches[state.currentMatchIndex] ?? null;
  $: completedMaps = currentMatch?.maps.slice(0, activeMapIndex) ?? [];
  $: visibleSeriesScore = {
    a: currentMatch ? completedMaps.filter((map) => map.winnerId === currentMatch.teamA.id).length : 0,
    b: currentMatch ? completedMaps.filter((map) => map.winnerId === currentMatch.teamB.id).length : 0
  };
  $: championName = state.matches
    .flatMap((match) => [match.teamA, match.teamB])
    .find((team) => team.id === state.championId)?.name ?? state.championId ?? '—';
  $: resolvedBotMatches = state.matches
    .slice(0, state.currentMatchIndex + 1)
    .filter((match) => match.resolved && !match.replayable)
    .slice(-8);
  $: syncCurrentMatch(currentMatch?.id ?? '', mode);

  const copy = {
    'pt-BR': {
      title: 'Major Sandbox', botResults: 'Resultados simulados', start: 'Iniciar partida',
      restart: 'Montar outro time', champion: 'Campeão', map: 'Mapa', waiting: 'Aguardando início',
      live: 'Replay automático', final: 'Final'
    },
    en: {
      title: 'Sandbox Major', botResults: 'Simulated results', start: 'Start match',
      restart: 'Build another team', champion: 'Champion', map: 'Map', waiting: 'Waiting to start',
      live: 'Automatic replay', final: 'Final'
    },
    es: {
      title: 'Major Sandbox', botResults: 'Resultados simulados', start: 'Iniciar partida',
      restart: 'Crear otro equipo', champion: 'Campeón', map: 'Mapa', waiting: 'Esperando inicio',
      live: 'Replay automático', final: 'Final'
    }
  } as const;

  $: labels = copy[language];

  function syncCurrentMatch(matchId: string, simulationMode: SandboxSimulationMode) {
    if (!matchId || matchId === syncedMatchId) return;
    syncedMatchId = matchId;
    activeMapIndex = 0;
    started = false;
    if (simulationMode === 'auto') startCurrentMatch();
  }

  function startCurrentMatch() {
    if (!currentMatch?.replayable || started) return;
    activeMapIndex = 0;
    started = true;
    onStart();
  }

  function handleMapComplete() {
    if (!currentMatch || !started) return;
    if (activeMapIndex < currentMatch.maps.length - 1) {
      activeMapIndex += 1;
      return;
    }
    started = false;
    onAdvance();
  }

  function teamName(name: string) {
    return translateTeamName(language, name);
  }
</script>

<section class="sandbox-major" data-theme={theme} aria-labelledby="sandbox-major-title">
  <header class="major-heading">
    <div>
      <span class="eyebrow">SANDBOX</span>
      <h1 id="sandbox-major-title">{labels.title}</h1>
    </div>
    <button class="secondary" type="button" on:click={onRestart}>{labels.restart}</button>
  </header>

  {#if resolvedBotMatches.length}
    <section class="bot-results panel" data-testid="sandbox-bot-results" aria-label={labels.botResults}>
      <div class="section-heading">
        <span class="eyebrow">{labels.botResults}</span>
        <small>{resolvedBotMatches.length}</small>
      </div>
      <div class="result-grid">
        {#each resolvedBotMatches as match (match.id)}
          <article class="result-card" data-testid="sandbox-bot-result">
            <small>{match.phase.toUpperCase()} · MD{match.bestOf}</small>
            <div>
              <span class:winner={match.winnerId === match.teamA.id}>{teamName(match.teamA.name)}</span>
              <strong>{match.scoreA} : {match.scoreB}</strong>
              <span class:winner={match.winnerId === match.teamB.id}>{teamName(match.teamB.name)}</span>
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  {#if state.finished}
    <section class="finished panel">
      <span class="eyebrow">{labels.final}</span>
      <h2>{labels.champion}: {teamName(championName)}</h2>
      <button class="primary" type="button" on:click={onRestart}>{labels.restart}</button>
    </section>
  {:else if currentMatch?.replayable}
    <section class="user-series panel" data-testid="sandbox-user-series">
      <header class="series-heading">
        <div>
          <span class="eyebrow">{currentMatch.phase.toUpperCase()} · MD{currentMatch.bestOf}</span>
          <h2>{teamName(currentMatch.teamA.name)} <i>vs</i> {teamName(currentMatch.teamB.name)}</h2>
        </div>
        <div class="series-score">
          <strong>{visibleSeriesScore.a} : {visibleSeriesScore.b}</strong>
          <small>{started ? labels.live : labels.waiting}</small>
        </div>
      </header>

      <nav class="map-tabs" data-testid="sandbox-map-tabs" aria-label={`${labels.title} · mapas`}>
        {#each currentMatch.maps as map, index}
          <button
            type="button"
            class:active={index === activeMapIndex}
            class:complete={index < activeMapIndex}
            disabled={index !== activeMapIndex}
            aria-current={index === activeMapIndex ? 'step' : undefined}
          >
            <small>{labels.map} {index + 1}</small>
            <strong>{getMapName(map.mapId, map.map, labels.map)}</strong>
            {#if index < activeMapIndex}
              <span>{map.scoreA} : {map.scoreB}</span>
            {:else}
              <span>— : —</span>
            {/if}
          </button>
        {/each}
      </nav>

      {#if mode === 'manual' && !started}
        <div class="manual-start">
          <p>{labels.waiting}</p>
          <button class="primary" type="button" on:click={startCurrentMatch}>{labels.start}</button>
        </div>
      {:else if started}
        {#key `${currentMatch.id}:${activeMapIndex}`}
          <ReplayViewer
            series={currentMatch}
            mapIndex={activeMapIndex}
            visibleRounds={currentMatch.maps[activeMapIndex]?.rounds.length ?? 0}
            {language}
            {theme}
            autoplay={started}
            initialSpeed={initialSpeed}
            onComplete={handleMapComplete}
          />
        {/key}
      {/if}
    </section>
  {/if}
</section>

<style>
  .sandbox-major { display: grid; gap: 18px; }
  .major-heading, .series-heading, .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .major-heading h1, .series-heading h2, .finished h2 { margin: 4px 0 0; }
  .eyebrow { color: var(--muted); font-size: .72rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
  .panel { border: 1px solid var(--line); background: var(--surface); padding: 18px; }
  .bot-results { display: grid; gap: 12px; }
  .section-heading small { color: var(--muted); }
  .result-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 8px; }
  .result-card { padding: 11px 12px; border: 1px solid var(--line); background: var(--surface-2); }
  .result-card > small { color: var(--muted); }
  .result-card div { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; margin-top: 5px; }
  .result-card span { overflow: hidden; color: var(--muted); font-size: .86rem; text-overflow: ellipsis; white-space: nowrap; }
  .result-card span:last-child { text-align: right; }
  .result-card .winner { color: var(--text); font-weight: 750; }
  .user-series { display: grid; gap: 16px; min-width: 0; }
  .series-heading h2 { font-size: clamp(1.1rem, 2.8vw, 1.55rem); }
  .series-heading h2 i { color: var(--muted); font-size: .75em; font-style: normal; font-weight: 500; }
  .series-score { display: grid; justify-items: end; }
  .series-score strong { font-size: 1.55rem; }
  .series-score small { color: var(--muted); }
  .map-tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
  .map-tabs button { display: grid; gap: 3px; min-width: 0; padding: 10px 12px; color: var(--muted); text-align: left; border: 1px solid var(--line); background: var(--surface-2); }
  .map-tabs button.active { color: var(--text); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .map-tabs button.complete { opacity: .72; }
  .map-tabs small { text-transform: uppercase; }
  .map-tabs strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .manual-start, .finished { display: grid; justify-items: center; gap: 12px; padding-block: 34px; text-align: center; }
  .manual-start p { margin: 0; color: var(--muted); }
  button { cursor: pointer; }
  button:disabled { cursor: default; }
  .primary, .secondary { padding: 10px 15px; border-radius: 2px; font-weight: 750; }
  .primary { color: #07100b; border: 1px solid var(--accent); background: var(--accent); }
  .secondary { color: var(--text); border: 1px solid var(--line); background: var(--surface-2); }

  @media (max-width: 680px) {
    .major-heading, .series-heading { align-items: stretch; flex-direction: column; }
    .major-heading .secondary { width: 100%; }
    .series-score { grid-auto-flow: column; justify-content: space-between; justify-items: start; align-items: baseline; }
    .map-tabs { grid-template-columns: 1fr; }
    .result-grid { grid-template-columns: 1fr; }
  }
</style>
