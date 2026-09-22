<script lang="ts">
  import '../../../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import { safeOnlineReturn, uiCopy } from '$lib/game/online/ui-copy';
  import MissionsPanel from '$lib/components/online/MissionsPanel.svelte';
  import PublicProfileSheet from '$lib/components/online/PublicProfileSheet.svelte';
  import { AccountError, accountUser, authFetch, loadAccount, logoutAccount, requestMagicLink, saveProfile, verifyMagicCode, verifyMagicLink } from '$lib/game/online/account';
  import { getOnlineServerUrl, isOnlineEnabled } from '$lib/game/online/config';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import { language, theme } from '$lib/game/pageState';

  $: t = (key: OnlineTranslationKey) => translateOnline($language, key);
  const serverUrl = getOnlineServerUrl();

  type Standing = { rank: number; userId: string; displayName: string; teamName: string | null; majorsWon: number; majorsPlayed: number; points: number };
  type Season = { month: string; top: Standing[]; me: Standing | null; lastSeason: { month: string; podium: Array<{ rank: number; displayName: string; teamName: string | null; points: number }> } | null };

  let email = '';
  let code = '';
  let loading = true;
  let returnTo = '/online';
  const returnKey = 'cs13a0:auth-return';
  function rememberReturn() {
    if (!$page.url.searchParams.has('next')) return;
    try { localStorage.setItem(returnKey, JSON.stringify({ path: returnTo, expires: Date.now() + 30 * 60_000 })); } catch { /* Storage can be blocked. */ }
  }
  function consumeReturn() {
    try {
      const stored = JSON.parse(localStorage.getItem(returnKey) ?? 'null');
      localStorage.removeItem(returnKey);
      return stored?.expires > Date.now() ? safeOnlineReturn(stored.path) : '/online/conta';
    } catch { return '/online/conta'; }
  }
  let profileOf: string | null = null;
  let busy = false;
  let sent = false;
  let devLink: string | null = null;
  let error = '';
  let verifying = false;
  let displayName = '';
  let teamName = '';
  let disabled = false;
  let saved = false;
  let awards: Array<{ kind: string; count: number; last: string }> = [];
  let season: Season | null = null;

  const fail = (caught: unknown) => {
    if (caught instanceof AccountError) {
      if (caught.status === 503) { disabled = true; return; }
      error = caught.code === 'INVALID_EMAIL' ? t('invalidEmail') : caught.code === 'DISPOSABLE_EMAIL' ? t('disposableEmail') : caught.code === 'RATE_LIMITED' ? t('rateLimited') : caught.code === 'INVALID_TOKEN' ? t('linkInvalid') : caught.code === 'INVALID_CODE' ? t('codeInvalid') : caught.message;
      return;
    }
    error = t('connectionFailed');
  };

  const awardLabel = (kind: string) => {
    const key = `award_${kind}` as OnlineTranslationKey;
    return translateOnline($language, key) ?? kind;
  };
  const monthLabel = (month: string) => new Date(`${month}T12:00:00Z`).toLocaleDateString($language, { month: 'long', year: 'numeric' });

  async function submit() {
    if (busy) return;
    rememberReturn();
    error = ''; busy = true; devLink = null; sent = false; code = '';
    try {
      const result = await requestMagicLink(serverUrl, email);
      sent = true;
      devLink = result.devLink ?? null;
    } catch (caught) { fail(caught); } finally { busy = false; }
  }

  /** Typed code path: where the link cannot open the right app (phone e-mail apps, installed PWA). */
  async function submitCode() {
    if (busy || !/^\d{6}$/.test(code)) return;
    error = ''; busy = true;
    try {
      await verifyMagicCode(serverUrl, email, code);
      const destination = consumeReturn();
      await goto(destination, { replaceState: true });
    } catch (caught) { fail(caught); } finally { busy = false; }
  }

  async function persistProfile() {
    error = ''; busy = true; saved = false;
    try { await saveProfile(serverUrl, { displayName: displayName.trim(), teamName: teamName.trim() }); await loadAccount(serverUrl); saved = true; } catch (caught) { fail(caught); } finally { busy = false; }
  }

  async function loadExtras() {
    try {
      const [mine, current] = await Promise.all([
        authFetch<{ awards: typeof awards }>(serverUrl, '/me/awards'),
        authFetch<Season>(serverUrl, '/seasons/current')
      ]);
      awards = mine.awards;
      season = current;
    } catch { /* the profile still works without the extras */ }
  }

  onMount(async () => {
    const token = $page.url.searchParams.get('token');
    const hasNext = $page.url.searchParams.has('next');
    returnTo = safeOnlineReturn($page.url.searchParams.get('next'));
    rememberReturn();
    try {
      if (token) {
        verifying = true;
        await verifyMagicLink(serverUrl, token);
        const destination = hasNext ? returnTo : consumeReturn();
        await goto(destination, { replaceState: true });
        if (destination !== '/online/conta') return;
      } else {
        await loadAccount(serverUrl);
        if ($accountUser && hasNext) { consumeReturn(); await goto(returnTo, { replaceState: true }); return; }
      }
    } catch (caught) { fail(caught); } finally { verifying = false; loading = false; }
    displayName = $accountUser?.displayName ?? '';
    teamName = $accountUser?.teamName ?? '';
    if ($accountUser) await loadExtras();
  });
