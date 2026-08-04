<script lang="ts">
  import type { Language, Theme } from '$lib/game/types';
  import { translate } from '$lib/game/i18n';
  import Navbar from './Navbar.svelte';
  import Footer from './Footer.svelte';

  export let language: Language;
  export let theme: Theme;
  export let onLanguage: (language: Language) => void;
  export let onTheme: () => void;
  export let wide = false;

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
</script>

<Navbar
  {language}
  {theme}
  {onLanguage}
  {onTheme}
  onHome={() => window.location.href = '/'}
/>

<main class:wide class="page-content shell narrow">
  <slot />
</main>

<Footer
  labels={{
    description: t('footerDescription'),
    support: t('supportOnKofi'),
    contact: t('contact'),
    disclaimer: t('footerDisclaimer'),
    about: t('about'),
    privacy: t('privacy'),
    terms: t('terms'),
    contactPage: t('contact'),
    footerNav: t('footerNav')
  }}
/>

<style>
  .page-content {
    min-height: calc(100vh - 68px);
    padding-top: 48px;
    padding-bottom: 80px;
  }

  .page-content.wide {
    width: min(1180px, calc(100% - 28px));
    max-width: 1180px;
  }
</style>
