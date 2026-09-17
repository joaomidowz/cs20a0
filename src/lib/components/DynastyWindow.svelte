<script lang="ts">
  import DynastyCardSheet from './DynastyCardSheet.svelte';
  import DynastyCoachCard from './DynastyCoachCard.svelte';
  import DynastyPlayerCard from './DynastyPlayerCard.svelte';
  import DynastyRoleChips from './DynastyRoleChips.svelte';
  import { coachMajorHistory, playerMajorHistory } from '$lib/game/dynasty/cards';
  import { formatUsd } from '$lib/game/dynasty/prizes';
  import { OFF_ROLE_PENALTY, positionMultiplier } from '$lib/game/dynasty/position';
  import { resolveDynastyPlayer } from '$lib/game/dynasty/resolve';
  import { coachMarketValue } from '$lib/game/dynasty/value';
  import {
    assignRole, buyPriceFor, canConfirmWindow, checkMove, chooseCoach, lineupProblems, makeMove, movesLeft, salePriceFor,
    undoMove, windowCash, windowLineup, windowOffRolePlayerIds, type IncomingPlayer, type MoveProblem
  } from '$lib/game/dynasty/window';
  import { translate, translatePlacement } from '$lib/game/i18n';
  import { getEligibleSlotRoles, getPlayerBaseId, getRoleLabel } from '$lib/game/roleRules';
  import type { Coach, DynastyMajorSummary, Language, Player, WindowState } from '$lib/game/types';

  export let state: WindowState;
  export let language: Language = 'pt-BR';
  export let playerById: Map<string, Player>;
  export let coachById: Map<string, Coach>;
  export let currentCoach: Coach | null = null;
  export let catalog: Player[] = [];
  export let history: DynastyMajorSummary[] = [];
  export let teamLabel: (teamId: string) => string = (teamId) => teamId;
  export let onChange: (next: WindowState) => void = () => {};
  export let onConfirm: () => void = () => {};

  const copy = {
    'pt-BR': { swaps: 'Trocas diretas', gives: 'Você entrega', gets: 'Você recebe', pay: 'Você paga', receive: 'Você recebe', even: 'Sem diferença', accept: 'Aceitar troca', offRole: 'fora de posição', strength: 'força', empty: 'Sem Majors registrados ainda', major: 'Major', placement: 'Colocação', rating: 'Rating', overall: 'OVR', training: 'Treino', evolution: 'Evolução', ready: 'Pronto para confirmar', notReady: 'Ajuste caixa ou posições', from: 'de', short: 'falta', pickFirst: 'Escolha quem sai', noMoves: 'Sem trocas', negativeHint: 'Caixa negativo: desfaça uma troca ou venda alguém antes de confirmar.', aim: 'Mira', utility: 'Utilitária', clutch: 'Clutch', opening: 'Abertura', recovery: 'Recuperação' },
    es: { swaps: 'Intercambios directos', gives: 'Entregas', gets: 'Recibes', pay: 'Pagas', receive: 'Recibes', even: 'Sin diferencia', accept: 'Aceptar intercambio', offRole: 'fuera de posición', strength: 'fuerza', empty: 'Aún sin Majors registrados', major: 'Major', placement: 'Posición', rating: 'Rating', overall: 'OVR', training: 'Entreno', evolution: 'Evolución', ready: 'Listo para confirmar', notReady: 'Ajusta caja o posiciones', from: 'de', short: 'faltan', pickFirst: 'Elige quién sale', noMoves: 'Sin cambios', negativeHint: 'Caja negativa: deshaz un cambio o vende a alguien antes de confirmar.', aim: 'Puntería', utility: 'Utilidad', clutch: 'Clutch', opening: 'Apertura', recovery: 'Recuperación' },
    en: { swaps: 'Direct swaps', gives: 'You give', gets: 'You get', pay: 'You pay', receive: 'You receive', even: 'Even swap', accept: 'Accept swap', offRole: 'out of position', strength: 'strength', empty: 'No Majors recorded yet', major: 'Major', placement: 'Placement', rating: 'Rating', overall: 'OVR', training: 'Training', evolution: 'Evolution', ready: 'Ready to confirm', notReady: 'Fix cash or positions', from: 'from', short: 'short', pickFirst: 'Pick who leaves', noMoves: 'No moves', negativeHint: 'Negative cash: undo a move or sell someone before confirming.', aim: 'Aim', utility: 'Utility', clutch: 'Clutch', opening: 'Opening', recovery: 'Recovery' }
  } as const;

  let selectedOut: string | null = null;
  let query = '';
  let error = '';
  let sheet: { title: string; subtitle: string; headers: string[]; rows: string[][] } | null = null;
  let dealtFor = -1;
  let fresh = false;

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  $: c = copy[language];
  $: lineup = windowLineup(state);
  $: cash = windowCash(state);
  $: left = movesLeft(state);
  $: problems = lineupProblems(state);
  $: offRole = windowOffRolePlayerIds(state, playerById);
  $: ready = canConfirmWindow(state);
  $: soldIds = new Set(state.moves.map((move) => move.outPlayerId));
  $: boughtIds = new Set(state.moves.map((move) => move.inPlayerId));
  $: targetUsed = state.moves.some((move) => move.kind === 'target');
  $: swapOffers = state.swapOffers ?? [];
  $: lineupBaseIds = new Set(lineup.flatMap((selected) => { const player = playerById.get(selected.playerId); return player ? [getPlayerBaseId(player)] : []; }));
  $: searchResults = query.trim().length >= 2
    ? catalog.filter((player) => (player.nickname ?? '').toLowerCase().includes(query.trim().toLowerCase()) && !lineupBaseIds.has(getPlayerBaseId(player))).slice(0, 12)
    : [];
  // Deal the market cards once per window; reloads of the same window do not replay the animation.
  $: if (state.majorNumber !== dealtFor) { dealtFor = state.majorNumber; fresh = true; setTimeout(() => { fresh = false; }, 1400); }

  const view = (playerId: string) => {
    const player = playerById.get(playerId);
    return player ? resolveDynastyPlayer(player, state.overrides[playerId]) : null;
  };
  const nick = (playerId: string) => playerById.get(playerId)?.nickname ?? playerId;
  const problemMessage = (problem: MoveProblem) => (problem === 'no-cash' ? t('windowNoCash') : problem === 'no-moves' ? t('windowNoMoves') : t('windowInvalidMove'));
  const signedUsd = (value: number) => (value === 0 ? c.even : value > 0 ? `${c.receive} ${formatUsd(value, language)}` : `${c.pay} ${formatUsd(-value, language)}`);
  /** Cash missing for a deal after the selected sale (0 when it fits, or when no outgoing player is picked yet). */
  const shortfall = (outPlayerId: string | null, incoming: IncomingPlayer): number => {
    const buy = buyPriceFor(state, incoming, playerById) ?? 0;
    const sale = incoming.kind === 'swap' ? Math.max(0, swapOffers.find((offer) => offer.id === incoming.offerId)?.cashDelta ?? 0) : outPlayerId ? salePriceFor(state, outPlayerId, playerById) : 0;
    return Math.max(0, buy - sale - cash);
  };
  /** Why a buy button is blocked right now, or null when the deal can go through. */
  const blockedReason = (outPlayerId: string | null, incoming: IncomingPlayer): string | null => {
    if (left <= 0) return c.noMoves;
    if (!outPlayerId && incoming.kind !== 'swap') return c.pickFirst;
    const missing = shortfall(outPlayerId, incoming);
    return missing > 0 ? `${c.short} ${formatUsd(missing, language)}` : null;
  };

  function tryMove(outPlayerId: string | null, incoming: IncomingPlayer) {
    error = '';
    if (!outPlayerId) { error = t('windowPickSale'); return; }
    const problem = checkMove(state, outPlayerId, incoming, playerById);
    if (problem) { error = problemMessage(problem); return; }
    onChange(makeMove(state, outPlayerId, incoming, playerById));
    selectedOut = null;
  }

  function pickCoach(coachId: string | null) {
    error = '';
    onChange(chooseCoach(state, coachId, coachById));
  }

  function openPlayer(playerId: string) {
    const player = playerById.get(playerId);
    if (!player) return;
    const entries = playerMajorHistory(history, player, playerById);
    sheet = {
      title: player.nickname ?? player.id,
      subtitle: teamLabel(player.teamId ?? ''),
      headers: [c.major, c.placement, c.rating, c.overall, c.training, c.evolution],
      rows: entries.map((entry) => [
        `#${entry.majorNumber}`,
        translatePlacement(language, entry.placement),
        entry.rating === null ? '—' : entry.rating.toFixed(2),
        entry.overall === null ? '—' : String(entry.overall),
        entry.training ? c[entry.training] : '—',
        entry.evolution ? `${entry.evolution.overallBefore} → ${entry.evolution.overallAfter}` : '—'
      ])
    };
  }

  function openCoach(coach: Coach) {
    sheet = {
      title: coach.name,
      subtitle: teamLabel(coach.teamId),
      headers: [c.major, c.placement, c.rating],
      rows: coachMajorHistory(history, coach.id).map((entry) => [
        `#${entry.majorNumber}`, translatePlacement(language, entry.placement), entry.averageRating === null ? '—' : entry.averageRating.toFixed(2)
      ])
    };
  }
