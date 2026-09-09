<script lang="ts">
  import { translate } from '$lib/game/i18n';
  import type { StrategicAutomationPreferences } from '$lib/game/preferences';
  import type { Language } from '$lib/game/types';

  export let value: StrategicAutomationPreferences;
  export let onChange: (value: StrategicAutomationPreferences) => void;
  export let language: Language = 'pt-BR';

  const controls = [
    { key: 'autoMapPicksAndVetos', label: 'gearPicksBans', hint: 'gearPicksBansHint' },
    { key: 'autoPause', label: 'gearPause', hint: 'gearPauseHint' },
    { key: 'autoEconomy', label: 'gearEconomy', hint: 'gearEconomyHint' },
    { key: 'simpleFeed', label: 'gearSimple', hint: 'gearSimpleHint' }
  ] as const;

  let root: HTMLDivElement;
  let open = false;
  let pinned = false;
  let alignLeft = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  function cancelClose() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
  }
  /** Desktop: abre ao passar o mouse. Toque não dispara hover, só o clique. */
  /** Abre para o lado com espaço: engrenagem na metade esquerda da tela abre a caixa para a direita. */
  function show() {
    const rect = root?.getBoundingClientRect();
    alignLeft = Boolean(rect) && rect.left + rect.width / 2 < window.innerWidth / 2;
    open = true;
  }
  function enter(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    cancelClose();
    show();
  }
  function leave(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || pinned) return;
    cancelClose();
    closeTimer = setTimeout(() => { open = false; }, 140);
  }
  function toggle() {
    cancelClose();
    if (open && pinned) { open = false; pinned = false; }
    else { show(); pinned = true; }
  }
  function close() {
    cancelClose();
    open = false;
    pinned = false;
  }
  function onWindowPointerDown(event: PointerEvent) {
    if (open && root && !root.contains(event.target as Node)) close();
  }
  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !open) return;
    close();
    root.querySelector('button')?.focus();
  }
  function flip(key: keyof StrategicAutomationPreferences) {
    onChange({ ...value, [key]: !value[key] });
  }
</script>

<svelte:window on:pointerdown={onWindowPointerDown} on:keydown={onWindowKeydown} />

<div class="automation-gear" role="group" aria-label={t('gearAutomation')} bind:this={root} on:pointerenter={enter} on:pointerleave={leave}>
  <button class="gear-button" type="button" aria-label={t('gearAutomation')} aria-haspopup="dialog" aria-expanded={open} on:click={toggle}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  </button>
  {#if open}
    <div class="gear-popover" class:left={alignLeft} role="dialog" aria-label={t('gearAutomation')}>
      <div class="gear-panel">
        <span class="eyebrow">{t('gearSettings')}</span>
        {#each controls as control (control.key)}
          <div class="gear-row">
            <div class="gear-copy"><strong>{t(control.label)}</strong><small>{t(control.hint)}</small></div>
            <button class="switch" type="button" role="switch" aria-checked={value[control.key]} aria-label={t(control.label)} on:click={() => flip(control.key)}>
              <em>{value[control.key] ? 'ON' : 'OFF'}</em><i><span></span></i>
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .automation-gear{position:relative;display:flex;flex:none}
  .gear-button{display:inline-flex;align-items:center;justify-content:center;width:auto;height:100%;min-height:var(--gear-size,48px);aspect-ratio:1/1;padding:0;border:1px solid var(--line);border-radius:2px;color:var(--muted);background:var(--surface-2);cursor:pointer;transition:color .18s ease,border-color .18s ease}
  .gear-button:hover,.gear-button[aria-expanded="true"]{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}
  .gear-button svg{width:20px;height:20px;transition:transform .35s ease}
  .gear-button[aria-expanded="true"] svg{transform:rotate(60deg)}
  .gear-popover{position:absolute;z-index:40;right:0;top:100%;width:min(320px,calc(100vw - 32px));padding-top:8px}
  .gear-popover.left{right:auto;left:0}
  .gear-panel{display:grid;gap:14px;padding:16px;border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow)}
  .gear-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px}
  .gear-copy{display:grid;gap:3px;min-width:0}
  .gear-copy strong{font:800 .72rem/1.2 Inter,Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase}
  .gear-copy small{color:var(--muted);font-size:.66rem;line-height:1.35}
  .switch{display:inline-flex;align-items:center;gap:8px;padding:0;border:0;background:transparent;color:var(--muted);cursor:pointer}
  .switch em{min-width:26px;font:800 .62rem/1 Inter,Arial,sans-serif;font-style:normal;letter-spacing:.1em;text-align:right;transition:color .18s ease}
  .switch i{position:relative;display:block;width:46px;height:26px;border:1px solid var(--line);border-radius:20px;background:var(--surface-2);transition:.18s ease}
  .switch i span{position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:var(--muted);transition:.18s ease}
  .switch[aria-checked="true"]{color:var(--accent)}
  .switch[aria-checked="true"] i{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,var(--surface-2))}
  .switch[aria-checked="true"] i span{left:23px;background:var(--accent);box-shadow:0 0 12px color-mix(in srgb,var(--accent) 60%,transparent)}
  @media (max-width:679px){.gear-panel{gap:12px;padding:14px}.switch i{width:50px;height:28px}.switch i span{width:20px;height:20px}.switch[aria-checked="true"] i span{left:25px}}
</style>