</script>

<svelte:head>
  <title>{t('account')} · cs13a0</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout wide language={$language} theme={$theme} onLanguage={(value) => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}>
  <section class="account">
    <header class="screen-header centered">
      <span class="eyebrow">ONLINE · {t('account').toUpperCase()}</span>
      <h1>{t('account')}</h1>
      <p>{t('accountIntro')}</p>
    </header>

    {#if !isOnlineEnabled() || disabled}
      <section class="panel box narrow"><p>{t('accountsDisabled')}</p><a class="secondary link" href="/online">{t('back')}</a></section>
    {:else if verifying || loading}
      <section class="panel box narrow"><p role="status">{verifying ? t('verifying') : uiCopy($language, 'loading')}</p></section>
    {:else if $accountUser}
      <MissionsPanel {serverUrl} language={$language} />
      <div class="grid">
        <section class="panel box">
          <div class="section-heading"><div><span class="eyebrow">{t('profile').toUpperCase()}</span><h2>{$accountUser.teamName ?? $accountUser.displayName ?? $accountUser.email}</h2></div></div>
          <small class="muted">{t('loggedInAs')} {$accountUser.email} · {t('memberSince')} {new Date($accountUser.createdAt).toLocaleDateString($language)}</small>
          <details class="profile-edit"><summary>{uiCopy($language, 'edit')}</summary>
          <form class="profile" on:submit|preventDefault={persistProfile}>
            <label><span>{t('displayName')}</span><input bind:value={displayName} minlength="2" maxlength="24" required /></label>
            <label><span>{t('teamName')}</span><input bind:value={teamName} minlength="2" maxlength="24" required /></label>
            <button class="secondary" type="submit" disabled={busy || displayName.trim().length < 2 || teamName.trim().length < 2}>{saved ? '✓' : t('saveProfile')}</button>
          </form>
          </details>
          <div class="actions">
            <a class="primary link" href="/online/colecao">{t('goCollection')}</a>
            <a class="secondary link" href="/online">{t('playOnline')}</a>
            <a class="ghost link" href="/suporte">{$language === 'en' ? 'Support' : $language === 'es' ? 'Soporte' : 'Suporte'}</a>
            <button class="ghost" type="button" on:click={() => logoutAccount(serverUrl)}>{t('logout')}</button>
          </div>
        </section>

        <section class="panel box">
          <div class="section-heading"><div><span class="eyebrow">AWARDS</span><h2>{t('myAwards')}</h2></div><strong class="count">{awards.reduce((sum, award) => sum + award.count, 0)}</strong></div>
          {#if awards.length}
            <ul class="awards">
              {#each awards as award (award.kind)}
                <li class:gold={award.kind === 'major_title' || award.kind.startsWith('season_top')}><span>{awardLabel(award.kind)}</span><b>×{award.count}</b></li>
              {/each}
            </ul>
          {:else}
            <p class="muted">{t('noAwards')}</p>
          {/if}
        </section>
      </div>

      <a class="secondary link store-link" href="/online/store#comprar-coins">Store · {uiCopy($language, 'coins')}</a>

      <section class="panel box">
        <div class="section-heading"><div><span class="eyebrow">{t('season').toUpperCase()}</span><h2>{t('seasonOfMonth')}{#if season} · {monthLabel(season.month)}{/if}</h2></div>{#if season?.me}<strong class="count">#{season.me.rank} · {season.me.points} {t('pointsCol').toLowerCase()}</strong>{/if}</div>
        {#if season?.lastSeason?.podium.length}
          <p class="champion"><span>{t('lastChampion')} ({monthLabel(season.lastSeason.month)})</span> <b>{season.lastSeason.podium[0].teamName ?? season.lastSeason.podium[0].displayName}</b> · {season.lastSeason.podium[0].points} {t('pointsCol').toLowerCase()}</p>
        {/if}
        {#if season?.top.length}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div class="table-scroll" tabindex="0" role="region" aria-label={t('season')}><table class="standings">
            <thead><tr><th>{t('rankCol')}</th><th>{t('teamCol')}</th><th>{t('playerCol')}</th><th>{t('titlesCol')}</th><th>{t('pointsCol')}</th></tr></thead>
            <tbody>
              {#each season.top.slice(0, 20) as row (row.userId)}
                <tr class:me={row.userId === $accountUser.id}><td>{row.rank}</td><td><button class="row-link" type="button" on:click={() => profileOf = row.userId}>{row.teamName ?? '—'}</button></td><td>{row.displayName}</td><td>{row.majorsWon}</td><td><b>{row.points}</b></td></tr>
              {/each}
            </tbody>
          </table></div>
        {:else}
          <p class="muted">{t('seasonEmpty')}</p>
        {/if}
      </section>
    {:else}
      <form class="panel box narrow" on:submit|preventDefault={submit}>
        <label><span>{t('email')}</span><input type="email" bind:value={email} required autocomplete="email" inputmode="email" /></label>
        <button class="primary" type="submit" disabled={busy || !email.includes('@')}>{busy ? '…' : t('sendLink')}</button>
        {#if sent}<p class="note">{t('linkSent')}</p>{/if}
        {#if devLink}<p class="note dev">{t('devLink')} <a href={devLink}>{devLink}</a></p>{/if}
      </form>
      {#if sent}
        <form class="panel box narrow" on:submit|preventDefault={submitCode}>
          <p class="note">{t('codeHint')}</p>
          <label><span>{t('codeLabel')}</span><input class="code-input" bind:value={code} inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder={t('codePlaceholder')} /></label>
          <button class="primary" type="submit" disabled={busy || code.length !== 6}>{busy ? '…' : t('codeSubmit')}</button>
        </form>
      {/if}
    {/if}
    {#if error}<p class="online-error" role="alert">{error}</p>{/if}
  </section>
{#if profileOf}<PublicProfileSheet {serverUrl} userId={profileOf} language={$language} onClose={() => profileOf = null} />{/if}
</PageLayout>

<style>
  .table-scroll { overflow-x:auto; min-width:0; }
  .profile-edit summary { cursor:pointer; padding:14px 0; font-weight:800; }
  .store-link { justify-self:start; }
  @media(max-width:520px) { .box { padding:14px; } .count { white-space:normal; } .actions > * { flex:1 1 140px; justify-content:center; } }
  .row-link { padding: 0; border: 0; background: none; color: inherit; font: inherit; font-weight: 800; text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 3px; cursor: pointer; min-height: 0; }
  .account { display: grid; gap: 18px; padding: 28px 0 70px; }
  .grid { display: grid; gap: 18px; }
  .box { display: grid; gap: 14px; padding: 22px; align-content: start; }
  .narrow { max-width: 560px; width: 100%; margin: 0 auto; }
  .box label { display: grid; gap: 7px; }
  .box label span { color: var(--muted); font-size: .6rem; font-weight: 800; text-transform: uppercase; }
  .box input { min-height: 46px; padding: 0 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: inherit; }
  .note, .muted { margin: 0; color: var(--muted); font-size: .85rem; line-height: 1.5; }
  .note.dev a { color: var(--accent); overflow-wrap: anywhere; }
  .code-input { text-align: center; font: 900 1.5rem/1.2 'Courier New', monospace; letter-spacing: .45em; padding-left: 0; }
  .profile { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; align-items: end; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .link { display: inline-flex; align-items: center; min-height: 50px; padding: 0 20px; text-decoration: none; }
  .count { color: var(--accent); font: 900 1.3rem/1 'Arial Narrow', Impact, sans-serif; white-space: nowrap; }
  .awards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
  .awards li { display: flex; justify-content: space-between; gap: 8px; padding: 9px 11px; border-left: 3px solid var(--accent); background: var(--surface-2); font-size: .78rem; }
  .awards li.gold { border-left-color: #d9a441; } .awards li.gold b { color: #d9a441; }
  .champion { margin: 0; padding: 10px 12px; border-left: 3px solid #d9a441; background: color-mix(in srgb, #d9a441 8%, var(--surface-2)); font-size: .82rem; }
  .champion span { color: var(--muted); } .champion b { color: #d9a441; }
  .standings { width: 100%; border-collapse: collapse; font-size: .82rem; }
  .standings th { padding: 8px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: .58rem; letter-spacing: .1em; text-align: left; text-transform: uppercase; }
  .standings td { padding: 9px 8px; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); }
  .standings tr.me td { background: color-mix(in srgb, var(--accent) 8%, transparent); color: var(--accent); }
  .online-error { padding: 12px; border: 1px solid var(--danger); color: #ff9b90; }
  @media (min-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
</style>
