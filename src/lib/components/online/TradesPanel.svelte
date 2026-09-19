<script lang="ts">
  import { onMount } from 'svelte';
  import { AccountError } from '$lib/game/online/account';
  import { cardCoinValue, cardLabel } from '$lib/game/online/card-value';
  import { answerTrade, fetchTradePartner, fetchTrades, proposeTrade, type TradeItem } from '$lib/game/online/collection';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import type { Language } from '$lib/game/types';

  export let serverUrl: string;
  export let language: Language = 'pt-BR';
  export let ownedIds: string[] = [];
  /** Cards on the saved team: they cannot be offered. */
  export let lockedIds: string[] = [];
  export let onChanged: () => void = () => {};

  type Tab = 'received' | 'sent' | 'new';
  let tab: Tab = 'received';
  let received: TradeItem[] = [];
  let sent: TradeItem[] = [];
  let busy = false;
  let error = '';
  let notice = '';
  // New proposal.
  let partnerQuery = '';
  let partner: { teamName: string; cards: string[] } | null = null;
  let offered = '';
  let requested = '';
  let coins = 0;

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: locked = new Set(lockedIds);
  $: offerable = ownedIds.filter((id) => !locked.has(id)).sort((a, b) => cardCoinValue(b) - cardCoinValue(a));
  $: ownedSet = new Set(ownedIds);
  $: wanted = partner ? partner.cards.filter((id) => !ownedSet.has(id)).sort((a, b) => cardCoinValue(b) - cardCoinValue(a)) : [];
  $: pendingReceived = received.filter((trade) => trade.status === 'pending').length;
  $: shown = tab === 'received' ? received : sent;

  const status = (trade: TradeItem) => t(`tradeStatus_${trade.status}` as OnlineTranslationKey);
  const fail = (caught: unknown) => { error = caught instanceof AccountError ? caught.message : t('connectionFailed'); };

  async function load() {
    try { ({ received, sent } = await fetchTrades(serverUrl)); error = ''; } catch (caught) { fail(caught); }
  }

  async function findPartner() {
    if (!partnerQuery.trim()) return;
    busy = true; error = ''; partner = null; requested = '';
    try { partner = await fetchTradePartner(serverUrl, partnerQuery.trim()); } catch (caught) { fail(caught); } finally { busy = false; }
  }

  async function send() {
    if (!partner || !offered || !requested) return;
    busy = true; error = ''; notice = '';
    try {
      await proposeTrade(serverUrl, { teamName: partner.teamName, offeredCard: offered, requestedCard: requested, coins: Math.max(0, Math.floor(coins || 0)) });
      notice = t('tradeSentOk');
      offered = ''; requested = ''; coins = 0; tab = 'sent';
      await load();
    } catch (caught) { fail(caught); } finally { busy = false; }
  }

  async function answer(trade: TradeItem, action: 'accept' | 'decline' | 'cancel') {
    busy = true; error = ''; notice = '';
    try {
      await answerTrade(serverUrl, trade.id, action);
      await load();
      if (action === 'accept') onChanged();
    } catch (caught) { fail(caught); await load(); } finally { busy = false; }
  }

  onMount(() => { void load(); });
</script>

