<script context="module" lang="ts">
  type Product = { id: string; coins: number; priceCents: number; currency: string };
  // One fetch per visit: the account and the collection pages share the list. Prices shown here are display only,
  // the server charges what its own table says for the product id.
  let cached: { url: string; at: number; products: Product[]; enabled: boolean } | null = null;
  /**
   * Shown only when the server cannot be reached (or still runs a version without the public catalog): the active
   * rows of `products` (migration 7). Display only, the buttons stay off; the server charges from its own table.
   */
  const FALLBACK: Product[] = [
    { id: 'coins_2k', coins: 2000, priceCents: 100, currency: 'BRL' },
    { id: 'coins_10k5', coins: 10500, priceCents: 500, currency: 'BRL' },
    { id: 'coins_22k', coins: 22000, priceCents: 1000, currency: 'BRL' },
    { id: 'coins_60k', coins: 60000, priceCents: 2500, currency: 'BRL' }
  ];
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { AccountError, authFetch } from '$lib/game/online/account';

  export let serverUrl: string;
  export let language: string = 'pt-BR';

  let products: Product[] = FALLBACK;
  /** Payments on for this server; off (local, or Mercado Pago not configured) the prices show with "Em breve". */
  let enabled = false;
  let busy = '';
  let error = '';

  const TEXT = {
    'pt-BR': { title: 'Comprar coins', hint: 'Pagamento pelo Mercado Pago (Pix ou cartão). As coins caem na conta assim que o pagamento é aprovado.', buy: 'Comprar', adult: 'Compras só para maiores de 18 anos ou com autorização do responsável. Coins não têm valor em dinheiro e não são reembolsáveis depois de usadas.', fail: 'Não foi possível abrir o pagamento.', limit: 'Limite diário de compras atingido.', blocked: 'Compras bloqueadas nesta conta. Fale com o suporte.', best: 'Melhor valor', soon: 'Em breve', off: 'As compras ainda não estão abertas. Estes são os pacotes e preços que vão valer.', help: 'Problema com uma compra? Fale com o suporte.', terms: 'Termos' },
    en: { title: 'Buy coins', hint: 'Paid through Mercado Pago (Pix or card). Coins land in your account as soon as the payment is approved.', buy: 'Buy', adult: 'Purchases only for 18+ or with a guardian\'s permission. Coins have no cash value and are not refundable once used.', fail: 'Could not open the payment.', limit: 'Daily purchase limit reached.', blocked: 'Purchases are blocked on this account. Contact support.', best: 'Best value', soon: 'Coming soon', off: 'Purchases are not open yet. These are the packs and prices that will apply.', help: 'Trouble with a purchase? Contact support.', terms: 'Terms' },
    es: { title: 'Comprar coins', hint: 'Pago por Mercado Pago (Pix o tarjeta). Las coins llegan a tu cuenta cuando se aprueba el pago.', buy: 'Comprar', adult: 'Compras solo para mayores de 18 o con autorización del responsable. Las coins no tienen valor en dinero y no se reembolsan una vez usadas.', fail: 'No se pudo abrir el pago.', limit: 'Límite diario de compras alcanzado.', blocked: 'Compras bloqueadas en esta cuenta. Contacta al soporte.', best: 'Mejor valor', soon: 'Próximamente', off: 'Las compras aún no están abiertas. Estos son los paquetes y precios que valdrán.', help: '¿Problema con una compra? Habla con soporte.', terms: 'Términos' }
  } as const;
  $: text = TEXT[(language in TEXT ? language : 'pt-BR') as keyof typeof TEXT];
  const price = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  $: bestId = products.reduce<Product | null>((best, item) => (!best || item.coins / item.priceCents > best.coins / best.priceCents ? item : best), null)?.id;

  /** The "+ Coins" link lands here (`#comprar-coins`): the section mounts after the collection loads, so scroll by hand. */
  async function revealAnchor() {
    if (typeof location === 'undefined' || location.hash !== '#comprar-coins') return;
    await tick();
    document.getElementById('comprar-coins')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onMount(async () => {
    void revealAnchor();
    if (cached && cached.url === serverUrl && Date.now() - cached.at < 60_000) { products = cached.products; enabled = cached.enabled; return; }
    try {
      const result = await authFetch<{ products: Product[]; enabled?: boolean }>(serverUrl, '/shop/products', { method: 'GET' });
      const listed = result.products.filter((item) => item.coins > 0 && item.priceCents > 0);
      if (listed.length) products = listed;
      // Older servers only exposed the catalog with payments on and did not send the flag.
      enabled = result.enabled ?? true;
      cached = { url: serverUrl, at: Date.now(), products, enabled };
    } catch {
      enabled = false; // No catalog from the server: the fallback prices stay, buttons say "Em breve".
    }
  });

  async function buy(product: Product) {
    if (!enabled) return;
    error = ''; busy = product.id;
    try {
      const result = await authFetch<{ checkoutUrl: string }>(serverUrl, '/shop/checkout', { method: 'POST', body: { productId: product.id } });
      window.location.href = result.checkoutUrl;
    } catch (caught) {
      error = caught instanceof AccountError && caught.code === 'PURCHASE_LIMIT' ? text.limit : caught instanceof AccountError && caught.code === 'PURCHASES_BLOCKED' ? text.blocked : text.fail;
      busy = '';
    }
  }
</script>

<section class="panel buy" id="comprar-coins" aria-labelledby="comprar-coins-title">
  <div class="head">
    <div><span class="eyebrow">COINS · MERCADO PAGO</span><h2 id="comprar-coins-title">{text.title}</h2></div>
    <p class="hint">{enabled ? text.hint : text.off}</p>
  </div>
  <div class="offers">
    {#each products as product (product.id)}
      <button type="button" class="offer" class:best={product.id === bestId} class:off={!enabled} disabled={!enabled || Boolean(busy)} on:click={() => buy(product)}>
        {#if product.id === bestId}<span class="ribbon">{text.best}</span>{/if}
        <strong>{product.coins.toLocaleString(language)}</strong>
        <small>coins</small>
        <span class="price">{price(product.priceCents)}</span>
        <b>{!enabled ? text.soon : busy === product.id ? '…' : text.buy}</b>
      </button>
    {/each}
  </div>
  <p class="hint small">{text.adult} <a href="/suporte?tipo=compra">{text.help}</a> · <a href="/terms">{text.terms}</a></p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  .buy { display: grid; gap: 14px; padding: 22px; scroll-margin-top: 150px; }
  .head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 6px 24px; }
  .head .hint { max-width: 460px; }
  h2 { margin: 4px 0 0; }
  .hint { margin: 0; color: var(--muted); font-size: .82rem; line-height: 1.5; } .hint.small { font-size: .7rem; }
  .offers { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .offer { position: relative; display: grid; gap: 4px; justify-items: center; padding: 20px 12px 12px; border: 1px solid var(--line); border-radius: 0; background: linear-gradient(160deg, var(--surface-2), var(--surface)); color: var(--text); cursor: pointer; font: inherit; }
  .offer:hover:not(:disabled) { border-color: var(--accent); }
  .offer:disabled { cursor: default; }
  .offer.best { border-color: #d9a441; box-shadow: 0 0 22px color-mix(in srgb, #d9a441 18%, transparent); }
  .offer strong { color: var(--accent); font: 900 2rem/1 'Arial Narrow', Impact, sans-serif; font-variant-numeric: tabular-nums; }
  .offer small { color: var(--muted); font-size: .62rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .offer .price { margin-top: 6px; font-size: .95rem; font-weight: 900; }
  .offer b { align-self: end; width: 100%; margin-top: 6px; padding: 9px 8px; background: var(--accent); color: #0a0d08; font-size: .68rem; letter-spacing: .06em; text-transform: uppercase; }
  .offer.off b { background: transparent; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); }
  .ribbon { position: absolute; top: -9px; padding: 2px 8px; background: #d9a441; color: #0a0d08; font-size: .56rem; font-weight: 900; text-transform: uppercase; }
  .hint a { color: var(--accent); font-weight: 700; }
  .error { margin: 0; color: #ff9b90; font-size: .8rem; }
  @media (max-width: 860px) { .offers { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 720px) {
    .buy { padding: 14px; gap: 12px; }
    .offers { gap: 8px; }
    .offer { padding: 16px 8px 8px; }
    .offer strong { font-size: 1.6rem; }
  }
</style>
