<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { accountUser } from '$lib/game/online/account';
  import { getOnlineServerUrl } from '$lib/game/online/config';
  import { translateOnline } from '$lib/game/online/i18n';
  import { clearPresence, presenceRows, presenceView, startPresencePolling, stopPresencePolling } from '$lib/game/online/presence';
  import { uiCopy } from '$lib/game/online/ui-copy';
  import { clearWallet, refreshWallet, walletSummary } from '$lib/game/online/wallet';
  import { loadOfflineSound, offlineSoundEnabled, playGameSound, setOfflineSound, unlockOfflineAudio } from '$lib/game/offlineAudio';
  import type { Language } from '$lib/game/types';

  /** Coins, today's packs and the collection size, sticky on every online page of a logged-in account. */
  export let language: Language;

  let loadedFor = '';
  let presenceOpen = false;
  let coinsShown = 0;
  let hasWalletBalance = false;
  let coinDelta: { amount: number; key: number } | null = null;
  let deltaKey = 0;
  let balanceFrame = 0;
  let deltaTimer: ReturnType<typeof setTimeout> | null = null;
  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline(language, key);
  $: u = (key: Parameters<typeof uiCopy>[1]) => uiCopy(language, key);
  // First load per account; afterwards the pages keep it fresh (every collection reload and every purchase update the store).
  $: if ($accountUser && loadedFor !== $accountUser.id) { loadedFor = $accountUser.id; if (!$walletSummary) void refreshWallet(getOnlineServerUrl()); startPresencePolling(getOnlineServerUrl()); }
  $: if (!$accountUser && loadedFor) { loadedFor = ''; clearWallet(); clearPresence(); stopPresencePolling(); }
  $: fmt = (value: number) => value.toLocaleString(language);
  /** The `{n}` texts of the chip and its dropdown, fed by the slow /presence poll. */
  $: presenceLabel = (key: Parameters<typeof translateOnline>[1], value: number) => t(key).replace('{n}', fmt(value));

  function animateCoins(from: number, to: number) {
    cancelAnimationFrame(balanceFrame);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { coinsShown = to; return; }
    const startedAt = performance.now();
    const duration = 520;
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      coinsShown = Math.round(from + (to - from) * eased);
      if (progress < 1) balanceFrame = requestAnimationFrame(step);
    };
    balanceFrame = requestAnimationFrame(step);
  }

  function toggleSound() { setOfflineSound(!$offlineSoundEnabled); }

  onMount(() => {
    loadOfflineSound();
    const unlock = () => unlockOfflineAudio();
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    let previous: number | null = null;
    const unsubscribe = walletSummary.subscribe((summary) => {
      if (!summary) { previous = null; hasWalletBalance = false; return; }
      if (previous === null) {
        coinsShown = summary.coins;
        hasWalletBalance = true;
      } else if (summary.coins !== previous) {
        const delta = summary.coins - previous;
        animateCoins(coinsShown, summary.coins);
        coinDelta = { amount: delta, key: ++deltaKey };
        if (deltaTimer) clearTimeout(deltaTimer);
        deltaTimer = setTimeout(() => { coinDelta = null; deltaTimer = null; }, 1_700);
        playGameSound(delta > 0 ? 'coinGain' : 'coinSpend');
      }
      previous = summary.coins;
    });
    return () => {
      unsubscribe();
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  });

  onDestroy(() => {
    stopPresencePolling();
    cancelAnimationFrame(balanceFrame);
    if (deltaTimer) clearTimeout(deltaTimer);
  });
</script>

{#if $accountUser}
  <div class="wallet-bar" role="region" aria-label={u('walletLabel')}>
    <div class="stat coins"><span class="label">{t('wallet')}</span><strong aria-hidden="true">{$walletSummary && hasWalletBalance ? fmt(coinsShown) : '…'}</strong><span class="sr-only" aria-live="polite">{$walletSummary && hasWalletBalance ? `${fmt($walletSummary.coins)} ${t('coins')}` : ''}</span><small>coins</small>
      {#if coinDelta}{#key coinDelta.key}<span class="coin-delta" class:gain={coinDelta.amount > 0} class:spend={coinDelta.amount < 0} aria-hidden="true">{coinDelta.amount > 0 ? '+' : '−'}{fmt(Math.abs(coinDelta.amount))}</span>{/key}{/if}
    </div>
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
    <button class="sound-toggle" type="button" role="switch" aria-checked={$offlineSoundEnabled} aria-label={language === 'pt-BR' ? 'Sons da interface' : language === 'es' ? 'Sonidos de la interfaz' : 'Interface sounds'} title={$offlineSoundEnabled ? (language === 'pt-BR' ? 'Desativar efeitos sonoros' : language === 'es' ? 'Desactivar efectos de sonido' : 'Turn sound effects off') : (language === 'pt-BR' ? 'Ativar efeitos sonoros' : language === 'es' ? 'Activar efectos de sonido' : 'Turn sound effects on')} on:click={toggleSound}>
      {#if $offlineSoundEnabled}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a5 5 0 0 1 0 8m2-11a9 9 0 0 1 0 14" /></svg>{:else}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6" /></svg>{/if}
    </button>
    <a class="add" href="/online/store#comprar-coins">{u('addCoins')}</a>
  </div>
{/if}

<style>
  .wallet-bar { position: sticky; top: 68px; z-index: 40; display: flex; align-items: center; gap: 8px 24px; margin-bottom: 16px; padding: 10px 12px 10px 18px; border: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(14px); box-shadow: var(--shadow); }
  .stat { display: flex; align-items: baseline; gap: 8px; min-width: 0; white-space: nowrap; }
  .coins { position: relative; }
  .label { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  strong { color: var(--accent); font: 900 1.35rem/1 'Arial Narrow', Impact, sans-serif; font-variant-numeric: tabular-nums; }
  small { color: var(--muted); font-size: .66rem; font-weight: 700; }
  .short { display: none; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
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
  .sound-toggle { display: inline-grid; place-items: center; flex: none; width: 38px; height: 38px; padding: 0; border: 1px solid var(--line); background: var(--surface-2); color: var(--muted); cursor: pointer; transition: color .16s ease, border-color .16s ease, background .16s ease; }
  .sound-toggle[aria-checked='true'] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .sound-toggle:hover { background: var(--surface); color: var(--text); }
  .sound-toggle svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .coin-delta { position: absolute; z-index: 1; right: 0; bottom: calc(100% + 3px); padding: 3px 6px; font-size: .68rem; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; pointer-events: none; animation: coin-delta-in .26s cubic-bezier(.16,1,.3,1) both; }
  .coin-delta.gain { background: color-mix(in srgb, var(--accent) 16%, var(--surface)); color: var(--accent); }
  .coin-delta.spend { background: color-mix(in srgb, var(--danger, #ff7063) 16%, var(--surface)); color: var(--danger, #ff7063); }
  @keyframes coin-delta-in { from { opacity: 0; transform: translateY(7px) scale(.92); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @media (max-width: 720px) {
    .wallet-bar { gap: 10px; margin: 0 -14px 12px; padding: 6px 8px 6px 12px; border-width: 0 0 1px; }
    .label { display: none; }
    .short { display: inline; }
    strong { font-size: 1.05rem; }
    small { font-size: .6rem; }
    .stat { gap: 4px; }
    .add { min-height: 36px; padding: 0 10px; font-size: .64rem; }
    .sound-toggle { width: 34px; height: 34px; }
  }
  @media (max-width: 380px) { .wallet-bar { gap: 8px; } .coins small { display: none; } }
  @media (prefers-reduced-motion: reduce) { .coin-delta { animation: none; } }
</style>