<section class="panel trades" id="trocas" aria-label={t('trades')}>
  <div class="trades-head">
    <div><span class="eyebrow">{t('trades').toUpperCase()}</span><h2>{t('trades')}</h2></div>
    <div class="trades-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'received'} class:active={tab === 'received'} on:click={() => (tab = 'received')}>{t('tradesReceived')}{#if pendingReceived} ({pendingReceived}){/if}</button>
      <button type="button" role="tab" aria-selected={tab === 'sent'} class:active={tab === 'sent'} on:click={() => (tab = 'sent')}>{t('tradesSent')}</button>
      <button type="button" role="tab" aria-selected={tab === 'new'} class:active={tab === 'new'} on:click={() => (tab = 'new')}>{t('tradesNew')}</button>
    </div>
  </div>
  <p class="trades-hint">{t('tradesHint')}</p>
  {#if error}<p class="trades-error" role="alert">{error}</p>{/if}
  {#if notice}<p class="trades-notice" role="status">{notice}</p>{/if}

  {#if tab === 'new'}
    <form class="trades-new" on:submit|preventDefault={findPartner}>
      <label>{t('tradePartner')}<input bind:value={partnerQuery} maxlength="40" /></label>
      <button type="submit" class="secondary" disabled={busy || !partnerQuery.trim()}>{t('tradeFind')}</button>
    </form>
    {#if partner}
      <div class="trades-pick">
        <label>{t('tradeYouGive')}
          <select bind:value={offered}>
            <option value=""></option>
            {#each offerable as id}<option value={id}>{cardLabel(id)} · {cardCoinValue(id).toLocaleString(language)}</option>{/each}
          </select>
        </label>
        <label>{t('tradeYouGet')} ({partner.teamName})
          <select bind:value={requested}>
            <option value=""></option>
            {#each wanted as id}<option value={id}>{cardLabel(id)} · {cardCoinValue(id).toLocaleString(language)}</option>{/each}
          </select>
        </label>
        <label>{t('tradeCoins')}<input type="number" min="0" step="1" bind:value={coins} /></label>
        <button type="button" class="primary" disabled={busy || !offered || !requested} on:click={send}>{t('tradeSend')}</button>
      </div>
    {/if}
  {:else}
    {#if !shown.length}<p class="trades-hint">{t('tradesEmpty')}</p>{/if}
    <ul class="trades-list">
      {#each shown as trade (trade.id)}
        <li class:closed={trade.status !== 'pending'}>
          <div class="trades-text">
            <small>{t('tradeWith')} <b>{trade.partner}</b> · {status(trade)}</small>
            <span>{trade.direction === 'sent' ? t('tradeYouGive') : t('tradeYouGet')}: <b>{cardLabel(trade.offeredCard)}</b>{#if trade.coins} + {trade.coins.toLocaleString(language)} coins{/if}</span>
            <span>{trade.direction === 'sent' ? t('tradeYouGet') : t('tradeYouGive')}: <b>{cardLabel(trade.requestedCard)}</b></span>
          </div>
          {#if trade.status === 'pending'}
            <div class="trades-actions">
              {#if trade.direction === 'received'}
                <button type="button" class="primary" disabled={busy} on:click={() => answer(trade, 'accept')}>{t('tradeAccept')}</button>
                <button type="button" class="secondary" disabled={busy} on:click={() => answer(trade, 'decline')}>{t('tradeDecline')}</button>
              {:else}
                <button type="button" class="secondary" disabled={busy} on:click={() => answer(trade, 'cancel')}>{t('tradeCancel')}</button>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .trades { display: grid; gap: 0.75rem; }
  .trades-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 0.5rem; }
  .trades-head h2 { margin: 0; }
  .trades-tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; }
  .trades-tabs button { padding: 0.35rem 0.75rem; border-radius: 999px; border: 1px solid var(--line, #444); background: transparent; color: inherit; cursor: pointer; }
  .trades-tabs button.active { background: var(--accent, #f5a623); color: var(--accent-ink, #111); border-color: transparent; }
  .trades-hint { margin: 0; font-size: 0.85rem; opacity: 0.8; }
  .trades-error { margin: 0; color: #ff6b6b; }
  .trades-notice { margin: 0; color: #3ddc84; }
  .trades-new, .trades-pick { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; }
  .trades-new label, .trades-pick label { display: grid; gap: 0.25rem; font-size: 0.85rem; flex: 1 1 200px; min-width: 0; }
  .trades-pick select { max-width: 100%; }
  .trades-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
  .trades-list li { display: flex; gap: 0.75rem; align-items: center; justify-content: space-between; padding: 0.6rem 0.75rem; border-radius: 10px; border: 1px solid var(--line, #333); }
  .trades-list li.closed { opacity: 0.6; }
  .trades-text { display: grid; gap: 0.2rem; min-width: 0; }
  .trades-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  @media (max-width: 520px) { .trades-list li { flex-direction: column; align-items: stretch; } }
</style>
