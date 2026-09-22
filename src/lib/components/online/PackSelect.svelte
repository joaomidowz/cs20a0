<script lang="ts">
  type Option = { key: string | number; name: string; tone?: string; caption?: string };
  export let options: Option[];
  export let value: string | number;
  export let onSelect: (value: string | number) => void;
  export let label: string;
  export let searchLabel: string;
  export let emptyLabel: string;
  export let tone = 'standard';
  export let disabled = false;
  let expanded = false;
  let query = '';
  let root: HTMLDivElement;
  let trigger: HTMLButtonElement;
  $: selected = options.find((item) => item.key === value);
  $: filteredOptions = options.filter((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  function choose(key: string | number) { if (disabled) return; onSelect(key); expanded = false; query = ''; trigger.focus(); }
  function outside(event: PointerEvent) { if (root && !root.contains(event.target as Node)) expanded = false; }
</script>

<svelte:window on:pointerdown={outside} on:keydown={(event) => { if (expanded && event.key === 'Escape') { expanded = false; trigger.focus(); } }} />
<div class="picker {selected?.tone ?? tone}" bind:this={root}>
  <span class="label">{label}</span>
  <button bind:this={trigger} class="trigger" type="button" {disabled} aria-expanded={expanded} on:click={() => { expanded = !expanded; query = ''; }}>
    <span class="gem" aria-hidden="true">◆</span><span class="selected"><b>{selected?.name ?? label}</b><small>{selected?.caption ?? ''}</small></span><span class="arrow" aria-hidden="true">⌄</span>
  </button>
  {#if expanded}
    <div class="dropdown">
      <input type="search" bind:value={query} placeholder={searchLabel} aria-label={searchLabel} />
      <div class="options">
        {#each filteredOptions as option (option.key)}
          <button class="option {option.tone ?? tone}" class:chosen={option.key === value} type="button" aria-pressed={option.key === value} on:click={() => choose(option.key)}>
            <span class="gem" aria-hidden="true">◆</span><span class="option-name">{option.name}</span><small>{option.caption ?? ''}</small>{#if option.key === value}<span aria-hidden="true">✓</span>{/if}
          </button>
        {:else}<p>{emptyLabel}</p>{/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .standard { --rarity: #aab8c6; --halo: 0%; } .elite { --rarity: #b68aff; --halo: 14%; } .legendary { --rarity: #f2c14e; --halo: 25%; }
  .function { --rarity: #5dffbf; --halo: 14%; } .era { --rarity: #a66bff; --halo: 18%; }
  .picker { position: relative; width: 100%; min-width: 0; text-align: left; }
  .label { display: block; margin-bottom: 7px; color: var(--muted); font-size: .58rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
  .trigger { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 62px; padding: 10px 14px; border: 1px solid color-mix(in srgb, var(--rarity) 55%, var(--line)); background: linear-gradient(110deg, color-mix(in srgb, var(--rarity) 12%, var(--surface)), var(--surface)); color: var(--text); text-align: left; cursor: pointer; box-shadow: inset 0 0 20px color-mix(in srgb, var(--rarity) var(--halo), transparent), 0 0 16px color-mix(in srgb, var(--rarity) var(--halo), transparent); }
  .selected { display: grid; flex: 1; min-width: 0; gap: 5px; } .selected b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .85rem; }
  small { color: var(--rarity); font-size: .54rem; font-weight: 800; letter-spacing: .1em; }
  .gem { color: var(--rarity); text-shadow: 0 0 12px color-mix(in srgb, var(--rarity) var(--halo), transparent); } .arrow { color: var(--rarity); font-size: 1.2rem; }
  .dropdown { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 30; padding: 8px; border: 1px solid var(--rarity); background: var(--surface); box-shadow: 0 16px 45px #0009; }
  input { box-sizing: border-box; width: 100%; min-height: 40px; padding: 8px 10px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: inherit; font-size: .8rem; }
  .options { max-height: 280px; overflow-y: auto; overscroll-behavior: contain; margin-top: 6px; }
  .option { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 46px; padding: 10px 8px; border: 1px solid transparent; border-bottom-color: var(--line); background: linear-gradient(100deg, color-mix(in srgb, var(--rarity) var(--halo), var(--surface)), var(--surface)); color: var(--text); text-align: left; cursor: pointer; }
  .option-name { flex: 1; font-size: .76rem; overflow-wrap: anywhere; } .option small { font-size: .48rem; letter-spacing: .03em; }
  .option:hover, .option.chosen { border-color: var(--rarity); } button:focus-visible, input:focus-visible { outline: 2px solid var(--rarity); outline-offset: 2px; }
  p { color: var(--muted); padding: 8px; font-size: .8rem; }
</style>
