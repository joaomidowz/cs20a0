<script lang="ts">
  // Dropdown estilizado no padrão do app (cromo do .filters/.slot + interação do PackSelect).
  // Opção com value '' = "todas"/sem escolha, como os <select> nativos que substitui.
  type Option = { value: string; label: string; caption?: string };
  export let options: Option[] = [];
  export let value = '';
  export let onSelect: (value: string) => void = () => {};
  export let label = '';
  export let ariaLabel = '';
  export let placeholder = '';
  export let disabled = false;
  let expanded = false;
  let root: HTMLDivElement;
  let trigger: HTMLButtonElement;
  $: selected = options.find((option) => option.value === value);
  function choose(next: string) { onSelect(next); expanded = false; trigger.focus(); }
  function outside(event: PointerEvent) { if (root && !root.contains(event.target as Node)) expanded = false; }
</script>

<svelte:window on:pointerdown={outside} on:keydown={(event) => { if (expanded && event.key === 'Escape') { expanded = false; trigger.focus(); } }} />
<div class="styled-select" class:expanded bind:this={root}>
  {#if label}<span class="select-label">{label}</span>{/if}
  <button bind:this={trigger} class="trigger" type="button" {disabled} aria-expanded={expanded} aria-label={ariaLabel || undefined} on:click={() => (expanded = !expanded)}>
    <span class="value" class:muted={!selected}>{selected?.label ?? placeholder}</span>
    {#if selected?.caption}<small>{selected.caption}</small>{/if}
    <span class="arrow" aria-hidden="true">⌄</span>
  </button>
  {#if expanded}
    <div class="menu">
      {#each options as option (option.value)}
        <button class="option" class:chosen={option.value === value} type="button" aria-pressed={option.value === value} on:click={() => choose(option.value)}>
          <span class="option-label">{option.label}</span>
          {#if option.caption}<small>{option.caption}</small>{/if}
          {#if option.value === value}<span class="check" aria-hidden="true">✓</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .styled-select { position: relative; width: 100%; min-width: 0; text-align: left; }
  .select-label { display: block; margin-bottom: 5px; color: var(--muted); font-size: .58rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
  .trigger { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 42px; padding: 0 10px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: inherit; font-weight: 700; cursor: pointer; transition: border-color .18s ease; }
  .trigger:hover, .expanded .trigger { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .78rem; text-align: left; }
  .value.muted { color: var(--muted); font-weight: 600; }
  .trigger small { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .04em; white-space: nowrap; }
  .arrow { flex: none; color: var(--muted); font-size: 1rem; transition: transform .18s ease; }
  .expanded .arrow { transform: rotate(180deg); color: var(--accent); }
  .menu { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 40; max-height: 280px; overflow-y: auto; overscroll-behavior: contain; padding: 6px; border: 1px solid var(--line); background: var(--surface); box-shadow: 0 16px 45px #0009; }
  .option { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 42px; padding: 8px 10px; border: 1px solid transparent; background: transparent; color: var(--text); font: inherit; font-size: .78rem; font-weight: 600; text-align: left; cursor: pointer; }
  .option:hover { border-color: var(--line); background: var(--surface-2); }
  .option.chosen { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 13%, var(--surface)); color: var(--accent); }
  .option-label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .option small { flex: none; margin-left: auto; color: var(--muted); font-size: .58rem; font-weight: 800; letter-spacing: .04em; white-space: nowrap; }
  .option.chosen small { color: inherit; }
  .check { flex: none; color: var(--accent); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
