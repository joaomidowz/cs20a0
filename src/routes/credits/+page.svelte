<script lang="ts">
  import { onMount } from 'svelte';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import SeoHead from '$lib/components/SeoHead.svelte';
  import { translate } from '$lib/game/i18n';
  import { language, theme } from '$lib/game/pageState';
  import { SEO_BY_ROUTE } from '$lib/seo';

  const LIQUIPEDIA_URL = 'https://liquipedia.net/counterstrike/';
  const CC_BY_SA_URL = 'https://creativecommons.org/licenses/by-sa/3.0/';
  const FLAG_ICONS_URL = 'https://github.com/lipis/flag-icons';
  const FLAG_ICONS_LICENSE_URL = 'https://github.com/lipis/flag-icons/blob/main/LICENSE';

  interface SourcePage {
    title: string;
    revid: number | string;
    url: string;
  }

  let pages: SourcePage[] = [];
  let sourcesLoaded = false;

  // The Liquipedia page list is only shown here: loaded on demand so no other route bundles it.
  onMount(async () => {
    const module = await import('$lib/data/cs/sources.expansion.json');
    pages = module.default.pages as SourcePage[];
    sourcesLoaded = true;
  });

  $: t = (key: Parameters<typeof translate>[1]) => translate($language, key);
</script>

<SeoHead metadata={SEO_BY_ROUTE['/credits']} />

<PageLayout
  language={$language}
  theme={$theme}
  onLanguage={(l) => $language = l}
  onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}
>
  <header class="page-header">
    <span class="eyebrow">cs13a0</span>
    <h1>{t('creditsTitle')}</h1>
  </header>

  <section class="page-block">
    <p class="lead">{t('creditsIntro')}</p>
  </section>

  <section class="page-block">
    <h2>{t('creditsDataTitle')}</h2>
    <p>{t('creditsDataSource')}</p>
    <p>{t('creditsDataFiles')}</p>
    <p>{t('creditsRatings')}</p>
    <ul class="link-list">
      <li><a href={LIQUIPEDIA_URL} target="_blank" rel="noopener noreferrer">{t('creditsLiquipediaLink')}</a></li>
      <li><a href={CC_BY_SA_URL} target="_blank" rel="noopener noreferrer license">{t('creditsLicenseLink')}</a></li>
    </ul>
  </section>

  <section class="page-block">
    <h2>{t('creditsSourcesTitle')}</h2>
    <p>{t('creditsSourcesIntro')}</p>
    {#if sourcesLoaded && pages.length}
      <ul class="source-list">
        {#each pages as page (page.url)}
          <li>
            <a href={page.url} target="_blank" rel="noopener noreferrer">{page.title}</a>
            <small>{t('creditsRevision')} {page.revid}</small>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">{t('creditsSourcesEmpty')}</p>
    {/if}
  </section>

  <section class="page-block">
    <h2>{t('creditsFlagsTitle')}</h2>
    <p>{t('creditsFlags')}</p>
    <ul class="link-list">
      <li><a href={FLAG_ICONS_URL} target="_blank" rel="noopener noreferrer">{t('creditsFlagIconsLink')}</a></li>
      <li><a href={FLAG_ICONS_LICENSE_URL} target="_blank" rel="noopener noreferrer license">MIT License</a></li>
    </ul>
  </section>

  <section class="page-block">
    <h2>{t('creditsVisualsTitle')}</h2>
    <p>{t('creditsVisuals')}</p>
  </section>

  <section class="page-block">
    <h2>{t('creditsAffiliationTitle')}</h2>
    <p>{t('creditsAffiliation')}</p>
    <p>{t('creditsContact')} <a href="mailto:contato@cs13a0.com">contato@cs13a0.com</a></p>
  </section>

  <div class="page-actions">
    <a class="primary" href="/">{t('playNow')}</a>
    <a class="secondary" href="/about">{t('about')}</a>
    <a class="secondary" href="/contact">{t('sendFeedback')}</a>
  </div>
</PageLayout>

<style>
  .page-header { margin-bottom: 35px; }
  .page-header h1 { margin: 10px 0 16px; font-size: clamp(2.4rem, 8vw, 4.5rem); }
  .page-block { margin-bottom: 28px; }
  .page-block h2 { margin: 0 0 12px; font-size: clamp(1.4rem, 4vw, 2rem); }
  .page-block p { color: var(--muted); font-size: .92rem; line-height: 1.7; margin-bottom: 16px; overflow-wrap: anywhere; }
  .page-block .lead { font-size: 1.05rem; color: var(--text); line-height: 1.65; }
  .page-block .empty { font-style: italic; }
  .page-block a { color: var(--accent); }
  .link-list, .source-list { margin: 0 0 16px; padding: 0; list-style: none; display: grid; gap: 8px; }
  .link-list a { font-size: .85rem; font-weight: 700; text-decoration: none; text-transform: uppercase; letter-spacing: .06em; }
  .link-list a:hover, .source-list a:hover { text-decoration: underline; }
  .source-list li { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; padding: 8px 10px; border: 1px solid var(--line); background: var(--surface); }
  .source-list a { min-width: 0; font-size: .9rem; font-weight: 700; text-decoration: none; overflow-wrap: anywhere; }
  .source-list small { color: var(--muted); font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; }
  .page-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
  .page-actions :global(a) { display: inline-flex; align-items: center; min-height: 50px; border: 0; border-radius: 2px; padding: 0 20px; cursor: pointer; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; text-decoration: none; transition: transform .18s ease, background .18s ease; font-size: .78rem; }
  .page-actions :global(.primary) { background: var(--accent); color: #0a0d08; box-shadow: 0 0 30px color-mix(in srgb, var(--accent) 25%, transparent); }
  .page-actions :global(.secondary) { border: 1px solid var(--line); color: var(--text); background: var(--surface-2); }
  .page-actions :global(a:hover) { transform: translateY(-2px); }
</style>
