<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { replaceState } from '$app/navigation';
  import Navbar from '$lib/components/Navbar.svelte';
  import PlayerCard from '$lib/components/PlayerCard.svelte';
  import DraftHud from '$lib/components/DraftHud.svelte';
  import SeriesViewer from '$lib/components/SeriesViewer.svelte';
  import SegmentedControl from '$lib/components/SegmentedControl.svelte';
  import { getTeamPlayers, playerById, playerTitle, teamById, teams, players } from '$lib/game/data';
  import { translate, type TranslationKey } from '$lib/game/i18n';
  import {
    getEligibleSlotRoles,
    getRoleLabel,
    PICK_REASONS,
    validatePlayerPick
  } from '$lib/game/roleRules';
  import {
    buildMajorRun,
    calculateUserTeamPower,
    createRunStats,
    createSeededRng,
    pickRandomTeam
  } from '$lib/game/simulation';
  import { defaultState, game, makeSeed } from '$lib/game/store';
  import {
    SPEEDS,
    type GameMode,
    type LineupSlotRole,
    type OrgStyle,
    type Player,
    type SimMode,
    type SimSpeed
  } from '$lib/game/types';
  import '../app.css';

  let detailsPlayer: Player | null = null;
  let toast = '';
  let awaitingAdvance = false;

  onMount(() => {
    return game.subscribe((state) => {
      const url = new URL(window.location.href);
      if (state.seed) url.searchParams.set('seed', state.seed);
      else url.searchParams.delete('seed');
      if (url.href !== window.location.href) replaceState(url, {});
    });
  });

  $: t = (key: TranslationKey) => translate($game.language, key);
  $: selectedLineup = $game.selectedPlayers;
  $: selectedPlayers = selectedLineup.map((selected) => playerById.get(selected.playerId)).filter((player): player is Player => Boolean(player));
  $: rolledTeam = $game.rolledTeamId ? teamById.get($game.rolledTeamId) ?? null : null;
  $: rolledPlayers = getTeamPlayers(rolledTeam);
  $: draftComplete = selectedPlayers.length === 5;
  $: userTeam = calculateUserTeamPower(selectedPlayers, $game.style, selectedLineup);
  $: currentSeries = $game.majorRun?.matches[$game.completedSeries] ?? null;
  $: completedMatches = $game.majorRun?.matches.slice(0, $game.completedSeries) ?? [];
  $: stageWins = completedMatches.filter((match) => match.phase === 'stage3' && match.winnerId === 'user').length;
  $: stageLosses = completedMatches.filter((match) => match.phase === 'stage3' && match.winnerId !== 'user').length;
  $: runMvp = [...$game.stats].sort((a, b) => (b.runRating + b.impact * 0.2 + b.clutches * 0.02 + b.mvpCount * 0.02) - (a.runRating + a.impact * 0.2 + a.clutches * 0.02 + a.mvpCount * 0.02))[0];

  const update = (patch: Partial<typeof $game>) => game.update((state) => ({ ...state, ...patch }));
  const lookupPlayer = (id: string) => playerById.get(id);

  onDestroy(() => document.body.classList.remove('modal-open'));

  function beginGame() {
    update({ seed: $game.seed || makeSeed(), phase: 'mode-select' });
  }

  function chooseMode(mode: GameMode) {
    update({ mode, phase: 'draft' });
  }

  function rollTeam() {
    if (!$game.styleLocked) return;
    const rng = createSeededRng(`${$game.seed}:draft:${selectedPlayers.length}:${$game.usedTeamIds.join('|')}`);
    const team = pickRandomTeam(teams, rng, $game.usedTeamIds);
    if (team) update({ rolledTeamId: team.id });
  }

  function openPlayer(player: Player) {
    detailsPlayer = player;
    document.body.classList.add('modal-open');
  }

  function closePlayer() {
    detailsPlayer = null;
    document.body.classList.remove('modal-open');
  }

  function cardValidation(player: Player) {
    return validatePlayerPick(player, selectedLineup, undefined, lookupPlayer);
  }

  function reasonText(reason?: string) {
    if (reason === PICK_REASONS.duplicate) return t('samePlayerPicked');
    if (reason === PICK_REASONS.awper) return t('lineHasAwper');
    if (reason === PICK_REASONS.igl) return t('lineHasIgl');
    if (reason === PICK_REASONS.entry) return t('lineHasEntry');
    if (reason === PICK_REASONS.lurker) return t('lineHasLurker');
    if (reason === PICK_REASONS.rifler) return t('rifleLimitReached');
    if (reason === PICK_REASONS.support) return t('roleOccupied');
    return reason ?? t('invalidRole');
  }

  function confirmPlayerPick(player: Player, selectedSlotRole: LineupSlotRole) {
    if (!rolledTeam || draftComplete || !$game.mode || !$game.styleLocked) return;
    const validation = validatePlayerPick(player, selectedLineup, selectedSlotRole, lookupPlayer);
    if (!validation.ok) {
      showToast(reasonText(validation.reason));
      return;
    }
    update({
      selectedPlayers: [...selectedLineup, { playerId: player.id, selectedSlotRole }],
      usedTeamIds: [...$game.usedTeamIds, rolledTeam.id],
      rolledTeamId: null
    });
    closePlayer();
    showToast(`${player.nickname ?? 'Player'} · ${getRoleLabel(selectedSlotRole)}`);
  }

  function launchMajor() {
    if (!draftComplete) return;
    const majorRun = buildMajorRun(selectedPlayers, $game.style, teams, players, $game.seed, selectedLineup);
    const stats = createRunStats(selectedPlayers, majorRun, $game.seed);
    awaitingAdvance = false;
    update({ majorRun, stats, completedSeries: 0, phase: 'stage3' });
  }

  function seriesCompleted() {
    if ($game.simMode === 'auto') {
      window.setTimeout(advanceSeries, 900);
    } else {
      awaitingAdvance = true;
    }
  }

  async function advanceSeries() {
    awaitingAdvance = false;
    const nextIndex = $game.completedSeries + 1;
    const next = $game.majorRun?.matches[nextIndex];
    if (!next) {
      update({ completedSeries: nextIndex, phase: 'result' });
      return;
    }
    update({ completedSeries: nextIndex, phase: next.phase === 'stage3' ? 'stage3' : 'playoffs' });
    await tick();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function compositionWarnings() {
    const roles = selectedLineup.map((selected) => selected.selectedSlotRole);
    const warnings: string[] = [];
    if (!roles.includes('awper')) warnings.push(t('noAwper'));
    if (!roles.includes('igl')) warnings.push(t('noIgl'));
    if (!roles.includes('support')) warnings.push(t('noSupport'));
    if ($game.style === 'aggressive') warnings.push(t('aggressiveLine'));
    if ($game.style === 'tactical') warnings.push(t('tacticalLine'));
    return warnings;
  }

  function vagueTraits(player: Player) {
    const traits: string[] = [];
    if ((player.firepower ?? 0) >= 92 || (player.entry ?? 0) >= 92) traits.push(t('veryAggressive'));
    if ((player.clutch ?? 0) >= 92) traits.push(t('greatClutch'));
    if ((player.role ?? '').includes('awp')) traits.push(t('mainAwper'));
    if ((player.igl ?? 0) >= 80 || (player.support ?? 0) >= 90) traits.push(t('tacticalProfile'));
    return traits.length ? traits : [t('consistentPlayer'), t('versatileProfile')];
  }

  function resetRun(newSeed = false) {
    const preserved = { language: $game.language, theme: $game.theme, simMode: $game.simMode, simSpeed: $game.simSpeed };
    game.set({ ...defaultState(newSeed ? makeSeed() : $game.seed || makeSeed()), ...preserved, phase: 'mode-select' });
    closePlayer();
    awaitingAdvance = false;
  }

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', $game.seed);
    await navigator.clipboard.writeText(url.toString());
    showToast(t('copied'));
  }

  async function shareRun() {
    const text = `cs20a0 · ${$game.majorRun?.placement ?? ''} · seed ${$game.seed}`;
    if (navigator.share) await navigator.share({ title: 'cs20a0', text, url: window.location.href });
    else await copyLink();
  }

  function showToast(message: string) {
    toast = message;
    window.setTimeout(() => (toast = ''), 1800);
  }

  function changeSimulationMode(value: string) {
    update({ simMode: value as SimMode });
    showToast(t('configurationSaved'));
  }

  function changeSimulationSpeed(value: string) {
    update({ simSpeed: value as SimSpeed });
    showToast(t('configurationSaved'));
  }

  function phaseLabel() {
    if ($game.phase === 'stage3') return `${t('stage3')} · ${stageWins}-${stageLosses}`;
    return t('playoffs');
  }

  function rarityClass(player: Player) {
    return `rarity-${(player.rarity ?? 'common').toLowerCase()}`;
  }
