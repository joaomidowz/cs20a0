<script lang="ts">
  import '../../../../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import StoreNav from '$lib/components/online/StoreNav.svelte';
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
  $: initialPartner = $page.url.searchParams.get('partner') ?? '';
  $: initialRequested = $page.url.searchParams.get('card') ?? '';
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
    <header class="screen-header centered"><span class="eyebrow">ONLINE · STORE</span><h1>{t('trades')}</h1><p>{t('tradesHint')}</p></header>
    <StoreNav language={$language} />
    {#if !isOnlineEnabled()}<p>{t('accountsDisabled')}</p>
    {:else if loading}<p class="panel status" role="status" aria-busy="true">{uiCopy($language, 'loading')}</p>
    {:else if !$accountUser}<a class="primary link" href="/online/conta?next=/online/store/trocas">{t('goAccount')}</a>
    {:else if state}
      <TradesPanel {serverUrl} language={$language} ownedIds={state.players.map(card => card.playerId)} lockedIds={[...(state.lineup?.playerIds ?? []), ...(state.lineup?.coachId ? [state.lineup.coachId] : [])]} {initialPartner} {initialRequested} onChanged={() => void refresh()} />
    {/if}
    {#if error}<p class="online-error" role="alert"><span>{error}</span><button class="secondary" type="button" on:click={refresh}>{uiCopy($language, 'retry')}</button></p>{/if}
  </section>
</PageLayout>
<style>
  .trade-page { display:grid; gap:20px; padding:28px 0 60px; }
  .status { margin:0; padding:22px; }
  @media(max-width:720px) { .trade-page { padding-top:8px; gap:14px; } }
  .online-error { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin:0; padding:12px; border:1px solid var(--danger); color:#ff9b90; }
  .online-error button { min-height:44px; border-radius:0; }
  .link { display:inline-flex; align-items:center; justify-self:start; min-height:48px; padding:0 20px; text-decoration:none; }
</style>
