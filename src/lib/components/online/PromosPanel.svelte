<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { AccountError } from '$lib/game/online/account';
  import { cardLabel } from '$lib/game/online/card-value';
  import { fetchPromos, type PromoOffer } from '$lib/game/online/collection';
  import type { PromoTier } from '$lib/game/online/collection-rules';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import type { Language } from '$lib/game/types';
  import PackCase from './PackCase.svelte';
  import PackOdds from './PackOdds.svelte';

  export let serverUrl: string;
  export let language: Language = 'pt-BR';
  export let wallet = 0;
  export let busy = false;
  export let oddsLabels: { heading: string; first: string; others: string; all: string; coach: string; note: string; close: string };
  /** Opens the purchase (with the page's reveal); the panel reloads afterwards. */
  export let onBuy: (tier: PromoTier) => Promise<void>;

  const LABEL: Record<PromoTier, OnlineTranslationKey> = { promo_elite: 'promoElite', promo_superstar: 'promoSuperstar', promo_legend: 'promoLegend' };
  let promos: PromoOffer[] = [];
  let endsAt = 0;
  let clock = Date.now();
  let error = '';
  let timer: ReturnType<typeof setInterval> | undefined;

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: left = Math.max(0, endsAt - clock);
  $: countdown = `${String(Math.floor(left / 3_600_000)).padStart(2, '0')}:${String(Math.floor((left % 3_600_000) / 60_000)).padStart(2, '0')}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')}`;

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

<section class="panel promos" aria-label={t('promos')}>
  <div class="section-heading">
    <div><span class="eyebrow">{t('promos').toUpperCase()}</span><h2>{t('promos')}</h2></div>
    {#if endsAt}<span class="promos-clock">{t('promoEndsIn')} <b>{countdown}</b></span>{/if}
  </div>
  <p class="promos-hint">{t('promosHint')}</p>
  {#if error}<p class="promos-error" role="alert">{error}</p>{/if}
  <div class="promos-grid">
    {#each promos as promo (promo.tier)}
      <article class="promo" class:bought={promo.bought}>
        <PackOdds tier={promo.tier} title={t(LABEL[promo.tier])} labels={oddsLabels} />
        <PackCase tier={promo.tier} label={t(LABEL[promo.tier])} />
        <strong>{t(LABEL[promo.tier])}</strong>
        <ol>{#each promo.cards as id}<li>{cardLabel(id)}</li>{/each}</ol>
        {#if promo.bought}
          <span class="promos-done">{t('promoBought')}</span>
        {:else}
          <button type="button" class="primary" disabled={busy || wallet < promo.price} on:click={() => buy(promo.tier)}>{t('promoBuy')} · {promo.price.toLocaleString(language)} coins</button>
        {/if}
      </article>
    {/each}
  </div>
</section>

<style>
  .promos { display: grid; gap: 0.75rem; }
  .section-heading { display: flex; justify-content: space-between; align-items: end; gap: 0.5rem; flex-wrap: wrap; }
  .promos-clock { font-variant-numeric: tabular-nums; font-size: 0.9rem; opacity: 0.85; }
  .promos-hint { margin: 0; font-size: 0.85rem; opacity: 0.8; }
  .promos-error { margin: 0; color: #ff6b6b; }
  .promos-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; }
  .promo { position: relative; display: grid; gap: 0.5rem; justify-items: center; padding: 0.75rem; border-radius: 12px; border: 1px solid var(--line, #333); }
  .promo.bought { opacity: 0.6; }
  .promo ol { margin: 0; padding-left: 1.2rem; font-size: 0.85rem; justify-self: stretch; }
  .promos-done { font-size: 0.85rem; opacity: 0.8; }
</style>
