<script lang="ts">
  import '../../../../app.css';
  import StoreNav from '$lib/components/online/StoreNav.svelte';
  import { uiCopy } from '$lib/game/online/ui-copy';
  import { onMount } from 'svelte';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import CardContracts from '$lib/components/online/CardContracts.svelte';
  import { collectionTeamById as teamById } from '$lib/game/online/collection-pool';
  import { AccountError, accountUser, loadAccount } from '$lib/game/online/account';
  import { fetchContracts, type ContractsState } from '$lib/game/online/collection';
  import { getOnlineServerUrl, isOnlineEnabled } from '$lib/game/online/config';
  import { translateOnline } from '$lib/game/online/i18n';
  import { language, theme } from '$lib/game/pageState';

  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline($language, key);
  const serverUrl = getOnlineServerUrl();

  let contracts: ContractsState | null = null;
  let loading = true;
  let error = '';

  const teamNameOf = (player: import('$lib/game/types').Player) => teamById.get(player.teamId ?? '')?.name ?? '';

  async function refresh() {
    try {
      contracts = await fetchContracts(serverUrl);
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
  <title>{t('contracts')} · cs13a0</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout wide language={$language} theme={$theme} onLanguage={(value) => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}>
  <section class="contracts-page">
    <header class="screen-header centered">
      <span class="eyebrow">ONLINE · STORE</span>
      <h1>{t('contracts')}</h1>
      <p>{t('contractsIntro')}</p>
      <a class="faq-link" href="#faq-title">{t('faqLink')}</a>
    </header>

    <StoreNav language={$language} />

    {#if !isOnlineEnabled()}
      <section class="panel box"><p>{t('accountsDisabled')}</p></section>
    {:else if loading}
      <section class="panel box" aria-busy="true"><p role="status">{uiCopy($language, 'loading')}</p></section>
    {:else if !$accountUser}
      <section class="panel box"><p>{t('loginFirst')}</p><a class="primary link" href="/online/conta?next=/online/store/contratos">{t('goAccount')}</a></section>
    {:else if contracts}
      <CardContracts {serverUrl} language={$language} {contracts} onRefresh={() => void refresh()} playerTeam={teamNameOf} />
    {/if}
    {#if error}<p class="online-error" role="alert"><span>{error}</span>{#if !contracts}<button class="secondary" type="button" on:click={() => refresh()}>{uiCopy($language, 'retry')}</button>{/if}</p>{/if}

    <section class="faq panel" aria-labelledby="faq-title">
      <h2 id="faq-title">{t('faqTitle')}</h2>
      <details>
        <summary>{t('faqContractsQ1')}</summary>
        <p>{t('faqContractsA1')}</p>
      </details>
      <details>
        <summary>{t('faqContractsQ2')}</summary>
        <p>{t('faqContractsA2')}</p>
      </details>
      <details>
        <summary>{t('faqContractsQ3')}</summary>
        <p>{t('faqContractsA3')}</p>
      </details>
    </section>
  </section>
</PageLayout>

<style>
  .contracts-page { display: grid; gap: 18px; padding: 28px 0 70px; }
  .box { display: grid; gap: 12px; padding: 22px; }
  .link { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 16px; border-radius: 0; text-decoration: none; }
  .faq { display: grid; gap: 0; padding: 18px 20px; }
  .faq-link { display: inline-flex; align-items: center; justify-content: center; justify-self: center; min-height: 40px; margin-top: 10px; padding: 0 14px; border: 1px solid var(--line); border-radius: 0; background: var(--surface-2); color: var(--text); font-size: .64rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; text-decoration: none; }
  .faq-link:hover, .faq-link:focus-visible { border-color: var(--accent); color: var(--accent); }
  .faq h2 { scroll-margin-top: 90px; margin: 0 0 10px; font-size: .8rem; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
  .faq details { border-top: 1px solid var(--line); }
  .faq summary { padding: 12px 0; font-size: .86rem; font-weight: 800; cursor: pointer; }
  .faq summary:hover { color: var(--accent); }
  .faq p { margin: 0 0 10px; color: var(--muted); font-size: .8rem; line-height: 1.55; }
  .online-error { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 0; padding: 12px; border: 1px solid var(--danger); color: #ff9b90; }
  .online-error button { min-height: 44px; border-radius: 0; }
</style>
