<script lang="ts">
  import PageLayout from '$lib/components/PageLayout.svelte';
  import SeoHead from '$lib/components/SeoHead.svelte';
  import { translate } from '$lib/game/i18n';
  import { language, theme } from '$lib/game/pageState';
  import { SEO_BY_ROUTE } from '$lib/seo';
  import { LEGAL_CONTACT, privacyPolicy } from '$lib/legal';

  $: t = (key: Parameters<typeof translate>[1]) => translate($language, key);
  $: doc = privacyPolicy($language);
</script>

<SeoHead metadata={SEO_BY_ROUTE['/privacy']} />

<PageLayout
  language={$language}
  theme={$theme}
  onLanguage={(l) => $language = l}
  onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}
>
  <header class="page-header">
    <span class="eyebrow">cs13a0</span>
    <h1>{doc.title}</h1>
    <p class="updated">{doc.updated}</p>
  </header>

  <section class="page-block">
    <p class="lead">{doc.intro}</p>
  </section>

  {#each doc.sections as section (section.heading)}
    <section class="page-block">
      <h2>{section.heading}</h2>
      {#each section.paragraphs as paragraph}<p>{paragraph}</p>{/each}
    </section>
  {/each}

  <div class="page-contact">
    <p>{t('privacyContact')} <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> · <a href="/suporte">{$language === 'en' ? 'Support' : $language === 'es' ? 'Soporte' : 'Suporte'}</a></p>
  </div>
</PageLayout>

<style>
  .page-header { margin-bottom: 35px; }
  .page-header h1 { margin: 10px 0 16px; font-size: clamp(2.4rem, 8vw, 4.5rem); }
  .page-block { margin-bottom: 28px; }
  .page-block h2 { margin: 0 0 10px; font-size: 1.25rem; }
  .page-block .lead { color: var(--text); font-size: 1rem; }
  .updated { margin: 0; color: var(--muted); font-size: .8rem; }
  .page-block p { color: var(--muted); font-size: .92rem; line-height: 1.7; margin-bottom: 16px; }
  .page-contact { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
  .page-contact p { color: var(--muted); font-size: .85rem; }
  .page-contact a { color: var(--accent); font-weight: 700; }
</style>
