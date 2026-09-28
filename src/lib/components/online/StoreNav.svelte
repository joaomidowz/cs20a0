<script lang="ts">
  import { page } from '$app/stores';
  import type { Language } from '$lib/game/types';
  import { uiCopy } from '$lib/game/online/ui-copy';
  import { translateOnline } from '$lib/game/online/i18n';
  export let language: Language;
  $: path = $page.url.pathname;
  $: upgrade = path.endsWith('/upgrader');
  $: trades = path.endsWith('/trocas');
  $: contracts = path.endsWith('/contratos');
</script>
<!-- "Comprar coins" lives at the top of Caixas (#comprar-coins); it only gets its own tab again when there is more to buy.
     /online/trocas renders the same Trocas page. -->
<nav class="store-nav" aria-label="Store">
  <a href="/online/store" aria-current={!upgrade && !trades && !contracts ? 'page' : undefined}>{uiCopy(language, 'boxes')}</a>
  <a href="/online/store/upgrader" aria-current={upgrade ? 'page' : undefined}>Upgrader</a>
  <a href="/online/store/contratos" aria-current={contracts ? 'page' : undefined}>{translateOnline(language, 'contracts')}</a>
  <a href="/online/store/trocas" aria-current={trades ? 'page' : undefined}>{translateOnline(language, 'trades')}</a>
</nav>
<style>
  .store-nav { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  a { display: flex; align-items: center; justify-content: center; min-height: 48px; padding: 8px; border: 1px solid var(--line); color: var(--text); text-decoration: none; font-size: .875rem; text-align: center; font-weight: 800; }
  a[aria-current] { border-color: var(--accent); color: var(--accent); background: var(--surface-2); }
  @media (max-width: 560px) { .store-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
