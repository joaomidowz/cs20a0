<script lang="ts">
  import { formatUsd } from '$lib/game/dynasty/prizes';
  import { resolveDynastyPlayer } from '$lib/game/dynasty/resolve';
  import { coachMarketValue } from '$lib/game/dynasty/value';
  import {
    buyPriceFor, canConfirmWindow, checkMove, chooseCoach, lineupProblems, makeMove, movesLeft, salePriceFor, setRole,
    undoMove, windowCash, windowLineup, type IncomingPlayer, type MoveProblem
  } from '$lib/game/dynasty/window';
  import { translate } from '$lib/game/i18n';
  import { getEligibleSlotRoles, getPlayerBaseId, getRoleLabel } from '$lib/game/roleRules';
  import type { Coach, Language, LineupSlotRole, Player, WindowState } from '$lib/game/types';

  export let state: WindowState;
  export let language: Language = 'pt-BR';
  export let playerById: Map<string, Player>;
  export let coachById: Map<string, Coach>;
  export let currentCoach: Coach | null = null;
  export let catalog: Player[] = [];
  export let teamLabel: (teamId: string) => string = (teamId) => teamId;
  export let onChange: (next: WindowState) => void = () => {};
  export let onConfirm: () => void = () => {};

  let selectedOut: string | null = null;
  let query = '';
  let error = '';

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  $: lineup = windowLineup(state);
  $: cash = windowCash(state);
  $: left = movesLeft(state);
  $: problems = lineupProblems(state, playerById);
  $: ready = canConfirmWindow(state, playerById);
  $: soldIds = new Set(state.moves.map((move) => move.outPlayerId));
  $: boughtIds = new Set(state.moves.map((move) => move.inPlayerId));
  $: targetUsed = state.moves.some((move) => move.kind === 'target');
  $: lineupBaseIds = new Set(lineup.flatMap((selected) => { const player = playerById.get(selected.playerId); return player ? [getPlayerBaseId(player)] : []; }));
  $: searchResults = query.trim().length >= 2
    ? catalog.filter((player) => (player.nickname ?? '').toLowerCase().includes(query.trim().toLowerCase()) && !lineupBaseIds.has(getPlayerBaseId(player))).slice(0, 12)
    : [];

  const view = (playerId: string) => {
    const player = playerById.get(playerId);
    return player ? resolveDynastyPlayer(player, state.overrides[playerId]) : null;
  };
  const nick = (playerId: string) => playerById.get(playerId)?.nickname ?? playerId;
  const problemMessage = (problem: MoveProblem) => (problem === 'no-cash' ? t('windowNoCash') : problem === 'no-moves' ? t('windowNoMoves') : t('windowInvalidMove'));

  function buy(incoming: IncomingPlayer) {
    error = '';
    if (!selectedOut) { error = t('windowPickSale'); return; }
    const problem = checkMove(state, selectedOut, incoming, playerById);
    if (problem) { error = problemMessage(problem); return; }
    onChange(makeMove(state, selectedOut, incoming, playerById));
    selectedOut = null;
  }

  function pickRole(playerId: string, event: Event) {
    onChange(setRole(state, playerId, (event.currentTarget as HTMLSelectElement).value as LineupSlotRole));
  }

  function pickCoach(coachId: string | null) {
    error = '';
    onChange(chooseCoach(state, coachId, coachById));
  }
</script>

