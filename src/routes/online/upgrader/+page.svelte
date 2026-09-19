<script lang="ts">
  import '../../../app.css';
  import { onMount } from 'svelte';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import Upgrader from '$lib/components/online/Upgrader.svelte';
  import CollectionCardSheet from '$lib/components/online/CollectionCardSheet.svelte';
  import { collectionTeamById as teamById } from '$lib/game/online/collection-pool';
  import { AccountError, accountUser, loadAccount } from '$lib/game/online/account';
  import { fetchCollection, type CollectionState } from '$lib/game/online/collection';
  import { getOnlineServerUrl, isOnlineEnabled } from '$lib/game/online/config';
  import { translateOnline } from '$lib/game/online/i18n';
  import { language, theme } from '$lib/game/pageState';
  import type { Coach, Player } from '$lib/game/types';

  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline($language, key);
  const serverUrl = getOnlineServerUrl();

  let state: CollectionState | null = null;
  let loading = true;
  let error = '';
  let detailsPlayer: Player | null = null;

  const teamNameOf = (player: Player) => teamById.get(player.teamId ?? '')?.name ?? '';
  const coachTeamName = (coach: Coach) => teamById.get(coach.teamId)?.name ?? '';
  $: ownedIds = state ? state.players.map((item) => item.playerId) : [];
  $: lockedIds = state?.lineup ? [...state.lineup.playerIds, ...(state.lineup.coachId ? [state.lineup.coachId] : [])] : [];

  async function refresh() {
    try {
      state = await fetchCollection(serverUrl);
      error = '';
    } catch (caught) {
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    }
  }

  onMount(async () => {
    try {
      await loadAccount(serverUrl);
      if ($accountUser) await refresh();
    } catch (caught) {
      error = caught instanceof AccountError ? caught.message : t('connectionFailed');
    } finally { loading = false; }
  });
</script>

<svelte:head>
  <title>{t('upgrader')} · cs13a0</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout wide language={$language} theme={$theme} onLanguage={(value) => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}>
  <section class="upgrader-page">
    <header class="screen-header centered">
      <span class="eyebrow">ONLINE · {t('collection').toUpperCase()}</span>
      <h1>{t('upgrader')}</h1>
      <p>{t('upgraderIntro')}</p>
    </header>

    {#if !isOnlineEnabled()}
      <section class="panel box"><p>{t('accountsDisabled')}</p></section>
    {:else if loading}
      <section class="panel box"><p>…</p></section>
    {:else if !$accountUser}
      <section class="panel box"><p>{t('loginFirst')}</p><a class="primary link" href="/online/conta">{t('goAccount')}</a></section>
    {:else if state}
      <div class="topbar panel">
        <div><span>{t('wallet')}</span><strong>{state.wallet.toLocaleString($language)} <small>{t('coins')}</small></strong></div>
        <div><span>{t('myCards')}</span><strong>{state.count}</strong></div>
        <div class="topbar-actions"><a class="secondary link" href="/online/colecao">← {t('collection')}</a><a class="secondary link" href="/online">{t('playOnline')}</a></div>
      </div>

      <Upgrader {serverUrl} language={$language} {ownedIds} {lockedIds} onDone={() => void refresh()}
        playerTeam={teamNameOf} coachTeam={coachTeamName} onOpen={(selected) => detailsPlayer = selected} />
    {/if}
    {#if error}<p class="online-error" role="alert">{error}</p>{/if}
  </section>
</PageLayout>

{#if detailsPlayer}
  <CollectionCardSheet player={detailsPlayer} teamName={teamNameOf(detailsPlayer)} language={$language} labels={{ close: t('close'), attributes: t('sheetAttributes'), roles: t('sheetRoles'), awards: t('sheetAwards'), value: t('sheetValue'), sell: t('sell'), coins: t('coins') }} onClose={() => detailsPlayer = null} />
{/if}

<style>
  .upgrader-page { display: grid; gap: 18px; padding: 28px 0 70px; }
  .box { display: grid; gap: 12px; padding: 22px; }
  .link { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 16px; border-radius: 0; text-decoration: none; }
  .topbar { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; padding: 16px 20px; }
  .topbar > div { display: grid; gap: 4px; }
  .topbar span { color: var(--muted); font-size: .58rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .topbar strong { font: 900 1.9rem/1 'Arial Narrow', Impact, sans-serif; color: var(--accent); }
  .topbar strong small { font: 700 .6rem Inter, Arial, sans-serif; color: var(--muted); }
  .topbar-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: end; }
  .online-error { padding: 12px; border: 1px solid var(--danger); color: #ff9b90; }
</style>