</script>

<div class="window">
  <section class="status" role="status">
    <span>{t('windowCash')} <b class:negative={cash < 0}>{formatUsd(cash, language)}</b></span>
    <span>{t('windowMovesLeft')} <b>{left}</b></span>
    {#if offRole.length}
      <span class="warn">{offRole.length} {c.offRole} · −{(OFF_ROLE_PENALTY * 100 * offRole.length).toLocaleString(language, { maximumFractionDigits: 1 })}% {c.strength} (×{positionMultiplier(offRole.length).toFixed(3)})</span>
    {/if}
    <span class="readiness" class:ok={ready}>{ready ? c.ready : c.notReady}</span>
    {#if cash < 0}<p class="status-note" role="alert">{c.negativeHint}</p>{/if}
    {#if error}<p class="status-note" role="alert">{error}</p>{/if}
  </section>

  <section class="block">
    <span class="eyebrow">{t('windowEvolution')}</span>
    <ul class="evolution">
      {#each state.evolution as entry (entry.fromPlayerId)}
        <li class={entry.kind}>
          <b>{nick(entry.fromPlayerId)}</b>
          <span>{entry.kind === 'version' ? `${t('windowVersion')} · ${playerById.get(entry.toPlayerId)?.year ?? ''}` : entry.kind === 'drift' ? t('windowDrift') : t('windowStable')}</span>
          <em>{entry.overallBefore} → {entry.overallAfter}</em>
          {#if entry.training}<small>+{entry.training.delta} {entry.training.attribute}</small>{/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="block">
    <span class="eyebrow">{t('windowLineup')}</span>
    <div class="cards lineup">
      {#each lineup as selected (selected.playerId)}
        {@const player = view(selected.playerId)}
        {#if player}
          <DynastyPlayerCard
            {player}
            role={selected.selectedSlotRole}
            offRole={offRole.includes(selected.playerId)}
            evolution={state.evolution.find((entry) => entry.toPlayerId === selected.playerId) ?? null}
            training={state.overrides[selected.playerId]?.training ?? null}
            teamLabel={teamLabel(player.teamId ?? '')}
            {language}
            selected={selectedOut === selected.playerId}
            onOpen={() => openPlayer(selected.playerId)}
          >
            <DynastyRoleChips value={selected.selectedSlotRole} eligible={getEligibleSlotRoles(player)} {language} label={getRoleLabel(selected.selectedSlotRole)} onChange={(role) => onChange(assignRole(state, selected.playerId, role))} />
            {#if !boughtIds.has(selected.playerId) && !soldIds.has(selected.playerId)}
              <button class="sell" type="button" class:active={selectedOut === selected.playerId} disabled={left <= 0} on:click={() => { selectedOut = selectedOut === selected.playerId ? null : selected.playerId; error = ''; }}>
                {selectedOut === selected.playerId ? t('windowSelling') : t('windowSell')} · {formatUsd(salePriceFor(state, selected.playerId, playerById), language)}
              </button>
            {/if}
          </DynastyPlayerCard>
        {/if}
      {/each}
    </div>
    {#if problems.length}<p class="warning">{t('windowFixRoles')}</p>{/if}
    {#if error}<p class="warning" role="alert">{error}</p>{/if}
  </section>

  {#if state.proposals.length || swapOffers.length}
    <section class="block">
      {#if state.proposals.length}
        <span class="eyebrow">{t('windowProposals')}</span>
        <ul class="deals">{#each state.proposals as proposal (proposal.playerId)}<li><b>{nick(proposal.playerId)}</b><em>{formatUsd(proposal.price, language)}</em></li>{/each}</ul>
      {/if}
      {#if swapOffers.length}
        <span class="eyebrow">{c.swaps}</span>
        <div class="swaps">
          {#each swapOffers as offer (offer.id)}
            {@const theirs = playerById.get(offer.theirPlayerId)}
            {@const used = state.moves.some((move) => move.kind === 'swap' && move.inPlayerId === offer.theirPlayerId)}
            {#if theirs}
              {@const reason = used || soldIds.has(offer.forPlayerId) ? null : blockedReason(offer.forPlayerId, { kind: 'swap', playerId: offer.theirPlayerId, offerId: offer.id })}
              <article class="swap" class:used>
                <div><small>{c.gives}</small><b>{nick(offer.forPlayerId)}</b><span>{view(offer.forPlayerId)?.overall ?? '—'}</span></div>
                <div><small>{c.gets} · {c.from} {teamLabel(offer.fromTeamId)}</small><b>{theirs.nickname}</b><span>{theirs.overall ?? '—'}</span></div>
                <p>{signedUsd(offer.cashDelta)}</p>
                <button class="primary" type="button" disabled={used || soldIds.has(offer.forPlayerId) || Boolean(reason)} title={reason ?? undefined} on:click={() => tryMove(offer.forPlayerId, { kind: 'swap', playerId: offer.theirPlayerId, offerId: offer.id })}>{c.accept}</button>
                {#if reason}<small class="blocked">{reason}</small>{/if}
              </article>
            {/if}
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <section class="block">
    <span class="eyebrow">{t('windowMarket')}</span>
    <div class="cards market" class:fresh>
      {#each state.offers as offer, index (offer.playerId)}
        {@const player = playerById.get(offer.playerId)}
        {#if player}
          {@const reason = boughtIds.has(offer.playerId) ? null : blockedReason(selectedOut, { kind: 'offer', playerId: offer.playerId })}
          <div class="deal" style={`--reveal-delay:${index * 60}ms`}>
            <DynastyPlayerCard {player} teamLabel={teamLabel(player.teamId ?? '')} {language} onOpen={null}>
              {#if offer.focusRole}<small class="focus">{t('windowFocus')} · {getRoleLabel(offer.focusRole)}</small>{/if}
              <button class="primary" type="button" disabled={boughtIds.has(offer.playerId) || Boolean(reason)} title={reason ?? undefined} on:click={() => tryMove(selectedOut, { kind: 'offer', playerId: offer.playerId })}>{t('windowBuy')} · {formatUsd(offer.price, language)}</button>
              {#if reason}<small class="blocked">{reason}</small>{/if}
            </DynastyPlayerCard>
          </div>
        {/if}
      {/each}
    </div>
  </section>

  <section class="block">
    <span class="eyebrow">{t('windowTarget')}</span>
    <label class="search">
      <span class="sr-only">{t('windowSearch')}</span>
      <input type="search" bind:value={query} placeholder={t('windowSearch')} disabled={targetUsed} autocomplete="off" />
    </label>
    {#if !targetUsed && searchResults.length}
      <ul class="deals">
        {#each searchResults as player (player.id)}
          {@const reason = blockedReason(selectedOut, { kind: 'target', playerId: player.id })}
          <li><b>{player.nickname} {player.year ?? ''}</b><span class="ovr">{player.overall ?? 70}</span><button class="secondary" type="button" disabled={Boolean(reason)} title={reason ?? undefined} on:click={() => tryMove(selectedOut, { kind: 'target', playerId: player.id })}>{t('windowBuy')} · {formatUsd(buyPriceFor(state, { kind: 'target', playerId: player.id }, playerById) ?? 0, language)}</button>{#if reason}<small class="blocked">{reason}</small>{/if}</li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if state.moves.length}
    <section class="block">
      <span class="eyebrow">{t('windowMoves')}</span>
      <ul class="deals">
        {#each state.moves as move, index (move.outPlayerId)}
          <li><b>{nick(move.outPlayerId)} → {nick(move.inPlayerId)}</b><em>+{formatUsd(move.salePrice, language)} / −{formatUsd(move.buyPrice, language)}</em><button class="ghost" type="button" on:click={() => onChange(undoMove(state, index))}>{t('windowUndo')}</button></li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="block">
    <span class="eyebrow">{t('windowCoachOffers')}</span>
    <div class="cards coaches">
      {#if currentCoach}
        <DynastyCoachCard coach={currentCoach} teamLabel={teamLabel(currentCoach.teamId)} {language} selected={state.coachChange === null} onOpen={() => currentCoach && openCoach(currentCoach)}>
          <button class="secondary" type="button" disabled={state.coachChange === null} on:click={() => pickCoach(null)}>{t('windowCoachKeep')}</button>
        </DynastyCoachCard>
      {/if}
      {#each state.coachOfferIds as coachId (coachId)}
        {@const coach = coachById.get(coachId)}
        {#if coach}
          <DynastyCoachCard {coach} teamLabel={teamLabel(coach.teamId)} {language} selected={state.coachChange?.coachId === coachId} onOpen={() => openCoach(coach)}>
            {@const coachShort = state.coachChange?.coachId === coachId ? 0 : Math.max(0, coachMarketValue(coach) - (cash + (state.coachChange?.cost ?? 0)))}
            <button class="primary" type="button" disabled={state.coachChange?.coachId === coachId || coachShort > 0} title={coachShort > 0 ? `${c.short} ${formatUsd(coachShort, language)}` : undefined} on:click={() => pickCoach(coachId)}>{t('windowHire')} · {formatUsd(coachMarketValue(coach), language)}</button>
            {#if coachShort > 0}<small class="blocked">{c.short} {formatUsd(coachShort, language)}</small>{/if}
          </DynastyCoachCard>
        {/if}
      {/each}
    </div>
  </section>

  <button class="primary confirm" type="button" disabled={!ready} on:click={onConfirm}>{t('windowConfirm')} →</button>
</div>

{#if sheet}
  <DynastyCardSheet title={sheet.title} subtitle={sheet.subtitle} headers={sheet.headers} rows={sheet.rows} emptyLabel={c.empty} {language} onClose={() => (sheet = null)} />
{/if}

<style>
  .window { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .block { display: grid; gap: 12px; min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  .status { position: sticky; top: 8px; z-index: 4; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; padding: 12px 16px; border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); border-radius: 8px; background: color-mix(in srgb, var(--accent) 6%, var(--surface)); font-size: .8rem; }
  .status b { color: var(--accent); font-size: 1rem; }
  .status b.negative { color: var(--danger); }
  .status .warn { color: var(--accent-2); font-weight: 800; }
  .readiness { margin-left: auto; font-size: .66rem; font-weight: 900; text-transform: uppercase; color: var(--accent-2); }
  .readiness.ok { color: var(--accent); }
  .evolution { display: grid; gap: 6px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); margin: 0; padding: 0; list-style: none; }
  .evolution li { display: grid; gap: 2px; padding: 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-2); font-size: .74rem; }
  .evolution li.version em, .evolution li.drift em { color: var(--accent); }
  .evolution small { color: var(--accent); font-weight: 900; text-transform: uppercase; }
  .cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); }
  .sell { min-height: 36px; padding: 0 10px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: 800 .66rem/1 Inter, Arial, sans-serif; text-transform: uppercase; cursor: pointer; }
  .sell.active { border-color: var(--accent); color: var(--accent); }
  .warning { margin: 0; color: var(--accent-2); font-size: .78rem; }
  .status-note { flex-basis: 100%; margin: 0; color: var(--danger); font-size: .74rem; font-weight: 700; }
  .blocked { color: var(--danger); font-size: .62rem; font-weight: 800; text-transform: uppercase; }
  .deals { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .deals li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-2); }
  .deals b { overflow-wrap: anywhere; }
  .swaps { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); }
  .swap { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px; border: 1px solid color-mix(in srgb, var(--accent-2) 45%, var(--line)); border-radius: 6px; background: var(--surface-2); }
  .swap.used { opacity: .55; }
  .swap div { display: grid; gap: 2px; min-width: 0; }
  .swap small { color: var(--muted); font-size: .6rem; text-transform: uppercase; overflow-wrap: anywhere; }
  .swap span { color: var(--accent); font-weight: 900; }
  .swap p, .swap button { grid-column: 1 / -1; margin: 0; }
  .focus { color: var(--accent); font-size: .6rem; font-weight: 900; text-transform: uppercase; }
  .market.fresh .deal { animation: deal-in 520ms cubic-bezier(.16, 1, .3, 1) backwards; animation-delay: var(--reveal-delay, 0ms); }
  @keyframes deal-in { from { transform: perspective(900px) rotateY(80deg) translateY(12px); opacity: 0; } }
  .search input { width: 100%; min-height: 46px; padding: 0 14px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-2); color: var(--text); font: 600 .9rem/1 Inter, Arial, sans-serif; }
  .search input::placeholder { color: var(--muted); }
  .search input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
  .search input:disabled { opacity: .5; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .ovr { color: var(--accent); font-weight: 900; }
  .confirm { width: 100%; }
  @media (max-width: 560px) { .deals li { grid-template-columns: minmax(0, 1fr) auto; } .deals li button { grid-column: 1 / -1; } .readiness { margin-left: 0; } }
  @media (prefers-reduced-motion: reduce) { .market.fresh .deal { animation: none; } }
</style>
