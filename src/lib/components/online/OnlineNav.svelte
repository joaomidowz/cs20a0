<script lang="ts">
  import { page } from '$app/stores';
  import type { Language } from '$lib/game/types';
  import { uiCopy } from '$lib/game/online/ui-copy';
  export let language: Language;
  $: path = $page.url.pathname;
  $: links = [
    { href: '/online', label: uiCopy(language, 'play'), icon: '▷', active: path === '/online' },
    { href: '/online/colecao', label: uiCopy(language, 'team'), icon: '▦', active: path === '/online/colecao' || path === '/online/trocas' },
    { href: '/online/store', label: 'Store', icon: '◇', active: path.startsWith('/online/store') || path === '/online/upgrader' },
    { href: '/online/conta', label: uiCopy(language, 'account'), icon: '◎', active: path === '/online/conta' }
  ];
</script>

<nav class="online-nav" aria-label="Online">
  {#each links as link}<a href={link.href} aria-current={link.active ? 'page' : undefined}><span aria-hidden="true">{link.icon}</span>{link.label}</a>{/each}
</nav>

<style>
  .online-nav { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 6px; border: 1px solid var(--line); background: var(--surface); margin-bottom: 20px; }
  a { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; color: var(--muted); text-decoration: none; font-size: .875rem; font-weight: 800; }
  a[aria-current] { background: var(--surface-2); color: var(--accent); box-shadow: inset 0 -2px var(--accent); }
  a:hover { color: var(--text); } a:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  span { font-size: 1.3rem; }
  @media (max-width: 720px) {
    .online-nav { position: fixed; inset: auto 0 0; z-index: 30; margin: 0; border-width: 1px 0 0; padding: 4px 6px calc(4px + env(safe-area-inset-bottom)); }
    a { flex-direction: column; gap: 2px; min-height: 56px; font-size: .75rem; }
  }
</style>
