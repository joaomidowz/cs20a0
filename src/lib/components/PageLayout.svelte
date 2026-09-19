<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import OnlineNav from './online/OnlineNav.svelte';
  import WalletBar from './online/WalletBar.svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import type { Language, Theme } from '$lib/game/types';
  import { translate } from '$lib/game/i18n';
  import Navbar from './Navbar.svelte';
  import Footer from './Footer.svelte';
  import ConfirmDialog from './ui/ConfirmDialog.svelte';

  export let language: Language;
  export let theme: Theme;
  export let onLanguage: (language: Language) => void;
  export let onTheme: () => void;
  export let wide = false;
  export let onlineNavigation = true;
  $: online = $page.url.pathname === '/online' || $page.url.pathname.startsWith('/online/');

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
  class:online-surface={online}
  class:with-online-nav={online && onlineNavigation}
  class="page-content shell narrow"
  in:fly={{ y: reducedMotion ? 0 : 6, duration: reducedMotion ? 0 : 160, easing: cubicOut }}
  out:fade={{ duration: reducedMotion ? 0 : 90 }}
>
  {#if online && onlineNavigation}<WalletBar {language} /><OnlineNav {language} />{/if}
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
    credits: t('credits'),
    footerNav: t('footerNav'),
    helpDesk: language === 'en' ? 'Support' : language === 'es' ? 'Soporte' : 'Suporte'
  }}
/>

<ConfirmDialog />

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
  .online-surface { padding-top: 20px; }
  .online-surface :global(button), .online-surface :global(.primary), .online-surface :global(.secondary), .online-surface :global(.ghost), .online-surface :global(input), .online-surface :global(select) { border-radius: 0; }
  .online-surface :global(button:focus-visible), .online-surface :global(a:focus-visible), .online-surface :global(summary:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }
  .online-surface :global(input), .online-surface :global(select) { min-width: 0; max-width: 100%; }
  @media(max-width:720px) {
    .with-online-nav { padding-bottom: calc(100px + env(safe-area-inset-bottom)); }
    .online-surface { padding-top: 0; }
    .online-surface :global(.screen-header) { margin-bottom: 16px; text-align: left; }
    .online-surface :global(.screen-header h1) { margin: 4px 0 8px; font-size: 2rem; }
    .online-surface :global(button), .online-surface :global(.primary), .online-surface :global(.secondary), .online-surface :global(.ghost), .online-surface :global(summary) { min-height: 44px; }
    .online-surface :global(button) { font-size: .875rem; }
    .online-surface :global(input), .online-surface :global(select) { min-height: 48px; font-size: 16px; }
    .online-surface :global(input[type='checkbox']) { min-height: 24px; }
    .online-surface :global(.segmented-control) { gap: 4px; }
    .online-surface :global(.segmented-control button) { font-size: .75rem; padding: 6px; }
    .online-surface :global(.screen-kicker) { justify-content: start; }
  }
</style>
