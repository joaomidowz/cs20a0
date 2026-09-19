<script lang="ts">
  import '../../../app.css';
  import { onMount } from 'svelte';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import TradesPanel from '$lib/components/online/TradesPanel.svelte';
  import { accountUser, loadAccount } from '$lib/game/online/account';
  import { fetchCollection, type CollectionState } from '$lib/game/online/collection';
  import { getOnlineServerUrl, isOnlineEnabled } from '$lib/game/online/config';
  import { translateOnline } from '$lib/game/online/i18n';
  import { uiCopy } from '$lib/game/online/ui-copy';
  import { language, theme } from '$lib/game/pageState';
  const serverUrl = getOnlineServerUrl();
  let state: CollectionState | null = null;
  let loading = true;
  let error = '';
  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline($language, key);
  async function refresh() {
    try { state = await fetchCollection(serverUrl); error = ''; }
    catch { error = t('connectionFailed'); }
  }
  onMount(async () => {
    try { await loadAccount(serverUrl); if ($accountUser) await refresh(); }
    catch { error = t('connectionFailed'); }
    finally { loading = false; }
  });
</script>
<svelte:head><title>{t('trades')} · cs13a0</title><meta name="robots" content="noindex, nofollow" /></svelte:head>
<PageLayout wide language={$language} theme={$theme} onLanguage={value => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}>
  <section class="trade-page">
    <header class="screen-header"><span class="eyebrow">ONLINE · {uiCopy($language, 'team')}</span><h1>{t('trades')}</h1><p>{t('tradesHint')}</p></header>
    <a class="secondary link" href="/online/colecao">← {uiCopy($language, 'team')}</a>
    {#if !isOnlineEnabled()}<p>{t('accountsDisabled')}</p>
    {:else if loading}<p role="status">{uiCopy($language, 'loading')}</p>
    {:else if !$accountUser}<a class="primary link" href="/online/conta?next=/online/trocas">{t('goAccount')}</a>
    {:else if state}
      <TradesPanel {serverUrl} language={$language} ownedIds={state.players.map(card => card.playerId)} lockedIds={[...(state.lineup?.playerIds ?? []), ...(state.lineup?.coachId ? [state.lineup.coachId] : [])]} onChanged={() => void refresh()} />
    {/if}
    {#if error}<p role="alert">{error}</p><button class="secondary" on:click={refresh}>{uiCopy($language, 'retry')}</button>{/if}
  </section>
</PageLayout>
<style>
  .trade-page { display:grid; gap:20px; padding:28px 0 60px; }
  .link { display:inline-flex; align-items:center; justify-self:start; min-height:48px; padding:0 20px; text-decoration:none; }
</style>
