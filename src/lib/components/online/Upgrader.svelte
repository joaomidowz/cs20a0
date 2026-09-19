<script lang="ts">
  import { AccountError } from '$lib/game/online/account';
  import { cardCoinValue, cardLabel } from '$lib/game/online/card-value';
  import { collectionCoachById, collectionCoaches, collectionPlayerById, collectionPlayers } from '$lib/game/online/collection-pool';
  import { RARITIES, UPGRADER_MAX_STAKE, rarityOf, upgradeChance, type Rarity } from '$lib/game/online/collection-rules';
  import { upgradeCards, type UpgradeOutcome } from '$lib/game/online/collection';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import { confirmDialog } from '$lib/game/ui/dialog';
  import type { Coach, Language, Player } from '$lib/game/types';
  import CollectionCard from './CollectionCard.svelte';
  import CoachCard from './CoachCard.svelte';

  export let serverUrl: string;
  export let language: Language = 'pt-BR';
  /** Cards in the collection. */
  export let ownedIds: string[] = [];
  /** Cards on the saved team: they cannot be staked. */
  export let lockedIds: string[] = [];
  export let onDone: () => void = () => {};
  /** Team names, the same the collection grid shows. */
  export let playerTeam: (player: Player) => string = () => '';
  export let coachTeam: (coach: Coach) => string = () => '';
  /** Opens the big card (the page's CollectionCardSheet). */
  export let onOpen: (player: Player) => void = () => {};

  type Card = { id: string; value: number; rarity: Rarity; player: Player | null; coach: Coach | null };
  const cardOf = (id: string): Card | null => {
    const coach = collectionCoachById.get(id) ?? null;
    const player = coach ? null : collectionPlayerById.get(id) ?? null;
    if (!coach && !player) return null;
    return { id, value: cardCoinValue(id), rarity: rarityOf((coach ?? player)!), player, coach };
  };
  const ALL: Card[] = [...collectionPlayers.map((player) => player.id), ...collectionCoaches.map((coach) => coach.id)].map(cardOf).filter((card): card is Card => Boolean(card)).sort((a, b) => a.value - b.value);
  const TARGETS_SHOWN = 30;
  // Wheel geometry: the chance arc starts at the top and runs clockwise.
  const SIZE = 220;
  const RADIUS = 92;
  const CENTER = SIZE / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  let stake: string[] = [];
  let target = '';
  let query = '';
  let targetRarity: Rarity | '' = '';
  let busy = false;
  let error = '';
  let outcome: UpgradeOutcome | null = null;

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: locked = new Set(lockedIds);
  $: ownedSet = new Set(ownedIds);
  $: stakeable = ownedIds.filter((id) => !locked.has(id)).map(cardOf).filter((card): card is Card => Boolean(card)).sort((a, b) => b.value - a.value);
  $: stakeCards = stake.map(cardOf).filter((card): card is Card => Boolean(card));
  $: stakeValue = stakeCards.reduce((sum, card) => sum + card.value, 0);
  $: targetCard = target ? cardOf(target) : null;
  $: targetValue = targetCard?.value ?? 0;
  $: chance = target && stakeValue && targetValue > stakeValue ? upgradeChance(stakeValue, targetValue) : 0;
  $: needle = query.trim().toLowerCase();
  $: targets = stakeValue
    ? ALL.filter((card) => card.value > stakeValue && !ownedSet.has(card.id) && (!targetRarity || card.rarity === targetRarity) && (!needle || cardLabel(card.id).toLowerCase().includes(needle))).slice(0, TARGETS_SHOWN)
    : [];
  $: if (target && (ownedSet.has(target) || cardCoinValue(target) <= stakeValue)) target = '';
  // After a result the pointer rests where the roll landed; before, at the top.
  $: pointerAngle = outcome ? outcome.roll * 360 : 0;
  $: shownChance = outcome ? outcome.chance : chance;
  $: resultCard = outcome ? cardOf(outcome.won ? outcome.target : outcome.returned ?? '') : null;

  const fmt = (value: number) => value.toLocaleString(language);
  const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
  const toggleStake = (id: string) => {
    outcome = null;
    stake = stake.includes(id) ? stake.filter((item) => item !== id) : stake.length < UPGRADER_MAX_STAKE ? [...stake, id] : stake;
  };
  const aim = (id: string) => { outcome = null; target = target === id ? '' : id; };

  async function go() {
    if (busy || !target || !stake.length) return;
    const confirmed = await confirmDialog({ title: t('upgraderGo'), body: t('upgraderConfirm'), confirmLabel: t('upgraderGo'), cancelLabel: t('cancel'), tone: 'danger' });
    if (!confirmed) return;
    busy = true; error = '';
    try {
      outcome = await upgradeCards(serverUrl, stake, target);
      stake = []; target = '';
      onDone();
    } catch (caught) {
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    } finally { busy = false; }
  }
</script>

