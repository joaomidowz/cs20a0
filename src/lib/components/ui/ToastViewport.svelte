<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { language } from '$lib/game/pageState';
  import { dismissToast, toastNotices } from '$lib/game/notifications';
  import { playGameSound } from '$lib/game/offlineAudio';

  // Transições (não keyframes): toasts empilham rápido e precisam retomar do estado atual, e a pilha desliza com flip.
  let reducedMotion = typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const dismissLabel = () => $language === 'pt-BR' ? 'Fechar aviso' : $language === 'es' ? 'Cerrar aviso' : 'Dismiss notification';

  onMount(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => reducedMotion = query.matches;
    query.addEventListener('change', updateMotion);
    let ready = false;
    let seen = new Set<number>();
    const unsubscribe = toastNotices.subscribe((notices) => {
      if (!ready) { seen = new Set(notices.map((notice) => notice.id)); ready = true; return; }
      for (const notice of notices) {
        if (seen.has(notice.id)) continue;
        if (notice.kind === 'error' || notice.kind === 'warning') playGameSound('error');
        else if (notice.kind === 'success') playGameSound('success');
      }
      seen = new Set(notices.map((notice) => notice.id));
    });
    return () => { unsubscribe(); query.removeEventListener('change', updateMotion); };
  });
</script>

<aside class="toast-viewport" aria-label={$language === 'pt-BR' ? 'Notificações' : $language === 'es' ? 'Notificaciones' : 'Notifications'}>
  {#each $toastNotices as notice (notice.id)}
    <div class="toast" class:success={notice.kind === 'success'} class:info={notice.kind === 'info'} class:warning={notice.kind === 'warning'} class:error={notice.kind === 'error'} role={notice.kind === 'error' ? 'alert' : 'status'}
      in:fly={{ x: reducedMotion ? 0 : 24, duration: reducedMotion ? 120 : 220, easing: cubicOut }} out:fade={{ duration: 120 }} animate:flip={{ duration: reducedMotion ? 0 : 160, easing: cubicOut }}>
      <span class="mark" aria-hidden="true">{notice.kind === 'success' ? '✓' : notice.kind === 'error' ? '!' : notice.kind === 'warning' ? '⚠' : 'i'}</span>
      <span class="message">{notice.message}</span>
      <button type="button" aria-label={dismissLabel()} on:click={() => dismissToast(notice.id)}>×</button>
    </div>
  {/each}
</aside>

<style>
  /* Canto superior direito (2026-09-27): embaixo o online tem a barra de navegação fixa no celular e os botões da partida. */
  .toast-viewport { position: fixed; z-index: 250; right: max(18px, env(safe-area-inset-right)); top: max(14px, env(safe-area-inset-top)); display: grid; gap: 9px; width: min(390px, calc(100vw - 28px)); pointer-events: none; }
  .toast { position: relative; left: auto; right: auto; bottom: auto; z-index: auto; transform: none; display: grid; grid-template-columns: 28px minmax(0, 1fr) 28px; align-items: center; gap: 10px; min-height: 56px; padding: 10px 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: inherit; font-weight: inherit; letter-spacing: normal; text-transform: none; box-shadow: var(--shadow, 0 12px 36px rgb(0 0 0 / 32%)); pointer-events: auto; }
  .mark { display: grid; place-items: center; width: 26px; height: 26px; border: 1px solid currentColor; border-radius: 50%; font-size: .85rem; font-weight: 900; }
  .message { font-size: .78rem; font-weight: 800; line-height: 1.4; }
  .toast button { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; background: transparent; color: currentColor; font-size: 1.2rem; cursor: pointer; }
  .toast button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .success { border-left: 3px solid var(--accent); }
  .success .mark { color: var(--accent); }
  .info { border-left: 3px solid #69b7ff; }
  .info .mark { color: #69b7ff; }
  .warning { border-left: 3px solid #ffd36b; }
  .warning .mark { color: #ffd36b; }
  .error { border-left: 3px solid var(--danger, #ff7063); }
  .error .mark { color: var(--danger, #ff7063); }
  @media (max-width: 560px) { .toast-viewport { right: max(12px, env(safe-area-inset-right)); top: max(10px, env(safe-area-inset-top)); width: calc(100vw - 24px); } }
</style>