<div class="window">
  <section class="panel window-evolution">
    <span class="eyebrow">{t('windowEvolution')}</span>
    <ul>
      {#each state.evolution as entry (entry.fromPlayerId)}
        <li class={entry.kind}>
          <b>{nick(entry.fromPlayerId)}</b>
          {#if entry.kind === 'version'}<span>{t('windowVersion')} · {playerById.get(entry.toPlayerId)?.year ?? ''}</span>{:else}<span>{entry.kind === 'drift' ? t('windowDrift') : t('windowStable')}</span>{/if}
          <em>{entry.overallBefore} → {entry.overallAfter}</em>
          {#if entry.training}<small class="training-gain">+{entry.training.delta} {entry.training.attribute}</small>{/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="panel window-status" role="status">
    <span>{t('windowCash')} <b class:negative={cash < 0}>{formatUsd(cash, language)}</b></span>
    <span>{t('windowMovesLeft')} <b>{left}</b></span>
  </section>

  <section class="panel window-lineup">
    <span class="eyebrow">{t('windowLineup')}</span>
    {#each lineup as selected (selected.playerId)}
      {@const player = view(selected.playerId)}
      {#if player}
        <div class="window-row" class:selling={selectedOut === selected.playerId} class:problem={problems.includes(`${selected.playerId}:ineligible`)}>
          <strong>{player.nickname}</strong>
          <span class="overall">{player.overall ?? 70}</span>
          <select value={selected.selectedSlotRole} aria-label={getRoleLabel(selected.selectedSlotRole)} on:change={(event) => pickRole(selected.playerId, event)}>
            {#each getEligibleSlotRoles(player) as role}<option value={role}>{getRoleLabel(role)}</option>{/each}
            {#if !getEligibleSlotRoles(player).includes(selected.selectedSlotRole)}<option value={selected.selectedSlotRole}>{getRoleLabel(selected.selectedSlotRole)} ⚠</option>{/if}
          </select>
          {#if !boughtIds.has(selected.playerId) && !soldIds.has(selected.playerId)}
            <button class="secondary" type="button" disabled={left <= 0} on:click={() => { selectedOut = selectedOut === selected.playerId ? null : selected.playerId; error = ''; }}>
              {selectedOut === selected.playerId ? t('windowSelling') : t('windowSell')} · {formatUsd(salePriceFor(state, selected.playerId, playerById), language)}
            </button>
          {/if}
        </div>
      {/if}
    {/each}
    {#if problems.length}<p class="window-warning">{t('windowFixRoles')}</p>{/if}
  </section>

  {#if state.proposals.length}
    <section class="panel">
      <span class="eyebrow">{t('windowProposals')}</span>
      <ul class="window-list">{#each state.proposals as proposal (proposal.playerId)}<li><b>{nick(proposal.playerId)}</b><em>{formatUsd(proposal.price, language)}</em></li>{/each}</ul>
    </section>
  {/if}

  <section class="panel">
    <span class="eyebrow">{t('windowMarket')}</span>
    {#if error}<p class="window-warning" role="alert">{error}</p>{/if}
    <div class="window-market">
      {#each state.offers as offer (offer.playerId)}
        {@const player = playerById.get(offer.playerId)}
        {#if player}
          <article class:focus={offer.focusRole !== null}>
            <strong>{player.nickname}</strong>
            <small>{teamLabel(player.teamId ?? '')} · {getEligibleSlotRoles(player).map(getRoleLabel).join('/')}</small>
            {#if offer.focusRole}<small class="focus-tag">{t('windowFocus')}</small>{/if}
            <span class="overall">{player.overall ?? 70}</span>
            <button class="primary" type="button" disabled={boughtIds.has(offer.playerId) || left <= 0} on:click={() => buy({ kind: 'offer', playerId: offer.playerId })}>{t('windowBuy')} · {formatUsd(offer.price, language)}</button>
          </article>
        {/if}
      {/each}
    </div>
  </section>

  <section class="panel">
    <span class="eyebrow">{t('windowTarget')}</span>
    <input type="search" bind:value={query} placeholder={t('windowSearch')} disabled={targetUsed} />
    {#if !targetUsed}
      <ul class="window-list">
        {#each searchResults as player (player.id)}
          <li><b>{player.nickname} {player.year ?? ''}</b><span class="overall">{player.overall ?? 70}</span><button class="secondary" type="button" disabled={left <= 0} on:click={() => buy({ kind: 'target', playerId: player.id })}>{t('windowBuy')} · {formatUsd(buyPriceFor(state, { kind: 'target', playerId: player.id }, playerById) ?? 0, language)}</button></li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if state.moves.length}
    <section class="panel">
      <span class="eyebrow">{t('windowMoves')}</span>
      <ul class="window-list">
        {#each state.moves as move, index (move.outPlayerId)}
          <li><b>{nick(move.outPlayerId)} → {nick(move.inPlayerId)}</b><em>+{formatUsd(move.salePrice, language)} / −{formatUsd(move.buyPrice, language)}</em><button class="ghost" type="button" on:click={() => onChange(undoMove(state, index))}>{t('windowUndo')}</button></li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="panel">
    <span class="eyebrow">{t('windowCoachOffers')}</span>
    <div class="window-market">
      <article class:focus={state.coachChange === null}>
        <strong>{currentCoach?.name ?? '—'}</strong>
        <small>{currentCoach ? teamLabel(currentCoach.teamId) : ''}</small>
        <span class="overall">{currentCoach?.overall ?? '—'}</span>
        <button class="secondary" type="button" disabled={state.coachChange === null} on:click={() => pickCoach(null)}>{t('windowCoachKeep')}</button>
      </article>
      {#each state.coachOfferIds as coachId (coachId)}
        {@const coach = coachById.get(coachId)}
        {#if coach}
          <article class:focus={state.coachChange?.coachId === coachId}>
            <strong>{coach.name}</strong>
            <small>{teamLabel(coach.teamId)}</small>
            <span class="overall">{coach.overall}</span>
            <button class="primary" type="button" disabled={state.coachChange?.coachId === coachId} on:click={() => pickCoach(coachId)}>{t('windowHire')} · {formatUsd(coachMarketValue(coach), language)}</button>
          </article>
        {/if}
      {/each}
    </div>
  </section>

  <button class="primary wide" type="button" disabled={!ready} on:click={onConfirm}>{t('windowConfirm')} →</button>
</div>

<style>
  .window { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .window section { display: grid; gap: 10px; padding: 16px; min-width: 0; }
  .window input[type='search'] { width: 100%; box-sizing: border-box; }
  .window ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .window-evolution li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; font-size: .82rem; }
  .window-evolution li.version em, .window-evolution li.drift em { color: var(--accent); }
  .training-gain { color: var(--accent); font-weight: 900; text-transform: uppercase; }
  .window-status { display: flex; flex-wrap: wrap; gap: 10px 22px; font-size: .85rem; }
  .window-status b { color: var(--accent); }
  .window-status b.negative { color: var(--danger); }
  .window-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); }
  .window-row.selling { outline: 1px solid var(--accent); }
  .window-row.problem select { border-color: var(--danger); }
  .window-market { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .window-market article { display: grid; gap: 6px; padding: 12px; border: 1px solid var(--line); background: var(--surface-2); }
  .window-market article.focus { border-color: var(--accent); }
  .window-market small { color: var(--muted); overflow-wrap: anywhere; }
  .focus-tag { color: var(--accent) !important; }
  .window-list { overflow-x: auto; }
  .window-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; }
  .overall { font-weight: 900; color: var(--accent); }
  .window-warning { margin: 0; color: var(--accent-2); font-size: .78rem; }
  @media (max-width: 560px) { .window-row { grid-template-columns: minmax(0, 1fr) auto; } }
</style>
