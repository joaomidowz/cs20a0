<script lang="ts">
  import PageLayout from '$lib/components/PageLayout.svelte';
  import SeoHead from '$lib/components/SeoHead.svelte';
  import { translate } from '$lib/game/i18n';
  import { language, theme } from '$lib/game/pageState';
  import { SEO_BY_ROUTE } from '$lib/seo';

  $: t = (key: Parameters<typeof translate>[1]) => translate($language, key);
</script>

<SeoHead metadata={SEO_BY_ROUTE['/contact']} />

<PageLayout
  language={$language}
  theme={$theme}
  onLanguage={(l) => $language = l}
  onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}
>
  <header class="page-header">
    <span class="eyebrow">cs13a0</span>
    <h1>{t('contactTitle')}</h1>
  </header>

  <section class="page-block">
    <p class="lead">{t('contactIntro')}</p>
  </section>

  <div class="contact-card">
    <span class="eyebrow">{t('contactEmail')}</span>
    <a class="email-link" href="mailto:contato@cs13a0.com">contato@cs13a0.com</a>
  </div>

  <div class="page-actions">
    <a class="primary" href="mailto:contato@cs13a0.com">{t('contactSendEmail')}</a>
    <a class="secondary" href="https://ko-fi.com/cs13a0" target="_blank" rel="noopener noreferrer">{t('supportOnKofi')}</a>
  </div>

  <section class="page-block suggestions">
    <p>{t('contactSuggestions')}</p>
  </section>
</PageLayout>

<style>
  .page-header { margin-bottom: 35px; }
  .page-header h1 { margin: 10px 0 16px; font-size: clamp(2.4rem, 8vw, 4.5rem); }
  .page-block { margin-bottom: 28px; }
  .page-block p { color: var(--muted); font-size: .92rem; line-height: 1.7; margin-bottom: 16px; }
  .page-block .lead { font-size: 1.05rem; color: var(--text); line-height: 1.65; }
  .contact-card { padding: 24px; border: 1px solid var(--line); background: var(--surface); margin-bottom: 24px; }
  .contact-card .eyebrow { display: block; margin-bottom: 10px; }
  .email-link { color: var(--accent); font: 900 1.6rem 'Barlow Condensed', sans-serif; text-transform: uppercase; text-decoration: none; letter-spacing: .03em; }
  .email-link:hover { text-decoration: underline; }
  .page-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 28px; }
  .page-actions :global(a) { display: inline-flex; align-items: center; min-height: 50px; border: 0; border-radius: 2px; padding: 0 20px; cursor: pointer; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; text-decoration: none; transition: transform .18s ease, background .18s ease; font-size: .78rem; }
  .page-actions :global(.primary) { background: var(--accent); color: #0a0d08; box-shadow: 0 0 30px color-mix(in srgb, var(--accent) 25%, transparent); }
  .page-actions :global(.secondary) { border: 1px solid var(--line); color: var(--text); background: var(--surface-2); }
  .page-actions :global(a:hover) { transform: translateY(-2px); }
  .suggestions { padding-top: 18px; border-top: 1px solid var(--line); }
  .suggestions p { font-size: .85rem; }
</style>
