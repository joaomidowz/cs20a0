<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import { AccountError, accountUser, loadAccount, logoutAccount, requestMagicLink, setDisplayName, verifyMagicLink } from '$lib/game/online/account';
  import { getOnlineServerUrl, isOnlineEnabled } from '$lib/game/online/config';
  import { translateOnline } from '$lib/game/online/i18n';
  import { language, theme } from '$lib/game/pageState';

  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline($language, key);
  const serverUrl = getOnlineServerUrl();

  let email = '';
  let busy = false;
  let sent = false;
  let devLink: string | null = null;
  let error = '';
  let verifying = false;
  let displayName = '';
  let disabled = false;

  const fail = (caught: unknown) => {
    if (caught instanceof AccountError) {
      if (caught.status === 503) { disabled = true; return; }
      error = caught.code === 'INVALID_EMAIL' ? t('invalidEmail') : caught.code === 'DISPOSABLE_EMAIL' ? t('disposableEmail') : caught.code === 'RATE_LIMITED' ? t('rateLimited') : caught.code === 'INVALID_TOKEN' ? t('linkInvalid') : caught.message;
      return;
    }
    error = t('connectionFailed');
  };

  async function submit() {
    error = ''; busy = true; devLink = null;
    try {
      const result = await requestMagicLink(serverUrl, email);
      sent = true;
      devLink = result.devLink ?? null;
    } catch (caught) { fail(caught); } finally { busy = false; }
  }

  async function saveName() {
    error = ''; busy = true;
    try { await setDisplayName(serverUrl, displayName); await loadAccount(serverUrl); } catch (caught) { fail(caught); } finally { busy = false; }
  }

  onMount(async () => {
    const token = $page.url.searchParams.get('token');
    try {
      if (token) {
        verifying = true;
        await verifyMagicLink(serverUrl, token);
        await goto('/online/conta', { replaceState: true });
      } else {
        await loadAccount(serverUrl);
      }
    } catch (caught) { fail(caught); } finally { verifying = false; }
    displayName = $accountUser?.displayName ?? '';
  });
</script>

<svelte:head>
  <title>{t('account')} · cs13a0</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout language={$language} theme={$theme} onLanguage={(value) => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}>
  <section class="account">
    <header class="screen-header centered">
      <span class="eyebrow">ONLINE · {t('account').toUpperCase()}</span>
      <h1>{t('account')}</h1>
      <p>{t('accountIntro')}</p>
    </header>

    {#if !isOnlineEnabled() || disabled}
      <section class="panel box"><p>{t('accountsDisabled')}</p><a class="secondary link" href="/online">{t('back')}</a></section>
    {:else if verifying}
      <section class="panel box"><p>{t('verifying')}</p></section>
    {:else if $accountUser}
      <section class="panel box logged">
        <span class="eyebrow">{t('loggedInAs')}</span>
        <strong>{$accountUser.displayName ?? $accountUser.email}</strong>
        <small>{$accountUser.email} · {t('memberSince')} {new Date($accountUser.createdAt).toLocaleDateString($language)}</small>
        <form class="name" on:submit|preventDefault={saveName}>
          <label><span>{t('displayName')}</span><input bind:value={displayName} minlength="2" maxlength="24" /></label>
          <button class="secondary" type="submit" disabled={busy || displayName.trim().length < 2}>{t('saveProfile')}</button>
        </form>
        <div class="actions">
          <a class="primary link" href="/online/colecao">{t('goCollection')}</a>
          <a class="secondary link" href="/online">{t('back')}</a>
          <button class="ghost" type="button" on:click={() => logoutAccount(serverUrl)}>{t('logout')}</button>
        </div>
      </section>
    {:else}
      <form class="panel box" on:submit|preventDefault={submit}>
        <label><span>{t('email')}</span><input type="email" bind:value={email} required autocomplete="email" inputmode="email" /></label>
        <button class="primary" type="submit" disabled={busy || !email.includes('@')}>{busy ? '…' : t('sendLink')}</button>
        {#if sent}<p class="note">{t('linkSent')}</p>{/if}
        {#if devLink}<p class="note dev">{t('devLink')} <a href={devLink}>{devLink}</a></p>{/if}
      </form>
    {/if}
    {#if error}<p class="online-error" role="alert">{error}</p>{/if}
  </section>
</PageLayout>

<style>
  .account { display: grid; gap: 18px; max-width: 560px; margin: 0 auto; padding: 28px 0 70px; }
  .box { display: grid; gap: 12px; padding: 22px; }
  .box label { display: grid; gap: 7px; }
  .box label span { color: var(--muted); font-size: .6rem; font-weight: 800; text-transform: uppercase; }
  .box input { min-height: 46px; padding: 0 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); }
  .note { margin: 0; color: var(--muted); font-size: .85rem; line-height: 1.5; }
  .note.dev a { color: var(--accent); overflow-wrap: anywhere; }
  .logged strong { font-size: 1.4rem; }
  .logged small { color: var(--muted); }
  .name { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: end; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .link { display: inline-flex; align-items: center; min-height: 50px; padding: 0 20px; text-decoration: none; }
  .online-error { padding: 12px; border: 1px solid var(--danger); color: #ff9b90; }
  @media (max-width: 520px) { .name { grid-template-columns: 1fr; } }
</style>