</script>

<svelte:head>
  <title>cs20a0 · Monte sua line e sobreviva ao Major</title>
  <meta name="description" content="Draft de Counter-Strike com 30 times históricos, 150 jogadores e Major simulado por seed." />
</svelte:head>

<Navbar
  language={$game.language}
  theme={$game.theme}
  onLanguage={(language) => update({ language })}
  onTheme={() => update({ theme: $game.theme === 'dark' ? 'light' : 'dark' })}
/>

<main>
  {#if $game.phase === 'home'}
    <section class="hero shell">
      <div class="hero-copy">
        <div class="live-tag"><span></span> MAJOR DRAFT SIMULATOR</div>
        <h1>{t('headline')}</h1>
        <p class="hero-lead">{t('subheadline')}</p>
        <div class="badges">
          <span>30 TIMES</span><span>150 JOGADORES</span><span>2016–2025</span><span>SEED COMPARTILHÁVEL</span>
        </div>
        <p class="curated">{t('curated')}</p>
        <div class="hero-actions">
          <button class="primary" type="button" on:click={beginGame}>{t('play')} <span>→</span></button>
        </div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="radar"><i></i><i></i><i></i><i></i><span></span></div>
        <div class="floating-score"><small>LIVE PROTOCOL</small><b>13 : 11</b><span>ROUND 24 / MR12</span></div>
        <div class="crosshair"></div>
      </div>
    </section>
    <section class="feature-strip shell">
      <article><span>01</span><div><strong>DRAFT CURADO</strong><small>Uma escolha por time. Cinco chances.</small></div></article>
      <article><span>02</span><div><strong>SEED REAL</strong><small>Mesmo caminho, mesmas consequências.</small></div></article>
      <article><span>03</span><div><strong>MR12 + OT</strong><small>Stage 3, playoffs e final MD5.</small></div></article>
    </section>
  {:else if $game.phase === 'mode-select'}
    <section class="screen shell narrow">
      <header class="screen-header centered">
        <span class="eyebrow">QUEUE SELECT</span>
        <h1>{t('chooseMode')}</h1>
        <p>{t('modeIntro')}</p>
      </header>
      <div class="mode-grid">
        <button class="mode-card premier" type="button" on:click={() => chooseMode('premier')}>
          <span class="mode-number">01</span><span class="mode-icon">P</span><h2>{t('premier')}</h2><p>{t('premierDesc')}</p><b>FULL INTEL →</b>
        </button>
        <button class="mode-card faceit" type="button" on:click={() => chooseMode('faceit')}>
          <span class="mode-number">02</span><span class="mode-icon">F</span><h2>{t('faceit')}</h2><p>{t('faceitDesc')}</p><b>BLIND DRAFT →</b>
        </button>
      </div>
    </section>
  {:else if $game.phase === 'draft'}
    <section class="screen shell">
      <header class="draft-header">
        <div><span class="eyebrow">DRAFT ROOM · {$game.mode?.toUpperCase()}</span><h1>{draftComplete ? t('complete') : `${t('opportunity')} ${selectedPlayers.length + 1}/5`}</h1></div>
        <button class="seed-button" type="button" on:click={copyLink}>SEED / {$game.seed}</button>
      </header>

      {#if !$game.styleLocked}
        <section class="style-block panel">
          <div class="section-heading"><div><span class="eyebrow">TACTICAL IDENTITY</span><h2>{t('chooseStyle')}</h2></div></div>
          <p class="style-required">{t('chooseStyleBeforeRoll')}</p>
          <div class="segmented">
            {#each ['aggressive', 'balanced', 'tactical'] as style}
              <button type="button" on:click={() => update({ style: style as OrgStyle, styleLocked: true })}>
                <strong>{t(style as 'aggressive' | 'balanced' | 'tactical')}</strong>
                <small>{t(`${style}Desc` as 'aggressiveDesc' | 'balancedDesc' | 'tacticalDesc')}</small>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if !draftComplete}
        <section class="roll-zone panel">
          {#if !$game.styleLocked}
            <div class="roll-empty locked-roll">
              <div class="scanner"><span></span></div>
              <span class="eyebrow">TEAM LOTTERY / {selectedPlayers.length + 1} OF 5</span>
              <p>{t('chooseStyleBeforeRoll')}</p>
              <button class="primary" type="button" disabled>{t('rollTeam')} <span>↻</span></button>
            </div>
          {:else if !rolledTeam}
            <div class="roll-empty">
              <div class="scanner"><span></span></div>
              <span class="eyebrow">TEAM LOTTERY / {selectedPlayers.length + 1} OF 5</span>
              <h2>{t('emptyTitle')}</h2>
              <p>{t('noRepeat')}</p>
              <button class="primary" type="button" on:click={rollTeam}>{t('rollTeam')} <span>↻</span></button>
            </div>
          {:else}
            <div class="team-banner">
              <div class="team-avatar">{(rolledTeam.name ?? 'T').slice(0, 2).toUpperCase()}</div>
              <div><span class="eyebrow">ROLLED TEAM</span><h2>{rolledTeam.name ?? 'Time'} <b>{rolledTeam.year ?? ''}</b></h2><p>{rolledTeam.game ?? 'CS'} · RANK #{rolledTeam.sourceRank ?? rolledTeam.rank ?? '—'} · {rolledTeam.rarity ?? 'standard'}</p></div>
              <span class="team-power">PWR {rolledTeam.teamPowerPreview ?? rolledTeam.power ?? '—'}</span>
            </div>
            <p class="pick-instruction">{t('pickOne')}</p>
            <div class="player-grid">
              {#each rolledPlayers as player (player.id)}
                {@const validation = cardValidation(player)}
                <PlayerCard
                  player={player}
                  mode={$game.mode ?? 'premier'}
                  revealed={false}
                  blockedReason={validation.ok ? '' : reasonText(validation.reason)}
                  onOpen={openPlayer}
                />
              {/each}
            </div>
          {/if}
        </section>
      {/if}

      <DraftHud
        selectedPlayers={selectedLineup}
        style={$game.style}
        styleLocked={$game.styleLocked}
        styleLabel={t($game.style)}
        mode={$game.mode ?? 'premier'}
        revealed={draftComplete}
        label={t('orgHud')}
        onOpen={openPlayer}
      />

      {#if draftComplete}
        <section class="summary-grid">
          <article class="power-panel panel"><span class="eyebrow">ORG POWER INDEX</span><strong>{userTeam.power.toFixed(1)}</strong><div class="power-bar"><span style={`width:${userTeam.power}%`}></span></div><small>{t('estimatedPower')} · {t($game.style)}</small></article>
          <article class="panel composition"><span class="eyebrow">{t('composition')}</span><div class="warning-list">{#each compositionWarnings() as warning}<span>{warning}</span>{/each}{#if !compositionWarnings().length}<span>Composição pronta para o servidor</span>{/if}</div></article>
        </section>
        {#if $game.mode === 'faceit'}<div class="reveal-note">INTEL UNLOCKED · {t('revealed')}</div>{/if}
        <button class="primary wide major-button" type="button" on:click={launchMajor}>{t('startMajor')} →</button>
      {/if}
    </section>
  {:else if $game.phase === 'stage3' || $game.phase === 'playoffs'}
    <section class="screen shell match-screen">
      <header class="match-topbar"><div><span class="eyebrow">MAJOR LIVE</span><h1>{phaseLabel()}</h1></div>{#if $game.phase === 'stage3'}<div class="record"><span>{stageWins}</span><small>W</small><b>:</b><span>{stageLosses}</span><small>L</small></div>{/if}</header>
      <div class="match-controls panel">
        <div class="control-group">
          <span>{t('simulationMode')}</span>
          <SegmentedControl
            value={$game.simMode}
            label={t('simulationMode')}
            options={[{ value: 'manual', label: t('manual') }, { value: 'auto', label: t('automatic') }]}
            onChange={changeSimulationMode}
          />
        </div>
        <div class="control-group">
          <span>{t('speed')}</span>
          <SegmentedControl
            value={$game.simSpeed}
            label={t('speed')}
            options={[{ value: 'normal', label: t('normal') }, { value: 'fast', label: t('fast') }, { value: 'ultra', label: t('ultra') }]}
            onChange={changeSimulationSpeed}
          />
        </div>
      </div>
      {#if currentSeries}
        {#key currentSeries.id}
          <SeriesViewer
            series={currentSeries}
            delay={SPEEDS[$game.simSpeed]}
            auto={$game.simMode === 'auto'}
            labels={{ start: t('startSeries'), skip: t('skipMap'), round: t('round'), map: t('map'), final: t('final'), waiting: t('waiting'), pending: t('pending'), inProgress: t('inProgress'), mapInProgress: t('mapInProgress') }}
            onComplete={seriesCompleted}
          />
        {/key}
        {#if awaitingAdvance}<button class="primary wide next-match" type="button" on:click={advanceSeries}>{t('nextMatch')} →</button>{/if}
      {/if}
      <aside class="run-feed panel"><span class="eyebrow">RUN FEED</span>{#each completedMatches as match}<div><span>{match.teamA.name}</span><b>{match.scoreA} : {match.scoreB}</b><span>{match.teamB.name}</span></div>{/each}{#if !completedMatches.length}<p>{t('waitingResult')}</p>{/if}</aside>
    </section>
  {:else if $game.phase === 'result'}
    {@const run = $game.majorRun}
    {#if run}
      {@const wonSeries = run.matches.filter((match) => match.winnerId === 'user').length}
      {@const wonMaps = run.matches.reduce((sum, match) => sum + match.maps.filter((map) => map.winnerId === 'user').length, 0)}
      {@const totalMaps = run.matches.reduce((sum, match) => sum + match.maps.length, 0)}
      <section class="screen shell result-screen">
        <header class:success={run.champion} class="result-hero"><span class="eyebrow">FINAL REPORT / {$game.seed}</span><h1>{run.champion ? t('champion') : t('eliminated')}</h1><p>{run.placement}</p></header>
        <div class="campaign-grid">
          <article><small>STAGE 3</small><strong>{run.stage3.wins}-{run.stage3.losses}</strong></article><article><small>{t('placement')}</small><strong>{run.placement}</strong></article><article><small>{t('seriesWon')}</small><strong>{wonSeries}</strong></article><article><small>{t('seriesLost')}</small><strong>{run.matches.length - wonSeries}</strong></article><article><small>{t('mapsWon')}</small><strong>{wonMaps}</strong></article><article><small>{t('mapsLost')}</small><strong>{totalMaps - wonMaps}</strong></article>
        </div>
        <section class="panel match-history"><div class="section-heading"><div><span class="eyebrow">MATCH LOG</span><h2>{t('allMatches')}</h2></div></div>{#each run.matches as match}<details><summary><span>{match.teamA.name}</span><b>{match.scoreA} : {match.scoreB}</b><span>{match.teamB.name}</span></summary><div class="map-details">{#each match.maps as map}<span>Mapa {map.map} · {map.scoreA} x {map.scoreB} {map.overtime ? '· OT' : ''}</span>{/each}</div></details>{/each}</section>
        <div class="result-actions"><button class="primary" type="button" on:click={() => resetRun(false)}>{t('tryAgain')}</button><button class="secondary" type="button" on:click={() => update({ phase: 'stats' })}>{t('seeStats')}</button><button class="secondary" type="button" on:click={copyLink}>{t('copySeed')}</button><button class="secondary" type="button" on:click={shareRun}>{t('shareRun')}</button><button class="ghost" type="button" on:click={() => resetRun(true)}>{t('newSeed')}</button></div>
      </section>
    {/if}
  {:else if $game.phase === 'stats'}
    <section class="screen shell stats-screen">
      <header class="screen-header"><span class="eyebrow">POST-MAJOR ANALYTICS</span><h1>{t('stats')}</h1><p>{t('statsSeed')} {$game.seed}.</p></header>
      <div class="stats-grid">
        {#each $game.stats as stat}
          {@const player = playerById.get(stat.playerId)}
          {#if player}
            <article class="stat-card {rarityClass(player)}">
              {#if runMvp?.playerId === player.id}<span class="mvp-badge">{t('runMvp')}</span>{/if}
              <div class="stat-player"><div class="avatar large">{(player.nickname ?? '?').slice(0, 2).toUpperCase()}</div><div><span class="eyebrow">{player.role ?? 'rifler'} · {player.year ?? ''}</span><h2>{player.nickname ?? 'Unknown'}</h2><p>{playerTitle(player)}</p></div><strong>{player.overall ?? 70}</strong></div>
              <div class="rating"><small>RUN RATING</small><b>{stat.runRating.toFixed(2)}</b></div>
              <div class="stat-numbers"><span><small>K / D</small><b>{stat.kills} / {stat.deaths}</b></span><span><small>ADR</small><b>{stat.adr}</b></span><span><small>IMPACT</small><b>{stat.impact.toFixed(2)}</b></span><span><small>CLUTCHES</small><b>{stat.clutches}</b></span><span><small>OPENINGS</small><b>{stat.openingKills}</b></span><span><small>MVP</small><b>{stat.mvpCount}</b></span></div>
              <footer>{stat.mapsWon}/{stat.mapsPlayed} mapas · {stat.roundsWon} rounds vencidos</footer>
            </article>
          {/if}
        {/each}
      </div>
      <button class="secondary wide" type="button" on:click={() => update({ phase: 'result' })}>{t('backResult')}</button>
    </section>
  {/if}
</main>

{#if detailsPlayer}
  {@const detailsValidation = cardValidation(detailsPlayer)}
  {@const eligibleRoles = getEligibleSlotRoles(detailsPlayer)}
  <div class="sheet-backdrop" role="presentation" on:click={closePlayer} on:keydown={(event) => event.key === 'Escape' && closePlayer()}>
    <div class="player-sheet {rarityClass(detailsPlayer)}" role="dialog" aria-modal="true" aria-label={`Detalhes de ${detailsPlayer.nickname}`} tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
      <button class="sheet-close" type="button" on:click={closePlayer}>×</button>
      <div class="sheet-player"><div class="avatar huge">{(detailsPlayer.nickname ?? '?').slice(0, 2).toUpperCase()}</div><div><span class="eyebrow">{detailsPlayer.rarity ?? 'common'} · {detailsPlayer.teamId ?? ''}</span><h2>{detailsPlayer.nickname ?? 'Unknown'}</h2><p>{playerTitle(detailsPlayer)} · {detailsPlayer.role ?? 'rifler'}</p></div>{#if $game.mode === 'premier' || draftComplete}<strong>{detailsPlayer.overall ?? 70}</strong>{:else}<strong>??</strong>{/if}</div>
      {#if $game.mode === 'premier' || draftComplete}
        <div class="attribute-grid">{#each ['firepower', 'clutch', 'entry', 'awp', 'support', 'igl', 'experience', 'consistency', 'mental'] as attribute}<div><span>{attribute}</span><b>{detailsPlayer[attribute as keyof Player] ?? 70}</b><i><em style={`width:${Number(detailsPlayer[attribute as keyof Player] ?? 70)}%`}></em></i></div>{/each}</div>
        {#if detailsPlayer.traits?.length}<div class="trait-list">{#each detailsPlayer.traits.slice(0, 4) as trait}<span>{trait}</span>{/each}{#if detailsPlayer.traits.length > 4}<span>+{detailsPlayer.traits.length - 4}</span>{/if}</div>{/if}
      {:else}
        <div class="blind-intel"><span class="eyebrow">{t('hiddenStats')}</span>{#each vagueTraits(detailsPlayer) as trait}<strong>{trait}</strong>{/each}</div>
      {/if}
      {#if !draftComplete}
        <div class="role-picker">
          <span class="eyebrow">{t('howUsePlayer')}</span>
          <h3>{detailsPlayer.nickname} · {t('assignedRole')}</h3>
          {#if !detailsValidation.ok}<p class="pick-blocked-reason">{reasonText(detailsValidation.reason)}</p>{/if}
          <div>
            {#each eligibleRoles as role}
              {@const roleValidation = validatePlayerPick(detailsPlayer, selectedLineup, role, lookupPlayer)}
              <button class="secondary role-option" type="button" disabled={!roleValidation.ok} on:click={() => confirmPlayerPick(detailsPlayer!, role)}>
                <span>{eligibleRoles.length === 1 ? t('addAs') : t('useAs')} {getRoleLabel(role)}</span>
                {#if !roleValidation.ok}<small>{reasonText(roleValidation.reason)}</small>{/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if toast}<div class="toast">{toast}</div>{/if}
