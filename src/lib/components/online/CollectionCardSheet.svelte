<script lang="ts">
  import { onMount } from 'svelte';
  import CollectionCard from './CollectionCard.svelte';
  import { coinValue, rarityOf, sellValue } from '$lib/game/online/collection-rules';
  import { eligibleRolesOf } from '$lib/game/online/collection-lineup';
  import { getRoleLabel } from '$lib/game/roleRules';
  import type { Language, Player } from '$lib/game/types';

  /** Card details in the collection: the big card on the left, every attribute, roles, awards and value on the right. */
  export let player: Player;
  export let teamName = '';
  export let language: Language = 'en';
  export let labels: { close: string; attributes: string; roles: string; awards: string; value: string; sell: string; coins: string };
  export let onClose: () => void = () => {};

  const ATTRIBUTES: Array<[keyof Player, string]> = [['firepower', 'Firepower'], ['entry', 'Entry'], ['awp', 'AWP'], ['clutch', 'Clutch'], ['support', 'Support'], ['igl', 'IGL'], ['consistency', 'Consistency'], ['mental', 'Mental'], ['experience', 'Experience']];
  $: rarity = rarityOf(player);
  $: awards = [...new Set(player.awardBadges ?? [])];
  let closeButton: HTMLButtonElement;
  onMount(() => closeButton?.focus());
</script>

<svelte:window on:keydown={(event) => { if (event.key === 'Escape') onClose(); }} />

<div class="cs-backdrop" role="presentation" on:click={onClose}>
  <div class="cs-sheet rarity-{rarity}" role="dialog" aria-modal="true" aria-label={player.nickname ?? player.id} tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
    <button class="cs-close" type="button" bind:this={closeButton} aria-label={labels.close} on:click={onClose}>×</button>
    <div class="cs-card"><CollectionCard showcase {player} {teamName} {language} /></div>
    <div class="cs-info">
      <h3>{labels.attributes}</h3>
      <ul class="cs-attributes">
        {#each ATTRIBUTES as [key, label]}
          {@const value = Number(player[key] ?? 0)}
          <li><span>{label}</span><b>{value || '—'}</b><i><u style={`width:${value}%`}></u></i></li>
        {/each}
      </ul>
      <h3>{labels.roles}</h3>
      <p class="cs-chips">{#each eligibleRolesOf(player) as role}<span>{getRoleLabel(role)}</span>{/each}</p>
      {#if awards.length}
        <h3>{labels.awards}</h3>
        <p class="cs-chips gold">{#each awards as award}<span>{award}</span>{/each}</p>
      {/if}
      <p class="cs-value">{labels.value}: <b>{coinValue(player).toLocaleString(language)}</b> {labels.coins} · {labels.sell}: <b>{sellValue(player).toLocaleString(language)}</b></p>
    </div>
  </div>
</div>

<style>
  .cs-backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgb(3 5 6 / .82); overflow-y: auto; }
  .cs-sheet { --rarity: var(--line); position: relative; display: grid; grid-template-columns: minmax(0, 290px) minmax(0, 1fr); gap: 22px; width: min(100%, 780px); padding: 24px; border: 1px solid var(--rarity); background: var(--surface); box-shadow: 0 0 60px color-mix(in srgb, var(--rarity) 25%, transparent); animation: cs-in .25s ease-out; }
  .rarity-rare { --rarity: #4f8cff; } .rarity-elite { --rarity: #a66bff; } .rarity-superstar { --rarity: #ff7a45; } .rarity-legend { --rarity: #f2c14e; } .rarity-goat { --rarity: #ff4d6d; }
  .cs-close { position: absolute; top: 10px; right: 10px; z-index: 2; width: 38px; height: 38px; min-height: 0; padding: 0; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font-size: 1.3rem; cursor: pointer; }
  .cs-card { min-width: 0; }
  .cs-info { display: grid; gap: 10px; align-content: start; min-width: 0; padding-right: 30px; }
  h3 { margin: 6px 0 0; color: var(--muted); font-size: .62rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .cs-attributes { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px 14px; margin: 0; padding: 0; list-style: none; }
  .cs-attributes li { display: grid; grid-template-columns: 1fr auto; gap: 3px 6px; align-items: baseline; font-size: .74rem; }
  .cs-attributes span { color: var(--muted); text-transform: uppercase; font-size: .62rem; font-weight: 700; letter-spacing: .06em; } .cs-attributes b { font: 900 1.1rem/1 'Arial Narrow', Impact, sans-serif; }
  .cs-attributes i { grid-column: 1 / -1; height: 4px; background: var(--surface-2); } .cs-attributes u { display: block; height: 100%; background: var(--rarity); }
  .cs-chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 0; }
  .cs-chips span { padding: 4px 8px; border: 1px solid var(--line); background: var(--surface-2); font-size: .64rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
  .cs-chips.gold span { border-color: #d9a441; color: #ffd36b; background: color-mix(in srgb, #d9a441 12%, transparent); }
  .cs-value { margin: 6px 0 0; padding-top: 10px; border-top: 1px solid var(--line); color: var(--muted); font-size: .78rem; } .cs-value b { color: var(--accent); }
  @keyframes cs-in { from { transform: translateY(14px) scale(.98); opacity: 0; } }
  @media (max-width: 680px) { .cs-sheet { grid-template-columns: 1fr; padding: 18px 14px; } .cs-card { justify-self: center; width: min(100%, 300px); } .cs-info { padding-right: 0; } }
  @media (prefers-reduced-motion: reduce) { .cs-sheet { animation: none; } }
</style>
