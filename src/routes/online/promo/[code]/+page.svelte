<script lang="ts">
  import '../../../../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import PromoLinkBanner from '$lib/components/online/PromoLinkBanner.svelte';
  import { AccountError, accountUser, loadAccount } from '$lib/game/online/account';
  import { getOnlineServerUrl, isOnlineEnabled } from '$lib/game/online/config';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import { consumePromo, fetchPromoLink, normalizePromoCode, redeemPromoLink, rememberPromo, type PromoLinkInfo, type PromoRedeemResult } from '$lib/game/online/promo-links';
  import { refreshWallet } from '$lib/game/online/wallet';
  import { showToast } from '$lib/game/notifications';
  import { playGameSound } from '$lib/game/offlineAudio';
  import { language, theme } from '$lib/game/pageState';

  /**
   * `/online/promo/CODIGO`: a vitrine do presente. Deslogado, guarda o código e manda para o login (o bônus cai ao
   * terminar). Logado, resgata na hora. O servidor decide vaga, validade e quem pode.
   */
  $: t = (key: OnlineTranslationKey) => translateOnline($language, key);
  const serverUrl = getOnlineServerUrl();
  $: code = normalizePromoCode($page.params.code);

  let info: PromoLinkInfo | null = null;
  let notFound = false;
  let loading = true;
  let busy = false;
  let result: PromoRedeemResult | null = null;

  const resultMessage = (promo: PromoRedeemResult) => promo.status === 'granted'
    ? t('promoLinkGranted').replace('{coins}', promo.coins.toLocaleString($language)).replace('{code}', promo.code)
    : t(`promoLink${promo.status === 'sold_out' ? 'SoldOut' : promo.status === 'not_new' ? 'NotNew' : promo.status.charAt(0).toUpperCase() + promo.status.slice(1)}` as OnlineTranslationKey);

  async function redeem() {
    if (!code || busy) return;
    busy = true;
    try {
      result = await redeemPromoLink(serverUrl, code);
      consumePromo();
      if (result.status === 'granted') { await refreshWallet(serverUrl); playGameSound('success'); showToast({ message: resultMessage(result), kind: 'success', duration: 6_000, key: 'promo-link' }); }
      else showToast({ message: resultMessage(result), kind: 'info', duration: 5_000, key: 'promo-link' });
      info = await fetchPromoLink(serverUrl, code).catch(() => info);
    } catch (caught) {
      showToast({ message: caught instanceof AccountError ? caught.message : t('connectionFailed'), kind: 'error', duration: 5_000, key: 'promo-link' });
    } finally { busy = false; }
  }

  onMount(async () => {
    if (!code) { notFound = true; loading = false; return; }
    rememberPromo(code);
    try {
      [info] = await Promise.all([fetchPromoLink(serverUrl, code), loadAccount(serverUrl).catch(() => null)]);
    } catch (caught) {
      if (caught instanceof AccountError && caught.status === 404) notFound = true;
      else showToast({ message: t('connectionFailed'), kind: 'error', duration: 5_000, key: 'promo-link' });
    } finally { loading = false; }
  });
</script>

<svelte:head>
  <title>{t('promoLinkTitle')} · cs13a0</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout wide language={$language} theme={$theme} onLanguage={(value) => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}>
  <section class="promo-page">
    {#if !isOnlineEnabled()}
      <section class="panel box"><p>{t('accountsDisabled')}</p><a class="secondary link" href="/online">{t('back')}</a></section>
    {:else}
      <PromoLinkBanner code={code ?? ($page.params.code ?? '').toUpperCase()} {info} notFound={notFound && !loading} language={$language}>
        {#if !loading && info && !notFound}
          <div class="actions">
            {#if result}
              <p class="result" class:ok={result.status === 'granted'}>{resultMessage(result)}</p>
            {/if}
            {#if $accountUser}
              {#if info.active && !result}
                <button class="primary" type="button" disabled={busy} on:click={redeem}>{busy ? '…' : t('promoLinkRedeemCta')}</button>
              {/if}
              <a class="secondary link" href="/online">{t('playOnline')}</a>
            {:else}
              {#if info.active}<a class="primary link" href="/online/conta?next=/online">{t('promoLinkLoginCta')}</a>{/if}
              <a class="secondary link" href="/online">{t('back')}</a>
            {/if}
          </div>
          {#if !$accountUser && info.active}<p class="hint">{t('promoLinkPendingHint')}</p>{/if}
        {:else if !loading && notFound}
          <div class="actions"><a class="secondary link" href="/online">{t('back')}</a></div>
        {/if}
      </PromoLinkBanner>
    {/if}
  </section>
</PageLayout>

<style>
  .promo-page { display: grid; gap: 18px; max-width: 640px; margin: 0 auto; padding: 28px 0 70px; }
  .box { display: grid; gap: 14px; padding: 22px; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
  .link { display: inline-flex; align-items: center; min-height: 50px; padding: 0 20px; text-decoration: none; }
  .hint { margin: 0; color: var(--muted); font-size: .82rem; line-height: 1.5; }
  .result { margin: 0; flex-basis: 100%; padding: 10px 12px; border-left: 3px solid var(--line); background: var(--surface-2); font-weight: 700; }
  .result.ok { border-left-color: var(--accent); color: var(--accent); }
</style>
