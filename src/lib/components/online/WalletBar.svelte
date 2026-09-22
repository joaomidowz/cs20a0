<script lang="ts">
  import { onDestroy } from 'svelte';
  import { accountUser } from '$lib/game/online/account';
  import { getOnlineServerUrl } from '$lib/game/online/config';
  import { translateOnline } from '$lib/game/online/i18n';
  import { clearPresence, presenceRows, presenceView, startPresencePolling, stopPresencePolling } from '$lib/game/online/presence';
  import { uiCopy } from '$lib/game/online/ui-copy';
  import { clearWallet, refreshWallet, walletSummary } from '$lib/game/online/wallet';
  import type { Language } from '$lib/game/types';

  /** Coins, today's packs and the collection size, sticky on every online page of a logged-in account. */
  export let language: Language;

  let loadedFor = '';
  let presenceOpen = false;
  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline(language, key);
  $: u = (key: Parameters<typeof uiCopy>[1]) => uiCopy(language, key);
  // First load per account; afterwards the pages keep it fresh (every collection reload and every purchase update the store).
  $: if ($accountUser && loadedFor !== $accountUser.id) { loadedFor = $accountUser.id; if (!$walletSummary) void refreshWallet(getOnlineServerUrl()); startPresencePolling(getOnlineServerUrl()); }
  $: if (!$accountUser && loadedFor) { loadedFor = ''; clearWallet(); clearPresence(); stopPresencePolling(); }
  $: fmt = (value: number) => value.toLocaleString(language);
  /** The `{n}` texts of the chip and its dropdown, fed by the slow /presence poll. */
  $: presenceLabel = (key: Parameters<typeof translateOnline>[1], value: number) => t(key).replace('{n}', fmt(value));
  onDestroy(() => stopPresencePolling());
</script>

{#if $accountUser}
  <div class="wallet-bar" role="region" aria-label={u('walletLabel')} aria-live="polite">
    <div class="stat coins"><span class="label">{t('wallet')}</span><strong>{$walletSummary ? fmt($walletSummary.coins) : '…'}</strong><small>coins</small></div>
    <div class="stat"><span class="label">{t('packsToday')}</span><strong>{$walletSummary ? `${$walletSummary.packsLeft}/${$walletSummary.packsGranted}` : '…'}</strong><small class="short">{u('packsShort')}</small></div>
    <div class="stat"><span class="label">{t('myCards')}</span><strong>{$walletSummary ? fmt($walletSummary.cards) : '…'}</strong><small class="short">{u('cardsShort')}</small></div>
    {#if $presenceView}
      <div class="presence">
        <button type="button" class="presence-chip" aria-expanded={presenceOpen} on:click={() => presenceOpen = !presenceOpen}>
          <i></i>{presenceLabel('onlinePlayers', $presenceView.online)}
        </button>
        {#if presenceOpen}
          {@const rows = presenceRows($presenceView)}
          <div class="presence-pop">
            <span><i class="lobby"></i>{presenceLabel('presenceQueue', rows.queue)}</span>
            <span><i class="play"></i>{presenceLabel('presenceGame', rows.game)}</span>
          </div>
        {/if}
      </div>
    {/if}
    <a class="add" href="/online/store#comprar-coins">{u('addCoins')}</a>
  </div>
{/if}

<style>
  .wallet-bar { position: sticky; top: 68px; z-index: 40; display: flex; align-items: center; gap: 8px 24px; margin-bottom: 16px; padding: 10px 12px 10px 18px; border: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(14px); box-shadow: var(--shadow); }
  .stat { display: flex; align-items: baseline; gap: 8px; min-width: 0; white-space: nowrap; }
  .label { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  strong { color: var(--accent); font: 900 1.35rem/1 'Arial Narrow', Impact, sans-serif; font-variant-numeric: tabular-nums; }
  small { color: var(--muted); font-size: .66rem; font-weight: 700; }
  .short { display: none; }
  .presence { position: relative; }
  .presence-chip { display: inline-flex; align-items: center; gap: 7px; min-height: 34px; padding: 0 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: .7rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; cursor: pointer; }
  .presence-chip i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: presencePulse 2s ease-in-out infinite; }
  .presence-chip[aria-expanded='true'] { border-color: var(--accent); color: var(--accent); }
  @keyframes presencePulse { 50% { opacity: .3; } }
  .presence-pop { position: absolute; top: calc(100% + 8px); left: 0; z-index: 50; display: grid; gap: 6px; min-width: 150px; padding: 10px 12px; border: 1px solid var(--line); background: var(--surface); box-shadow: var(--shadow); }
  .presence-pop span { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: .68rem; font-weight: 700; white-space: nowrap; }
  .presence-pop i { width: 7px; height: 7px; border-radius: 50%; }
  .presence-pop i.play { background: var(--accent); }
  .presence-pop i.lobby { background: #ffd36b; }
  .add { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; margin-left: auto; padding: 0 16px; border: 1px solid var(--accent); border-radius: 0; background: var(--accent); color: #0a0d08; font-size: .72rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; text-decoration: none; white-space: nowrap; }
  .add:hover { background: color-mix(in srgb, var(--accent) 85%, white); }
  .add:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  @media (max-width: 720px) {
    .wallet-bar { gap: 12px; margin: 0 -14px 12px; padding: 6px 8px 6px 12px; border-width: 0 0 1px; }
    .label { display: none; }
    .short { display: inline; }
    strong { font-size: 1.05rem; }
    small { font-size: .6rem; }
    .stat { gap: 4px; }
    .add { min-height: 36px; padding: 0 10px; font-size: .64rem; }
  }
  @media (max-width: 380px) { .wallet-bar { gap: 8px; } .coins small { display: none; } }
</style>
