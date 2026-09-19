<script lang="ts">
  import MiniCard from './MiniCard.svelte';
  import TradeCard from './TradeCard.svelte';
  import { confirmDialog } from '$lib/game/ui/dialog';
  import { uiCopy, type UiKey } from '$lib/game/online/ui-copy';
  import { refreshWallet } from '$lib/game/online/wallet';
  import { onDestroy, onMount } from 'svelte';
  import { AccountError } from '$lib/game/online/account';
  import { cardCoinValue, cardLabel } from '$lib/game/online/card-value';
  import { collectionCoachById, collectionPlayerById } from '$lib/game/online/collection-pool';
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
  type Step = 1 | 2 | 3 | 4;
  const PAGE = 36;
  let tab: Tab = 'received';
  let received: TradeItem[] = [];
  let sent: TradeItem[] = [];
  let loading = true;
  let busy = false;
  let error = '';
  let notice = '';
  // New proposal, one step at a time: team → their card → my card → coins and review.
  let step: Step = 1;
  let partnerQuery = '';
  let partner: { teamName: string; cards: string[] } | null = null;
  let offered = '';
  let requested = '';
  let coins = 0;
  let filter = '';
  let limit = PAGE;
  // Ticks once a minute so "expira em" stays true while the page is open.
  let now = Date.now();
  const clock = setInterval(() => { now = Date.now(); }, 60_000);
  onDestroy(() => clearInterval(clock));

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: u = (key: UiKey) => uiCopy(language, key);
  $: locked = new Set(lockedIds);
  $: ownedSet = new Set(ownedIds);
  const byValue = (a: string, b: string) => cardCoinValue(b) - cardCoinValue(a);
  $: offerable = ownedIds.filter((id) => !locked.has(id)).sort(byValue);
  $: wanted = partner ? partner.cards.filter((id) => !ownedSet.has(id)).sort(byValue) : [];
  $: pool = step === 2 ? wanted : step === 3 ? offerable : [];
  $: filtered = filter.trim() ? pool.filter((id) => nameOf(id).toLowerCase().includes(filter.trim().toLowerCase())) : pool;
  $: pendingReceived = received.filter((trade) => trade.status === 'pending').length;
  $: pendingSent = sent.filter((trade) => trade.status === 'pending').length;
  $: shown = tab === 'received' ? received : sent;
  $: extra = Math.max(0, Math.floor(Number(coins) || 0));
  $: tabs = [
    { value: 'received' as Tab, label: t('tradesReceived'), count: pendingReceived },
    { value: 'sent' as Tab, label: t('tradesSent'), count: pendingSent },
    { value: 'new' as Tab, label: t('tradesNew'), count: 0 }
  ];
  $: steps = [
    { value: 1 as Step, label: u('tradeStepTeam') },
    { value: 2 as Step, label: u('tradeStepTheirs') },
    { value: 3 as Step, label: u('tradeStepMine') },
    { value: 4 as Step, label: u('tradeStepCoins') }
  ];

  const nameOf = (id: string) => collectionPlayerById.get(id)?.nickname ?? collectionCoachById.get(id)?.name ?? id;
  const status = (trade: TradeItem) => t(`tradeStatus_${trade.status}` as OnlineTranslationKey);
  const fmt = (value: number) => value.toLocaleString(language);
  const fail = (caught: unknown) => { error = caught instanceof AccountError ? caught.message : t('connectionFailed'); };
  // Reactive so the step buttons re-render when the partner or a card is picked.
  $: canStep = (value: Step) => value === 1 || (value === 2 && Boolean(partner)) || (value === 3 && Boolean(partner && requested)) || (value === 4 && Boolean(partner && requested && offered));
  function goStep(value: Step) { if (!canStep(value)) return; step = value; filter = ''; limit = PAGE; }
  function expiresIn(iso: string, at: number) {
    const ms = Math.max(0, Date.parse(iso) - at);
    const hours = Math.floor(ms / 3_600_000);
    return hours >= 48 ? `${Math.floor(hours / 24)}d` : `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  }
  /** What I give and what I get, whichever side sent it; the extra coins always travel with the proposer's card. */
  const sides = (trade: TradeItem) => trade.direction === 'sent'
    ? { give: trade.offeredCard, get: trade.requestedCard, giveCoins: trade.coins, getCoins: 0 }
    : { give: trade.requestedCard, get: trade.offeredCard, giveCoins: 0, getCoins: trade.coins };

  async function load() {
    try { ({ received, sent } = await fetchTrades(serverUrl)); error = ''; } catch (caught) { fail(caught); } finally { loading = false; }
  }

  async function findPartner() {
    if (busy || !partnerQuery.trim()) return;
    busy = true; error = ''; partner = null; requested = ''; offered = '';
    try { partner = await fetchTradePartner(serverUrl, partnerQuery.trim()); goStep(2); } catch (caught) { fail(caught); } finally { busy = false; }
  }

  function pick(id: string) {
    if (step === 2) { requested = id; goStep(offered ? 4 : 3); }
    else if (step === 3) { offered = id; goStep(4); }
  }

  function resetProposal() { step = 1; partner = null; partnerQuery = ''; offered = ''; requested = ''; coins = 0; filter = ''; limit = PAGE; }

  async function send() {
    if (busy || !partner || !offered || !requested) return;
    if (!await confirmDialog({ title: u('confirmTrade'), body: `${t('tradeWith')} ${partner.teamName}\n${t('tradeYouGive')}: ${cardLabel(offered)}${extra ? ` + ${fmt(extra)} coins` : ''}\n${t('tradeYouGet')}: ${cardLabel(requested)}`, confirmLabel: t('tradeSend'), cancelLabel: t('cancel') })) return;
    busy = true; error = ''; notice = '';
    try {
      await proposeTrade(serverUrl, { teamName: partner.teamName, offeredCard: offered, requestedCard: requested, coins: extra });
      notice = t('tradeSentOk');
      resetProposal(); tab = 'sent';
      await load();
    } catch (caught) { fail(caught); } finally { busy = false; }
  }

  async function answer(trade: TradeItem, action: 'accept' | 'decline' | 'cancel') {
    if (busy) return;
    if (action === 'accept' && !await confirmDialog({ title: u('confirmTrade'), body: `${t('tradeWith')} ${trade.partner}\n${t('tradeYouGive')}: ${cardLabel(trade.requestedCard)}\n${t('tradeYouGet')}: ${cardLabel(trade.offeredCard)}${trade.coins ? ` + ${fmt(trade.coins)} coins` : ''}`, confirmLabel: t('tradeAccept'), cancelLabel: t('cancel') })) return;
    busy = true; error = ''; notice = '';
    try {
      await answerTrade(serverUrl, trade.id, action);
      void refreshWallet(serverUrl);
      await load();
      if (action === 'accept') onChanged();
    } catch (caught) { await load(); fail(caught); } finally { busy = false; }
  }

  onMount(() => { void load(); });
</script>

<section class="panel trades" id="trocas" aria-labelledby="trocas-title">
  <div class="trades-head">
    <div><span class="eyebrow">{t('trades').toUpperCase()}</span><h2 id="trocas-title">{t('trades')}</h2></div>
    <p class="hint">{t('tradesHint')}</p>
  </div>

  <div class="segmented-control trades-tabs" role="group" aria-label={t('trades')}>
    {#each tabs as item}
      <button type="button" aria-pressed={tab === item.value} class:active={tab === item.value} on:click={() => { tab = item.value; notice = ''; }}>
        {item.label}{#if item.count}<b class="badge" aria-label={`${item.count} ${t('tradeStatus_pending')}`}>{item.count}</b>{/if}
      </button>
    {/each}
  </div>

  {#if error}<p class="msg error" role="alert">{error}</p>{/if}
  {#if notice}<p class="msg ok" role="status">{notice}</p>{/if}

  {#if tab === 'new'}
    <nav class="steps" aria-label={t('tradesNew')}>
      {#each steps as item}
        <button type="button" aria-current={step === item.value ? 'step' : undefined} class:done={canStep(item.value) && step > item.value} disabled={busy || !canStep(item.value)} on:click={() => goStep(item.value)}><b>{item.value}</b><span>{item.label}</span></button>
      {/each}
    </nav>

    {#if step === 1}
      <form class="find" on:submit|preventDefault={findPartner}>
        <label><span>{t('tradePartner')}</span><input bind:value={partnerQuery} maxlength="40" autocomplete="off" /></label>
        <button type="submit" class="primary" disabled={busy || !partnerQuery.trim()}>{busy ? u('working') : t('tradeFind')}</button>
      </form>
      <p class="hint">{u('tradeTeamHint')}</p>
    {:else if step === 2 || step === 3}
      <div class="pick-head">
        <p class="hint">{#if step === 2}<b>{partner?.teamName}</b> · {u('tradeTheirsHint')}{:else}{u('tradeMineHint')}{/if}</p>
        {#if pool.length > 8}<label class="filter"><span class="sr-only">{u('tradeFilter')}</span><input bind:value={filter} placeholder={u('tradeFilter')} on:input={() => (limit = PAGE)} /></label>{/if}
      </div>
      {#if !pool.length}
        <div class="empty"><p>{step === 2 ? u('tradeNoTheirs') : u('tradeNoMine')}</p>{#if step === 2}<button type="button" class="secondary" on:click={resetProposal}>{u('tradeChange')}</button>{/if}</div>
      {:else}
        <div class="card-grid">
          {#each filtered.slice(0, limit) as id (id)}
            <div class="grid-item">
              <MiniCard {id} label={u('tradePick')} selected={(step === 2 ? requested : offered) === id} onClick={() => pick(id)} />
              <span class="value"><i></i>{fmt(cardCoinValue(id))}</span>
            </div>
          {/each}
        </div>
        {#if filtered.length > limit}<button type="button" class="secondary more" on:click={() => (limit += PAGE)}>{u('showMore')} · {filtered.length - limit}</button>{/if}
      {/if}
    {:else if partner}
      <div class="deal review">
        <div class="side">
          <small>{t('tradeYouGive')}</small>
          <TradeCard id={offered} {language} label={t('tradeYouGive')} />
          {#if extra}<span class="coins-chip">+{fmt(extra)} coins</span>{/if}
          <button type="button" class="link-btn" on:click={() => goStep(3)}>{u('tradeChange')}</button>
        </div>
        <span class="arrow" aria-hidden="true">⇄</span>
        <div class="side">
          <small>{t('tradeYouGet')} · {partner.teamName}</small>
          <TradeCard id={requested} {language} label={t('tradeYouGet')} />
          <button type="button" class="link-btn" on:click={() => goStep(2)}>{u('tradeChange')}</button>
        </div>
      </div>
      <div class="send-row">
        <label><span>{t('tradeCoins')}</span><input type="number" min="0" step="1" inputmode="numeric" bind:value={coins} /></label>
        <button type="button" class="primary" disabled={busy || !offered || !requested} on:click={send}>{busy ? u('working') : u('review')}</button>
      </div>
    {/if}
  {:else if loading}
    <p class="hint" role="status">{u('loading')}</p>
  {:else if !shown.length}
    <div class="empty">
      <p>{tab === 'received' ? u('tradeEmptyReceived') : u('tradeEmptySent')}</p>
      <button type="button" class="primary" on:click={() => (tab = 'new')}>{t('tradesNew')}</button>
    </div>
  {:else}
    <ul class="trade-list">
      {#each shown as trade (trade.id)}
        {@const side = sides(trade)}
        <li class="trade status-{trade.status}">
          <div class="trade-top">
            <span class="with">{t('tradeWith')} <b>{trade.partner}</b></span>
            <span class="status">{status(trade)}</span>
            {#if trade.status === 'pending'}<small class="expires">{u('tradeExpiresIn')} {expiresIn(trade.expiresAt, now)}</small>{/if}
          </div>
          <div class="deal">
            <div class="side">
              <small>{t('tradeYouGive')}</small>
              <TradeCard id={side.give} {language} label={t('tradeYouGive')} />
              {#if side.giveCoins}<span class="coins-chip">+{fmt(side.giveCoins)} coins</span>{/if}
            </div>
            <span class="arrow" aria-hidden="true">⇄</span>
            <div class="side">
              <small>{t('tradeYouGet')}</small>
              <TradeCard id={side.get} {language} label={t('tradeYouGet')} />
              {#if side.getCoins}<span class="coins-chip">+{fmt(side.getCoins)} coins</span>{/if}
            </div>
          </div>
          {#if trade.status === 'pending'}
            <div class="actions" class:single={trade.direction === 'sent'}>
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
  .trades { display: grid; gap: 14px; padding: 22px; scroll-margin-top: 150px; }
  .trades-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 6px 24px; }
  .trades-head h2 { margin: 4px 0 0; }
  .hint { margin: 0; color: var(--muted); font-size: .8rem; line-height: 1.5; }
  .trades-head .hint { max-width: 460px; }
  .hint b { color: var(--text); }
  .trades-tabs button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 0; }
  .badge { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 4px; background: var(--accent); color: #0a0d08; font-size: .6rem; font-weight: 900; }
  .msg { margin: 0; padding: 10px 12px; border: 1px solid var(--line); font-size: .82rem; }
  .msg.error { border-color: var(--danger); color: var(--danger); }
  .msg.ok { border-color: var(--accent); color: var(--accent); }
  button { border-radius: 0; }
  input { width: 100%; min-height: 44px; padding: 10px; border: 1px solid var(--line); border-radius: 0; background: var(--surface-2); color: var(--text); font: inherit; }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  label span { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  /* Proposal list */
  .trade-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
  .trade { --status: var(--muted); display: grid; gap: 12px; padding: 14px; border: 1px solid var(--line); border-left: 3px solid var(--status); background: var(--surface); }
  .status-pending { --status: var(--accent-2); } .status-accepted { --status: var(--accent); } .status-declined { --status: var(--danger); }
  .status-expired, .status-cancelled { --status: var(--muted); }
  .status-expired .deal, .status-cancelled .deal, .status-declined .deal { opacity: .6; }
  .trade-top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; font-size: .82rem; }
  .with { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status { padding: 3px 8px; border: 1px solid var(--status); color: var(--status); font-size: .58rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
  .expires { margin-left: auto; color: var(--muted); font-size: .7rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .deal { display: grid; grid-template-columns: minmax(0, 200px) auto minmax(0, 200px); align-items: center; justify-content: start; gap: 12px; }
  .side { display: grid; align-content: start; gap: 6px; min-width: 0; }
  .side small { overflow: hidden; color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .08em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .arrow { display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid var(--line); background: var(--surface-2); color: var(--accent); font-size: 1.2rem; font-weight: 900; }
  .coins-chip { justify-self: start; padding: 3px 8px; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font-size: .66rem; font-weight: 900; font-variant-numeric: tabular-nums; }
  .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 160px)); gap: 8px; }
  .actions button { min-height: 44px; }
  .actions.single { grid-template-columns: minmax(0, 200px); }

  /* New proposal */
  .steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .steps button { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 44px; padding: 6px 10px; border: 1px solid var(--line); background: transparent; color: var(--muted); font: inherit; font-size: .68rem; font-weight: 800; text-align: left; text-transform: uppercase; cursor: pointer; }
  .steps button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .steps b { display: grid; flex: 0 0 auto; place-items: center; width: 22px; height: 22px; border: 1px solid currentColor; font-size: .7rem; }
  .steps button[aria-current] { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }
  .steps button.done { color: var(--text); }
  .steps button:disabled { cursor: default; opacity: .5; }
  .find { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 8px; }
  .find label, .send-row label { display: grid; gap: 4px; min-width: 0; }
  .find button, .send-row button { min-height: 44px; padding: 0 20px; }
  .pick-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
  .filter { flex: 0 1 260px; min-width: 0; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
  .grid-item { display: grid; gap: 4px; min-width: 0; }
  .value { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: .64rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  .value i { width: 8px; height: 8px; background: var(--accent); }
  .more { justify-self: center; min-height: 44px; padding: 0 20px; }
  .review { padding: 14px; border: 1px solid var(--line); background: var(--surface); }
  .link-btn { justify-self: start; min-height: 32px; padding: 0 10px; border: 1px solid var(--line); background: transparent; color: var(--text); font-size: .62rem; font-weight: 800; text-transform: uppercase; cursor: pointer; }
  .link-btn:hover { border-color: var(--accent); }
  .send-row { display: grid; grid-template-columns: minmax(0, 240px) auto; align-items: end; justify-content: start; gap: 8px; }
  .empty { display: grid; justify-items: start; gap: 12px; padding: 18px; border: 1px dashed var(--line); }
  .empty p { margin: 0; color: var(--muted); font-size: .85rem; }
  .empty button { min-height: 44px; padding: 0 20px; }

  @media (max-width: 720px) {
    .trades { padding: 14px; gap: 12px; }
    .trade { padding: 10px; gap: 10px; }
    .deal { grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr); gap: 6px; justify-content: stretch; }
    .arrow { width: 28px; height: 28px; font-size: .95rem; }
    .actions, .actions.single { grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); }
    .steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    .send-row { grid-template-columns: minmax(0, 1fr) auto; }
    .review { padding: 10px; }
  }
  @media (max-width: 380px) { .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
