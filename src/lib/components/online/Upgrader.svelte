<script lang="ts">
  import { AccountError } from '$lib/game/online/account';
  import { cardCoinValue, cardLabel } from '$lib/game/online/card-value';
  import { collectionCoaches, collectionPlayers } from '$lib/game/online/collection-pool';
  import { UPGRADER_MAX_STAKE, upgradeChance } from '$lib/game/online/collection-rules';
  import { upgradeCards, type UpgradeOutcome } from '$lib/game/online/collection';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import { confirmDialog } from '$lib/game/ui/dialog';
  import type { Language } from '$lib/game/types';

  export let serverUrl: string;
  export let language: Language = 'pt-BR';
  /** Cards in the collection. */
  export let ownedIds: string[] = [];
  /** Cards on the saved team: they cannot be staked. */
  export let lockedIds: string[] = [];
  export let onDone: () => void = () => {};

  const ALL_IDS = [...collectionPlayers.map((player) => player.id), ...collectionCoaches.map((coach) => coach.id)];
  // Wheel geometry: the chance arc starts at the top and runs clockwise.
  const SIZE = 220;
  const RADIUS = 92;
  const CENTER = SIZE / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  let stake: string[] = [];
  let target = '';
  let query = '';
  let busy = false;
  let error = '';
  let outcome: UpgradeOutcome | null = null;

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: locked = new Set(lockedIds);
  $: ownedSet = new Set(ownedIds);
  $: stakeable = ownedIds.filter((id) => !locked.has(id)).sort((a, b) => cardCoinValue(b) - cardCoinValue(a));
  $: stakeValue = stake.reduce((sum, id) => sum + cardCoinValue(id), 0);
  $: targetValue = target ? cardCoinValue(target) : 0;
  $: chance = target && stakeValue && targetValue > stakeValue ? upgradeChance(stakeValue, targetValue) : 0;
  $: targets = stakeValue
    ? ALL_IDS.filter((id) => !ownedSet.has(id) && cardCoinValue(id) > stakeValue && (!query.trim() || cardLabel(id).toLowerCase().includes(query.trim().toLowerCase())))
        .sort((a, b) => cardCoinValue(a) - cardCoinValue(b)).slice(0, 24)
    : [];
  $: if (target && (ownedSet.has(target) || cardCoinValue(target) <= stakeValue)) target = '';
  // After a result the pointer rests where the roll landed; before, at the top.
  $: pointerAngle = outcome ? outcome.roll * 360 : 0;
  $: shownChance = outcome ? outcome.chance : chance;

  const fmt = (value: number) => value.toLocaleString(language);
  const toggleStake = (id: string) => {
    outcome = null;
    stake = stake.includes(id) ? stake.filter((item) => item !== id) : stake.length < UPGRADER_MAX_STAKE ? [...stake, id] : stake;
  };

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
  <div class="section-heading"><div><span class="eyebrow">{t('upgrader').toUpperCase()}</span><h2>{t('upgrader')}</h2></div></div>
  <p class="upgrader-hint">{t('upgraderHint')}</p>
  {#if error}<p class="upgrader-error" role="alert">{error}</p>{/if}

  <div class="upgrader-grid">
    <div class="upgrader-col">
      <h3>{t('upgraderStake')} <small>{stake.length}/{UPGRADER_MAX_STAKE} · {fmt(stakeValue)} coins</small></h3>
      {#if !stakeable.length}<p class="upgrader-hint">{t('upgraderEmpty')}</p>{/if}
      <ul class="upgrader-list">
        {#each stakeable as id (id)}
          <li><button type="button" class:picked={stake.includes(id)} disabled={!stake.includes(id) && stake.length >= UPGRADER_MAX_STAKE} on:click={() => toggleStake(id)}>
            <span>{cardLabel(id)}</span><small>{fmt(cardCoinValue(id))}</small>
          </button></li>
        {/each}
      </ul>
    </div>

    <div class="upgrader-wheel">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={`${(shownChance * 100).toFixed(2)}% ${t('chance')}`}>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} class="track" />
        <circle cx={CENTER} cy={CENTER} r={RADIUS} class="arc" stroke-dasharray={`${shownChance * CIRCUMFERENCE} ${CIRCUMFERENCE}`} transform={`rotate(-90 ${CENTER} ${CENTER})`} />
        <circle cx={CENTER} cy={CENTER} r={RADIUS - 18} class="inner" />
        <g transform={`rotate(${pointerAngle} ${CENTER} ${CENTER})`}>
          <path class="pointer" class:won={outcome?.won} class:lost={outcome && !outcome.won} d={`M ${CENTER} ${CENTER - RADIUS - 14} l -8 -12 h 16 z`} />
        </g>
        <text x={CENTER} y={CENTER - 2} class="pct">{(shownChance * 100).toFixed(2)}%</text>
        <text x={CENTER} y={CENTER + 20} class="lbl">{t('chance')}</text>
      </svg>
      {#if outcome}
        <p class="upgrader-result" class:won={outcome.won} role="status">
          {#if outcome.won}{t('upgraderWon')} <b>{cardLabel(outcome.target)}</b>{:else}{t('upgraderLost')} <b>{cardLabel(outcome.returned ?? '')}</b>{/if}
        </p>
      {/if}
      <button type="button" class="primary" disabled={busy || !target || !stake.length} on:click={go}>{t('upgraderGo')}</button>
    </div>

    <div class="upgrader-col">
      <h3>{t('upgraderTarget')} {#if target}<small>{fmt(targetValue)} coins</small>{/if}</h3>
      <input type="search" placeholder={t('upgraderSearch')} bind:value={query} disabled={!stakeValue} />
      <ul class="upgrader-list">
        {#each targets as id (id)}
          <li><button type="button" class:picked={target === id} on:click={() => { outcome = null; target = id; }}>
            <span>{cardLabel(id)}</span><small>{(upgradeChance(stakeValue, cardCoinValue(id)) * 100).toFixed(2)}%</small>
          </button></li>
        {/each}
      </ul>
    </div>
  </div>
</section>

<style>
  .upgrader { display: grid; gap: 0.75rem; }
  .upgrader-hint { margin: 0; font-size: 0.85rem; opacity: 0.8; }
  .upgrader-error { margin: 0; color: #ff6b6b; }
  .upgrader-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; align-items: start; }
  .upgrader-col { display: grid; gap: 0.5rem; min-width: 0; }
  .upgrader-col h3 { margin: 0; font-size: 1rem; }
  .upgrader-col h3 small { opacity: 0.7; font-weight: normal; }
  .upgrader-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; max-height: 320px; overflow-y: auto; }
  .upgrader-list button { width: 100%; display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.4rem 0.6rem; border-radius: 8px; border: 1px solid var(--line, #333); background: transparent; color: inherit; cursor: pointer; text-align: left; }
  .upgrader-list button.picked { border-color: #ff7a1a; background: rgba(255, 122, 26, 0.12); }
  .upgrader-list button:disabled { opacity: 0.4; cursor: not-allowed; }
  .upgrader-list small { font-variant-numeric: tabular-nums; opacity: 0.75; white-space: nowrap; }
  .upgrader-wheel { display: grid; gap: 0.6rem; justify-items: center; padding: 0.5rem; border-radius: 16px; background: #14161b; }
  .track { fill: none; stroke: #2a2e37; stroke-width: 14; }
  .arc { fill: none; stroke: #ff7a1a; stroke-width: 14; stroke-linecap: butt; }
  .inner { fill: #1b1e25; }
  .pointer { fill: #f2f2f2; }
  .pointer.won { fill: #3ddc84; }
  .pointer.lost { fill: #ff6b6b; }
  .pct { fill: #fff; font-size: 26px; font-weight: 700; text-anchor: middle; font-variant-numeric: tabular-nums; }
  .lbl { fill: #9aa0ab; font-size: 13px; text-anchor: middle; text-transform: uppercase; letter-spacing: 0.08em; }
  .upgrader-result { margin: 0; color: #ff6b6b; text-align: center; max-width: 220px; }
  .upgrader-result.won { color: #3ddc84; }
  @media (max-width: 820px) { .upgrader-grid { grid-template-columns: 1fr; } .upgrader-wheel { order: -1; } }
</style>
