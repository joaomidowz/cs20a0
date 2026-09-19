<script lang="ts">
  import { page } from '$app/stores';
  import type { Language } from '$lib/game/types';
  import { uiCopy } from '$lib/game/online/ui-copy';
  export let language: Language;
  $: upgrade = $page.url.pathname.endsWith('/upgrader');
</script>
<nav class="store-nav" aria-label="Store">
  <a href="/online/store" aria-current={!upgrade && $page.url.hash !== '#comprar-coins' ? 'page' : undefined}>{uiCopy(language, 'boxes')}</a>
  <a href="/online/store/upgrader" aria-current={upgrade ? 'page' : undefined}>Upgrader</a>
  <a href="/online/store#comprar-coins" aria-current={!upgrade && $page.url.hash === '#comprar-coins' ? 'page' : undefined}>{uiCopy(language, 'coins')}</a>
</nav>
<style>
  .store-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  a { display: flex; align-items: center; justify-content: center; min-height: 48px; padding: 8px; border: 1px solid var(--line); color: var(--text); text-decoration: none; font-size: .875rem; text-align: center; font-weight: 800; }
  a[aria-current] { border-color: var(--accent); color: var(--accent); background: var(--surface-2); }
</style>
