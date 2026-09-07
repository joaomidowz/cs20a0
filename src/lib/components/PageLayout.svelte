<script lang="ts">
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import type { Language, Theme } from '$lib/game/types';
  import { translate } from '$lib/game/i18n';
  import Navbar from './Navbar.svelte';
  import Footer from './Footer.svelte';

  export let language: Language;
  export let theme: Theme;
  export let onLanguage: (language: Language) => void;
  export let onTheme: () => void;
  export let wide = false;

  let reducedMotion = typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  onMount(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => reducedMotion = query.matches;
    query.addEventListener('change', updateMotion);
    return () => query.removeEventListener('change', updateMotion);
  });

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
</script>

<Navbar
  {language}
  {theme}
  {onLanguage}
  {onTheme}
  onHome={() => window.location.href = '/'}
/>

<main
  class:wide
  class="page-content shell narrow"
  in:fly={{ y: reducedMotion ? 0 : 6, duration: reducedMotion ? 0 : 160, easing: cubicOut }}
  out:fade={{ duration: reducedMotion ? 0 : 90 }}
>
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
