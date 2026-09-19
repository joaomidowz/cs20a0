<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import CollectionCard from './CollectionCard.svelte';
  import CoachCard from './CoachCard.svelte';
  import CollectionCardSheet from './CollectionCardSheet.svelte';
  import SelectionSheet from './SelectionSheet.svelte';
  import { AccountError } from '$lib/game/online/account';
  import { buyPromo, fetchPromos, type PromoOffer } from '$lib/game/online/collection';
  import { collectionCoachById, collectionPlayerById, collectionTeamById } from '$lib/game/online/collection-pool';
  import { rarityOf, type PromoTier } from '$lib/game/online/collection-rules';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import { uiCopy } from '$lib/game/online/ui-copy';
  import { confirmDialog } from '$lib/game/ui/dialog';
  import type { Coach, Language, Player } from '$lib/game/types';

  export let serverUrl: string;
  export let language: Language = 'pt-BR';
  export let wallet = 0;
  export let busy = false;
  /** After a purchase: the page reloads the collection (the wallet bar follows it). */
  export let onBought: (cardId: string) => Promise<void> | void = () => {};

  let promos: PromoOffer[] = [];
  let endsAt = 0;
  let clock = Date.now();
  let error = '';
  let notice = '';
  let loading = true;
  let buying: PromoTier | '' = '';
  let enlarged: { player: Player | null; coach: Coach | null } | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: u = (key: Parameters<typeof uiCopy>[1]) => uiCopy(language, key);
  $: label = (tier: PromoTier) => (tier === 'promo_coach' ? u('promoCoach') : t(tier === 'promo_elite' ? 'promoElite' : tier === 'promo_superstar' ? 'promoSuperstar' : 'promoLegend'));
  $: left = Math.max(0, endsAt - clock);
  $: countdown = `${String(Math.floor(left / 3_600_000)).padStart(2, '0')}:${String(Math.floor((left % 3_600_000) / 60_000)).padStart(2, '0')}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')}`;
  $: open = promos.filter((promo) => !promo.bought && !promo.owned).length;
  const teamOf = (teamId: string | null | undefined) => collectionTeamById.get(teamId ?? '')?.name ?? '';
  const nameOf = (id: string) => collectionCoachById.get(id)?.name ?? collectionPlayerById.get(id)?.nickname ?? id;

  async function load() {
    try {
      const result = await fetchPromos(serverUrl);
      promos = result.promos;
      endsAt = Date.parse(result.endsAt);
      error = '';
    } catch (caught) {
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    } finally { loading = false; }
  }

  async function buy(promo: PromoOffer) {
    if (busy || buying) return;
    const confirmed = await confirmDialog({ title: u('confirmBuy'), body: `${label(promo.tier)} · ${nameOf(promo.cardId)}\n${promo.originalPrice.toLocaleString(language)} → ${promo.price.toLocaleString(language)} coins (-${promo.discount}%)`, confirmLabel: t('promoBuy'), cancelLabel: t('cancel') });
    if (!confirmed) return;
    buying = promo.tier; error = ''; notice = '';
    try {
      await buyPromo(serverUrl, promo.tier);
      notice = `✓ ${u('promoAdded')}: ${nameOf(promo.cardId)}`;
      await onBought(promo.cardId);
    } catch (caught) {
      error = caught instanceof AccountError ? (caught.code === 'INSUFFICIENT_COINS' ? `${t('wallet')}: ${caught.message}` : caught.message) : t('connectionFailed');
    } finally {
      buying = '';
      await load();
    }
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

<section class="promos" aria-labelledby="promos-title">
  <header class="promos-head">
    <div><span class="eyebrow">{open}/{promos.length || 4}</span><h3 id="promos-title">{t('promos')}</h3></div>
    {#if endsAt}<em class="promos-clock" aria-label={t('promoEndsIn')}>{t('promoEndsIn')} <b>{countdown}</b></em>{/if}
  </header>
  <p class="note">{t('promosHint')}</p>
  {#if error}<p class="promos-error" role="alert">{error}</p>{/if}
  {#if notice}<p class="promos-notice" role="status">{notice}</p>{/if}
  {#if loading}
    <p class="note" role="status">{u('loading')}</p>
  {:else}
    <ul class="promos-grid">
      {#each promos as promo (promo.tier)}
        {@const player = collectionPlayerById.get(promo.cardId) ?? null}
        {@const coach = collectionCoachById.get(promo.cardId) ?? null}
        <li class="promo rarity-{player ? rarityOf(player) : coach ? rarityOf(coach) : 'common'}" class:done={promo.bought || promo.owned}>
          <div class="promo-top"><span class="promo-kind">{label(promo.tier)}</span><b class="promo-off">-{promo.discount}%</b></div>
          {#if coach}
            <button type="button" class="promo-card" aria-label={`${u('promoEnlarge')}: ${nameOf(promo.cardId)}`} on:click={() => enlarged = { player: null, coach }}><CoachCard {coach} teamName={teamOf(coach.teamId)} /></button>
          {:else if player}
            <div class="promo-card"><CollectionCard {player} teamName={teamOf(player.teamId)} {language} compact onOpen={() => enlarged = { player, coach: null }} /></div>
          {/if}
          <div class="promo-price">
            <s aria-label={u('promoFrom')}>{promo.originalPrice.toLocaleString(language)}</s>
            <strong><i></i>{promo.price.toLocaleString(language)}</strong>
          </div>
          {#if endsAt}<small class="promo-left">⏱ {countdown}</small>{/if}
          {#if promo.bought}
            <button type="button" class="secondary" disabled>✓ {t('promoBought')}</button>
          {:else if promo.owned}
            <button type="button" class="secondary" disabled>{u('promoOwned')}</button>
          {:else}
            <button type="button" class="primary" disabled={busy || !!buying || wallet < promo.price} on:click={() => buy(promo)}>{buying === promo.tier ? u('working') : t('promoBuy')}</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if enlarged?.player}
  <CollectionCardSheet player={enlarged.player} teamName={teamOf(enlarged.player.teamId)} {language} labels={{ close: t('close'), attributes: t('sheetAttributes'), roles: t('sheetRoles'), awards: t('sheetAwards'), value: t('sheetValue'), sell: t('sell'), coins: t('coins') }} onClose={() => enlarged = null} />
{:else if enlarged?.coach}
  <SelectionSheet title={enlarged.coach.name} closeLabel={t('close')} onClose={() => enlarged = null}>
    <div class="coach-big"><CoachCard coach={enlarged.coach} teamName={teamOf(enlarged.coach.teamId)} showcase /></div>
  </SelectionSheet>
{/if}

<style>
  .promos { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--line); background: var(--surface); }
  .promos-head { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: end; justify-content: space-between; }
  .promos-head h3 { margin: 4px 0 0; font: 900 1.25rem/1 'Arial Narrow', Impact, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
  .promos-clock { color: var(--muted); font-size: .7rem; font-style: normal; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .promos-clock b { color: var(--accent); font-variant-numeric: tabular-nums; }
  .note { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }
  .promos-error { margin: 0; padding: 10px 12px; border: 1px solid var(--danger); color: #ff9b90; font-size: .78rem; }
  .promos-notice { margin: 0; padding: 10px 12px; border-left: 3px solid var(--accent); background: var(--surface-2); color: var(--accent); font-size: .78rem; font-weight: 800; }
  .promos-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
  .promo { --rarity: var(--line); display: grid; gap: 8px; align-content: start; min-width: 0; padding: 10px; border: 1px solid var(--line); border-top: 3px solid var(--rarity); background: var(--surface-2); }
  .rarity-elite { --rarity: #a66bff; } .rarity-superstar { --rarity: #ff7a45; } .rarity-legend { --rarity: #f2c14e; } .rarity-goat { --rarity: #ff5ad8; } .rarity-rare { --rarity: #5ad1ff; }
  .promo-top { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .promo-kind { color: color-mix(in srgb, var(--rarity) 70%, var(--text)); font-size: .62rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
  .promo-off { padding: 3px 7px; background: var(--accent-2); color: #0a0d08; font-size: .72rem; font-weight: 900; }
  .promo-card { display: block; width: 100%; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; cursor: zoom-in; text-align: inherit; }
  .promo-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .promo-price { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; justify-content: center; font-variant-numeric: tabular-nums; }
  .promo-price s { color: var(--muted); font-size: .78rem; }
  .promo-price strong { display: inline-flex; align-items: center; gap: 6px; color: var(--accent); font: 900 1.25rem/1 'Arial Narrow', Impact, sans-serif; }
  .promo-price i { width: 12px; height: 12px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ffe9a8, #d9a441 60%, #8a5d10); }
  .promo button.primary, .promo button.secondary { width: 100%; min-height: 44px; border-radius: 0; font-size: .72rem; }
  .promo-left { color: var(--muted); font-size: .66rem; font-weight: 800; text-align: center; font-variant-numeric: tabular-nums; }
  .promo.done .promo-card, .promo.done .promo-price { opacity: .55; }
  .coach-big { max-width: 300px; margin: 0 auto; }
  @media (max-width: 1000px) { .promos-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 720px) { .promos { padding: 12px; } .promos-grid { gap: 8px; } .promo { padding: 8px; } }
</style>
