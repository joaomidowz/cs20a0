<script context="module" lang="ts">
  type Product = { id: string; coins: number; priceCents: number; currency: string };
  // One fetch per visit: the account and the collection pages share the list. Prices shown here are display only,
  // the server charges what its own table says for the product id.
  let cached: { url: string; at: number; products: Product[] } | null = null;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { AccountError, authFetch } from '$lib/game/online/account';

  export let serverUrl: string;
  export let language: string = 'pt-BR';

  let products: Product[] = [];
  let busy = '';
  let error = '';

  const TEXT = {
    'pt-BR': { title: 'Comprar coins', hint: 'Pagamento pelo Mercado Pago (Pix ou cartão). As coins caem na conta assim que o pagamento é aprovado.', buy: 'Comprar', adult: 'Compras só para maiores de 18 anos ou com autorização do responsável. Coins não têm valor em dinheiro e não são reembolsáveis depois de usadas.', fail: 'Não foi possível abrir o pagamento.', limit: 'Limite diário de compras atingido.', blocked: 'Compras bloqueadas nesta conta. Fale com o suporte.', best: 'Melhor valor' },
    en: { title: 'Buy coins', hint: 'Paid through Mercado Pago (Pix or card). Coins land in your account as soon as the payment is approved.', buy: 'Buy', adult: 'Purchases only for 18+ or with a guardian\'s permission. Coins have no cash value and are not refundable once used.', fail: 'Could not open the payment.', limit: 'Daily purchase limit reached.', blocked: 'Purchases are blocked on this account. Contact support.', best: 'Best value' },
    es: { title: 'Comprar coins', hint: 'Pago por Mercado Pago (Pix o tarjeta). Las coins llegan a tu cuenta cuando se aprueba el pago.', buy: 'Comprar', adult: 'Compras solo para mayores de 18 o con autorización del responsable. Las coins no tienen valor en dinero y no se reembolsan una vez usadas.', fail: 'No se pudo abrir el pago.', limit: 'Límite diario de compras alcanzado.', blocked: 'Compras bloqueadas en esta cuenta. Contacta al soporte.', best: 'Mejor valor' }
  } as const;
  $: text = TEXT[(language in TEXT ? language : 'pt-BR') as keyof typeof TEXT];
  const price = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  $: bestId = products.reduce<Product | null>((best, item) => (!best || item.coins / item.priceCents > best.coins / best.priceCents ? item : best), null)?.id;

  onMount(async () => {
    if (cached && cached.url === serverUrl && Date.now() - cached.at < 60_000) { products = cached.products; return; }
    try {
      const result = await authFetch<{ products: Product[] }>(serverUrl, '/shop/products', { method: 'GET' });
      products = result.products.filter((item) => item.coins > 0 && item.priceCents > 0);
      cached = { url: serverUrl, at: Date.now(), products };
    } catch {
      products = []; // Payments off on this server: the section stays hidden.
    }
  });

  async function buy(product: Product) {
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

{#if products.length}
  <section class="panel buy" id="comprar-coins">
    <div><span class="eyebrow">MERCADO PAGO</span><h2>{text.title}</h2><p class="hint">{text.hint}</p></div>
    <div class="offers">
      {#each products as product (product.id)}
        <button type="button" class="offer" class:best={product.id === bestId} disabled={Boolean(busy)} on:click={() => buy(product)}>
          {#if product.id === bestId}<span class="ribbon">{text.best}</span>{/if}
          <strong>{product.coins.toLocaleString(language)}</strong>
          <small>coins</small>
          <b>{busy === product.id ? '…' : `${text.buy} · ${price(product.priceCents)}`}</b>
        </button>
      {/each}
    </div>
    <p class="hint small">{text.adult}</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </section>
{/if}

<style>
  .buy { display: grid; gap: 16px; padding: 22px; }
  h2 { margin: 4px 0; }
  .hint { margin: 0; color: var(--muted); font-size: .82rem; line-height: 1.5; } .hint.small { font-size: .7rem; }
  .offers { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .offer { position: relative; display: grid; gap: 4px; justify-items: center; padding: 20px 12px 14px; border: 1px solid var(--line); background: linear-gradient(160deg, var(--surface-2), var(--surface)); color: var(--text); cursor: pointer; font: inherit; }
  .offer:hover:not(:disabled) { border-color: var(--accent); }
  .offer.best { border-color: #d9a441; box-shadow: 0 0 22px color-mix(in srgb, #d9a441 18%, transparent); }
  .offer strong { color: var(--accent); font: 900 2rem/1 'Arial Narrow', Impact, sans-serif; }
  .offer small { color: var(--muted); font-size: .62rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .offer b { margin-top: 8px; padding: 8px 12px; background: var(--accent); color: #0a0d08; font-size: .72rem; text-transform: uppercase; }
  .ribbon { position: absolute; top: -9px; padding: 2px 8px; background: #d9a441; color: #0a0d08; font-size: .56rem; font-weight: 900; text-transform: uppercase; }
  .error { margin: 0; color: #ff9b90; font-size: .8rem; }
</style>
