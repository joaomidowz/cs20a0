<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { AccountError } from '$lib/game/online/account';
  import { fetchPromos, type PromoOffer } from '$lib/game/online/collection';
  import { PROMO_RARITY, type PromoTier } from '$lib/game/online/collection-rules';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import type { Language } from '$lib/game/types';
  import PackOdds from './PackOdds.svelte';

  export let serverUrl: string;
  export let language: Language = 'pt-BR';
  export let wallet = 0;
  export let busy = false;
  export let oddsLabels: { heading: string; first: string; others: string; all: string; coach: string; note: string; close: string };
  /** Opens the purchase (with the page's reveal); the panel reloads afterwards. */
  export let onBuy: (tier: PromoTier) => Promise<void>;

  const LABEL: Record<PromoTier, OnlineTranslationKey> = { promo_elite: 'promoElite', promo_superstar: 'promoSuperstar', promo_legend: 'promoLegend' };
  const HINT: Record<PromoTier, OnlineTranslationKey> = { promo_elite: 'promoEliteHint', promo_superstar: 'promoSuperstarHint', promo_legend: 'promoLegendHint' };
  let promos: PromoOffer[] = [];
  let endsAt = 0;
  let clock = Date.now();
  let error = '';
  let timer: ReturnType<typeof setInterval> | undefined;

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: left = Math.max(0, endsAt - clock);
  $: countdown = `${String(Math.floor(left / 3_600_000)).padStart(2, '0')}:${String(Math.floor((left % 3_600_000) / 60_000)).padStart(2, '0')}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')}`;
  $: open = promos.filter((promo) => !promo.bought).length;

  async function load() {
    try {
      const result = await fetchPromos(serverUrl);
      promos = result.promos;
      endsAt = Date.parse(result.endsAt);
      error = '';
    } catch (caught) {
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    }
  }

  async function buy(tier: PromoTier) {
    await onBuy(tier);
    await load();
  }

  onMount(() => {
    void load();
    timer = setInterval(() => {
      clock = Date.now();
      if (endsAt && clock >= endsAt) { endsAt = 0; void load(); }
    }, 1000);
  });
  onDestroy(() => clearInterval(timer));
</script>

<details class="promos-acc">
  <summary>
    <span class="promos-title">{t('promos')}</span>
    <b class="promos-count">{open}/{promos.length || 3}</b>
    {#if endsAt}<em class="promos-clock">{t('promoEndsIn')} {countdown}</em>{/if}
  </summary>
  <div class="promos-body">
    <p class="note">{t('promosHint')}</p>
    {#if error}<p class="promos-error" role="alert">{error}</p>{/if}
    <ul class="promos-list">
      {#each promos as promo (promo.tier)}
        <li class="promo rarity-{PROMO_RARITY[promo.tier]}" class:bought={promo.bought}>
          <div class="promo-info">
            <span class="promo-rarity">{PROMO_RARITY[promo.tier]}</span>
            <strong>{t(LABEL[promo.tier])}</strong>
            <small>{t(HINT[promo.tier])}</small>
          </div>
          <span class="promo-price"><i></i>{promo.price.toLocaleString(language)}</span>
          <span class="promo-clock">{promo.bought ? t('promoBought') : countdown}</span>
          {#if promo.bought}
            <span class="promo-done">✓</span>
          {:else}
            <button type="button" class="primary small" disabled={busy || wallet < promo.price} on:click={() => buy(promo.tier)}>{t('promoBuy')}</button>
          {/if}
          <PackOdds tier={promo.tier} title={t(LABEL[promo.tier])} labels={oddsLabels} />
        </li>
      {/each}
    </ul>
  </div>
</details>

<style>
  .promos-acc { border: 1px solid var(--line); background: var(--surface); }
  .promos-acc summary { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; padding: 14px 16px; cursor: pointer; list-style-position: inside; }
  .promos-acc[open] summary { border-bottom: 1px solid var(--line); }
  .promos-title { font: 900 1.1rem/1 'Arial Narrow', Impact, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
  .promos-count { color: var(--accent); font-size: .72rem; font-weight: 800; }
  .promos-clock { margin-left: auto; color: var(--muted); font-size: .64rem; font-style: normal; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; font-variant-numeric: tabular-nums; }
  .promos-body { display: grid; gap: 12px; padding: 16px; }
  .note { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }
  .promos-error { margin: 0; padding: 10px 12px; border: 1px solid var(--danger); color: #ff9b90; font-size: .78rem; }
  .promos-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .promo { --rarity: var(--line); position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto 96px 140px; gap: 16px; align-items: center; padding: 14px 44px 14px 16px; border: 1px solid var(--line); border-left: 3px solid var(--rarity); background: linear-gradient(90deg, color-mix(in srgb, var(--rarity) 10%, var(--surface-2)), var(--surface-2) 60%); }
  .rarity-elite { --rarity: #a66bff; } .rarity-superstar { --rarity: #ff7a45; } .rarity-legend { --rarity: #f2c14e; }
  .promo :global(.odds-root) { top: 50%; right: 12px; transform: translateY(-50%); }
  .promo-info { display: grid; gap: 4px; min-width: 0; }
  .promo-rarity { color: color-mix(in srgb, var(--rarity) 75%, var(--text)); font-size: .56rem; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
  .promo-info strong { font: 900 1.25rem/1 'Arial Narrow', Impact, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
  .promo-info small { color: var(--muted); font-size: .72rem; line-height: 1.4; }
  .promo-price { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border: 1px solid var(--line); background: var(--surface); font-size: .8rem; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .promo-price i { width: 12px; height: 12px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ffe9a8, #d9a441 60%, #8a5d10); }
  .promo-clock { color: var(--muted); font-size: .7rem; font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; text-transform: uppercase; }
  .promo .small { border-radius: 0; min-height: 40px; padding: 0 12px; font-size: .66rem; }
  .promo-done { display: grid; place-items: center; min-height: 40px; border: 1px solid var(--accent); color: var(--accent); font-weight: 900; }
  .promo.bought { background: var(--surface-2); }
  .promo.bought .promo-info, .promo.bought .promo-price { opacity: .55; }
  @media (max-width: 720px) {
    .promo { grid-template-columns: minmax(0, 1fr) auto; gap: 10px 12px; }
    .promo-info { grid-column: 1 / -1; }
    .promo-clock { text-align: left; }
    .promo .small, .promo-done { grid-column: 1 / -1; }
  }
</style>