<section class="panel upgrader" aria-label={t('upgrader')}>
  <div class="section-heading">
    <div><span class="eyebrow">{t('upgrader').toUpperCase()}</span><h2>{t('upgrader')}</h2></div>
    <strong class="count">{stake.length}/{UPGRADER_MAX_STAKE} · {fmt(stakeValue)} <small>coins</small></strong>
  </div>
  <p class="note">{t('upgraderHint')}</p>
  {#if error}<p class="upgrader-error" role="alert">{error}</p>{/if}

  <div class="stage">
    <div class="stage-side">
      <span class="label">{t('upgraderStake')}</span>
      {#if stakeCards.length}
        <div class="mini-grid">
          {#each stakeCards as card (card.id)}
            <div class="pick picked">
              {#if card.coach}
                <CoachCard coach={card.coach} teamName={coachTeam(card.coach)}><button class="ghost small" type="button" on:click={() => toggleStake(card.id)}>{t('upgraderUnpick')}</button></CoachCard>
              {:else if card.player}
                <CollectionCard player={card.player} teamName={playerTeam(card.player)} {language} compact {onOpen}><button class="ghost small" type="button" on:click={() => toggleStake(card.id)}>{t('upgraderUnpick')}</button></CollectionCard>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <span class="empty">{t('upgraderEmpty')}</span>
      {/if}
    </div>

    <div class="wheel">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={`${pct(shownChance)} ${t('chance')}`}>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} class="track" />
        <circle cx={CENTER} cy={CENTER} r={RADIUS} class="arc" stroke-dasharray={`${shownChance * CIRCUMFERENCE} ${CIRCUMFERENCE}`} transform={`rotate(-90 ${CENTER} ${CENTER})`} />
        <circle cx={CENTER} cy={CENTER} r={RADIUS - 18} class="inner" />
        <g transform={`rotate(${pointerAngle} ${CENTER} ${CENTER})`}>
          <path class="pointer" class:won={outcome?.won} class:lost={outcome && !outcome.won} d={`M ${CENTER} ${CENTER - RADIUS - 14} l -8 -12 h 16 z`} />
        </g>
        <text x={CENTER} y={CENTER - 2} class="pct">{pct(shownChance)}</text>
        <text x={CENTER} y={CENTER + 20} class="lbl">{t('chance')}</text>
      </svg>
      {#if outcome}
        <p class="result" class:won={outcome.won} role="status">{outcome.won ? t('upgraderWon') : t('upgraderLost')} {#if resultCard}<b>{cardLabel(resultCard.id)}</b>{/if}</p>
      {/if}
      <button type="button" class="primary go" disabled={busy || !target || !stake.length} on:click={go}>{t('upgraderGo')}</button>
    </div>

    <div class="stage-side">
      <span class="label">{t('upgraderTarget')}{#if targetCard} · {fmt(targetValue)} coins{/if}</span>
      {#if targetCard}
        <div class="pick aimed target-card">
          {#if targetCard.coach}
            <CoachCard coach={targetCard.coach} teamName={coachTeam(targetCard.coach)} active><button class="ghost small" type="button" on:click={() => aim(targetCard.id)}>{t('upgraderUnpick')}</button></CoachCard>
          {:else if targetCard.player}
            <CollectionCard player={targetCard.player} teamName={playerTeam(targetCard.player)} {language} compact {onOpen}><button class="ghost small" type="button" on:click={() => aim(targetCard.id)}>{t('upgraderUnpick')}</button></CollectionCard>
          {/if}
        </div>
      {:else}
        <span class="empty">{t('upgraderNoTargets')}</span>
      {/if}
    </div>
  </div>

  <div class="pickers">
    <div class="picker">
      <h3 class="subhead">{t('upgraderStake').toUpperCase()} <small>{stakeable.length}</small></h3>
      {#if !stakeable.length}<p class="note">{t('upgraderEmpty')}</p>{/if}
      <div class="mini-grid scroll">
        {#each stakeable as card (card.id)}
          {@const picked = stake.includes(card.id)}
          <div class="pick" class:picked>
            {#if card.coach}
              <CoachCard coach={card.coach} teamName={coachTeam(card.coach)} active={picked}>
                <button class={picked ? 'secondary small' : 'ghost small'} type="button" disabled={!picked && stake.length >= UPGRADER_MAX_STAKE} on:click={() => toggleStake(card.id)}>{picked ? t('upgraderUnpick') : t('upgraderPick')} · {fmt(card.value)}</button>
              </CoachCard>
            {:else if card.player}
              <CollectionCard player={card.player} teamName={playerTeam(card.player)} {language} compact {onOpen}>
                <button class={picked ? 'secondary small' : 'ghost small'} type="button" disabled={!picked && stake.length >= UPGRADER_MAX_STAKE} on:click={() => toggleStake(card.id)}>{picked ? t('upgraderUnpick') : t('upgraderPick')} · {fmt(card.value)}</button>
              </CollectionCard>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="picker">
      <h3 class="subhead">{t('upgraderTarget').toUpperCase()} <small>{targets.length}</small></h3>
      <div class="filters">
        <div class="segmented-control rarity-filter">
          <button type="button" class:active={!targetRarity} on:click={() => targetRarity = ''}>{t('all')}</button>
          {#each RARITIES as rarity}<button type="button" class:active={targetRarity === rarity} on:click={() => targetRarity = rarity}>{rarity}</button>{/each}
        </div>
        <input type="search" placeholder={t('upgraderSearch')} bind:value={query} disabled={!stakeValue} />
      </div>
      {#if !stakeValue}<p class="note">{t('upgraderNoTargets')}</p>{/if}
      <div class="mini-grid scroll">
        {#each targets as card (card.id)}
          {@const aimed = target === card.id}
          <div class="pick" class:aimed>
            {#if card.coach}
              <CoachCard coach={card.coach} teamName={coachTeam(card.coach)} active={aimed}>
                <button class={aimed ? 'secondary small' : 'ghost small'} type="button" on:click={() => aim(card.id)}>{aimed ? t('upgraderAimed') : t('upgraderAim')} · {pct(upgradeChance(stakeValue, card.value))}</button>
              </CoachCard>
            {:else if card.player}
              <CollectionCard player={card.player} teamName={playerTeam(card.player)} {language} compact {onOpen}>
                <button class={aimed ? 'secondary small' : 'ghost small'} type="button" on:click={() => aim(card.id)}>{aimed ? t('upgraderAimed') : t('upgraderAim')} · {pct(upgradeChance(stakeValue, card.value))}</button>
              </CollectionCard>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>

<style>
  .upgrader { display: grid; gap: 16px; padding: 22px; align-content: start; }
  .count { color: var(--accent); font: 900 1.3rem/1 'Arial Narrow', Impact, sans-serif; white-space: nowrap; }
  .count small { color: var(--muted); font: 700 .6rem Inter, Arial, sans-serif; }
  .note { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }
  .upgrader-error { margin: 0; padding: 10px 12px; border: 1px solid var(--danger); color: #ff9b90; font-size: .78rem; }
  .label { color: var(--muted); font-size: .58rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .subhead { margin: 0; color: var(--muted); font-size: .7rem; letter-spacing: .14em; } .subhead small { color: var(--accent); }
  .stage { display: grid; grid-template-columns: minmax(0, 1fr) 260px minmax(0, 1fr); gap: 18px; align-items: start; padding: 18px; border: 1px solid var(--line); background: var(--surface-2); }
  .stage-side { display: grid; gap: 10px; align-content: start; min-width: 0; }
  .stage-side:last-child { justify-items: stretch; }
  .target-card { max-width: 220px; }
  .empty { display: grid; place-items: center; min-height: 200px; padding: 12px; border: 1px dashed var(--line); color: var(--muted); font-size: .76rem; text-align: center; }
  .mini-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
  .mini-grid.scroll { max-height: 560px; overflow-y: auto; padding: 4px 4px 4px 0; }
  .pick { min-width: 0; outline: 2px solid transparent; outline-offset: 2px; transition: outline-color .18s ease; }
  .pick.picked, .pick.aimed { outline-color: var(--accent); }
  .pick :global(.small) { min-height: 36px; padding: 0 8px; border-radius: 0; font-size: .6rem; }
  .wheel { display: grid; gap: 12px; justify-items: center; align-content: start; padding: 14px; border: 1px solid var(--line); background: var(--surface); }
  .wheel svg { max-width: 100%; height: auto; }
  .track { fill: none; stroke: var(--line); stroke-width: 14; }
  .arc { fill: none; stroke: var(--accent); stroke-width: 14; stroke-linecap: butt; transition: stroke-dasharray .3s ease-out; }
  .inner { fill: var(--surface-2); }
  .pointer { fill: var(--text); }
  .pointer.won { fill: var(--accent); }
  .pointer.lost { fill: var(--danger); }
  .pct { fill: var(--text); font: 900 28px 'Arial Narrow', Impact, sans-serif; text-anchor: middle; font-variant-numeric: tabular-nums; }
  .lbl { fill: var(--muted); font-size: 11px; font-weight: 800; text-anchor: middle; text-transform: uppercase; letter-spacing: .1em; }
  .result { margin: 0; padding: 8px 10px; border-left: 3px solid var(--danger); background: var(--surface-2); color: #ff9b90; font-size: .76rem; text-align: left; width: 100%; box-sizing: border-box; }
  .result.won { border-left-color: var(--accent); color: var(--accent); }
  .go { width: 100%; border-radius: 0; }
  .pickers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  .picker { display: grid; gap: 12px; align-content: start; min-width: 0; padding: 16px; border: 1px solid var(--line); background: var(--surface-2); }
  .filters { display: grid; gap: 8px; }
  .rarity-filter { grid-auto-columns: auto; overflow-x: auto; }
  .rarity-filter button { border-radius: 0; min-height: 34px; padding: 4px 8px; font-size: .58rem; }
  .filters input { min-height: 42px; padding: 0 10px; border: 1px solid var(--line); border-radius: 0; background: var(--surface); color: var(--text); font: inherit; }
  @media (max-width: 980px) {
    .stage { grid-template-columns: 1fr; }
    .wheel { order: -1; }
    .pickers { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) { .arc, .pick { transition: none; } }
</style>
