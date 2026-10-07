<script lang="ts">
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import type { PromoLinkInfo } from '$lib/game/online/promo-links';
  import type { Language } from '$lib/game/types';

  /** O presente do link promocional: prêmio em coins, vagas restantes, para quem vale. Os botões vêm pelo slot. */
  export let code: string;
  export let info: PromoLinkInfo | null = null;
  export let notFound = false;
  export let language: Language = 'pt-BR';
  export let compact = false;

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: coins = info ? info.coins.toLocaleString(language) : '';
</script>

<section class="promo-banner panel" class:compact class:dead={notFound || (info && !info.active)}>
  <div class="promo-glow" aria-hidden="true"></div>
  <span class="eyebrow">{t('promoLinkTitle')} · {code}</span>
  {#if notFound}
    <h2>{t('promoLinkInvalid')}</h2>
  {:else if info}
    <strong class="gift">{t('promoLinkGift').replace('{coins}', coins)}</strong>
    <div class="meta">
      <span class="spots" class:gone={info.remaining === 0}>{info.active ? t('promoLinkSpots').replace('{left}', String(info.remaining)).replace('{total}', String(info.total)) : info.remaining === 0 ? t('promoLinkSoldOut') : t('promoLinkExpired')}</span>
      <span>{info.newAccountsOnly ? t('promoLinkNewOnly') : t('promoLinkAnyAccount')}</span>
      {#if info.expiresAt && info.active}<span>{t('promoLinkExpires').replace('{date}', new Date(info.expiresAt).toLocaleDateString(language))}</span>{/if}
    </div>
    {#if !compact}<p class="hint">{t('promoLinkStoriesHint')}</p>{/if}
  {:else}
    <strong class="gift">…</strong>
  {/if}
  <slot />
</section>

<style>
  .promo-banner { position: relative; display: grid; gap: 8px; padding: 22px; overflow: hidden; border-color: var(--accent); }
  .promo-glow { position: absolute; inset: -40% -20% auto; height: 160%; background: radial-gradient(ellipse at top, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%); pointer-events: none; animation: promoGlow 3.2s ease-in-out infinite; }
  .promo-banner > :not(.promo-glow) { position: relative; }
  .promo-banner h2 { margin: 0; }
  .gift { color: var(--accent); font: 900 clamp(2.2rem, 1.6rem + 3vw, 3.6rem)/1 'Arial Narrow', Impact, sans-serif; letter-spacing: .01em; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--muted); font-size: .78rem; font-weight: 700; }
  .spots { color: var(--text); }
  .spots.gone { color: var(--accent-2); }
  .hint { margin: 0; color: var(--muted); font-size: .82rem; line-height: 1.5; }
  .dead { border-color: var(--line); } .dead .gift { color: var(--muted); } .dead .promo-glow { display: none; }
  .compact { padding: 14px 16px; gap: 4px; } .compact .gift { font-size: clamp(1.6rem, 1.2rem + 1.5vw, 2.2rem); }
  @keyframes promoGlow { 50% { opacity: .55; } }
  @media (prefers-reduced-motion: reduce) { .promo-glow { animation: none; } }
</style>
