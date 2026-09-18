<script lang="ts">
  import { CARDS_PER_PACK, COACH_CHANCE, PACK_SLOTS, RARITIES, type PackTier, type Rarity, type RarityOdds } from '$lib/game/online/collection-rules';

  /** The ⓘ in the corner of a pack: hover or focus previews the odds on desktop, a click or tap pins them (bottom sheet on phones). */
  export let tier: PackTier;
  export let title: string;
  export let labels: { heading: string; first: string; others: string; all: string; coach: string; note: string; close: string };

  const COLOR: Record<Rarity, string> = { common: '#8d979e', rare: '#4da3ff', elite: '#a66bff', superstar: '#ff8a3d', legend: '#d9a441', goat: '#ff5ad8' };
  let hovered = false;
  let pinned = false;
  let root: HTMLElement;
  $: open = hovered || pinned;

  const [first, ...rest] = PACK_SLOTS[tier];
  const uniform = rest.every((row) => row === first);
  $: blocks = (uniform ? [{ label: labels.all, row: first }] : [{ label: labels.first, row: first }, { label: labels.others, row: rest[0] }]) as Array<{ label: string; row: RarityOdds }>;
  const shown = (row: RarityOdds) => RARITIES.filter((rarity) => row[rarity] > 0);
  const format = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}%`;

  function onWindowClick(event: MouseEvent) { if (pinned && root && !root.contains(event.target as Node)) pinned = false; }
  function onKey(event: KeyboardEvent) { if (event.key === 'Escape') { pinned = false; hovered = false; } }
</script>

<svelte:window on:click={onWindowClick} on:keydown={onKey} />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<span class="odds-root" bind:this={root} on:mouseenter={() => hovered = true} on:mouseleave={() => hovered = false}>
  <button type="button" class="info" aria-label={`${labels.heading}: ${title}`} aria-expanded={open} on:click|stopPropagation={() => pinned = !pinned} on:focus={() => hovered = true} on:blur={() => hovered = false}>i</button>
  {#if open}
    <div class="sheet" role="dialog" aria-label={`${labels.heading}: ${title}`}>
      <header><strong>{title}</strong><span>{labels.heading} · {CARDS_PER_PACK}×</span></header>
      {#each blocks as block}
        <div class="block">
          <small>{block.label}</small>
          <ul>
            {#each shown(block.row) as rarity}
              <li><span class="name" style={`color:${COLOR[rarity]}`}>{rarity}</span><span class="bar"><i style={`width:${Math.max(2, block.row[rarity])}%;background:${COLOR[rarity]}`}></i></span><b>{format(block.row[rarity])}</b></li>
            {/each}
          </ul>
        </div>
      {/each}
      <p>{labels.coach}: <b>{Math.round(COACH_CHANCE[tier] * 100)}%</b></p>
      <p>{labels.note}</p>
      <button type="button" class="close" on:click|stopPropagation={() => { pinned = false; hovered = false; }}>{labels.close}</button>
    </div>
  {/if}
</span>

<style>
  .odds-root { position: absolute; top: 8px; right: 8px; z-index: 3; }
  .info { display: grid; place-items: center; width: 24px; height: 24px; min-height: 0; padding: 0; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); color: var(--muted); font: italic 700 .8rem Georgia, serif; cursor: pointer; }
  .info:hover, .info[aria-expanded='true'] { border-color: var(--accent); color: var(--accent); }
  .sheet { position: absolute; top: 30px; right: 0; display: grid; gap: 10px; width: 270px; padding: 14px; border: 1px solid var(--accent); background: var(--surface); box-shadow: 0 14px 40px rgb(0 0 0 / .55); text-align: left; }
  header { display: grid; gap: 2px; } header strong { font-size: 1rem; text-transform: uppercase; letter-spacing: .04em; } header span { color: var(--muted); font-size: .62rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .block { display: grid; gap: 5px; } .block small { color: var(--accent); font-size: .62rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  ul { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
  li { display: grid; grid-template-columns: 74px minmax(0, 1fr) 46px; gap: 8px; align-items: center; font-size: .72rem; }
  .name { font-weight: 800; text-transform: uppercase; font-size: .62rem; letter-spacing: .04em; }
  .bar { height: 6px; background: var(--surface-2); } .bar i { display: block; height: 100%; }
  li b { text-align: right; }
  p { margin: 0; color: var(--muted); font-size: .68rem; line-height: 1.4; } p b { color: var(--text); }
  .close { display: none; }
  @media (max-width: 720px) {
    .sheet { position: fixed; inset: auto 0 0 0; top: auto; width: auto; padding: 18px 16px 22px; border-width: 1px 0 0; z-index: 40; }
    .close { display: block; min-height: 44px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: inherit; font-weight: 800; text-transform: uppercase; }
  }
</style>
