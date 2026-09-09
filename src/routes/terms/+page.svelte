<script lang="ts">
  import PageLayout from '$lib/components/PageLayout.svelte';
  import SeoHead from '$lib/components/SeoHead.svelte';
  import { translate } from '$lib/game/i18n';
  import { language, theme } from '$lib/game/pageState';
  import { SEO_BY_ROUTE } from '$lib/seo';

  $: t = (key: Parameters<typeof translate>[1]) => translate($language, key);
</script>

<SeoHead metadata={SEO_BY_ROUTE['/terms']} />

<PageLayout
  language={$language}
  theme={$theme}
  onLanguage={(l) => $language = l}
  onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}
>
  <header class="page-header">
    <span class="eyebrow">cs13a0</span>
    <h1>{t('termsTitle')}</h1>
  </header>

  <section class="page-block">
    <p><strong>{t('termsIndependent')}</strong></p>
    <p>{t('termsTrademarks')}</p>
    <p>{t('termsGameplay')}</p>
    <p>{t('termsConduct')}</p>
    <p>{t('termsChanges')}</p>
    <p>{t('termsKoFi')}</p>
    <p>{t('termsAvailability')}</p>
  </section>

  <div class="page-contact">
    <p>{t('termsContact')} <a href="mailto:contato@cs13a0.com">contato@cs13a0.com</a></p>
  </div>
</PageLayout>

<style>
  .page-header { margin-bottom: 35px; }
  .page-header h1 { margin: 10px 0 16px; font-size: clamp(2.4rem, 8vw, 4.5rem); }
  .page-block { margin-bottom: 28px; }
  .page-block p { color: var(--muted); font-size: .92rem; line-height: 1.7; margin-bottom: 16px; }
  .page-block strong { color: var(--text); }
  .page-contact { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
  .page-contact p { color: var(--muted); font-size: .85rem; }
  .page-contact a { color: var(--accent); font-weight: 700; }
</style>
