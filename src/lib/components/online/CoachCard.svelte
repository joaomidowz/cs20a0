<script lang="ts">
  import TeamBadge from '../TeamBadge.svelte';
  import { rarityOf } from '$lib/game/online/collection-rules';
  import type { Coach } from '$lib/game/types';

  /** Coach card of the collection: same frame as the players, with the four coaching attributes instead of the role. */
  export let coach: Coach;
  export let teamName = '';
  export let active = false;
  export let tag = '';
  export let affinity = false;

  $: rarity = rarityOf(coach);
  const ATTRS = [['tactics', 'TAC'], ['discipline', 'DIS'], ['aggression', 'AGR'], ['development', 'DEV']] as const;
</script>

<article class="card rarity-{rarity}" class:active class:affinity>
  {#if tag}<b class="tag">{tag}</b>{/if}
  <div class="face">
    <span class="top"><span class="kind">COACH</span><span class="ovr"><small>OVR</small>{coach.overall}</span></span>
    <span class="rarity">{rarity}</span>
    <strong class="name">{coach.name}</strong>
    <span class="team"><TeamBadge id={coach.teamId} name={teamName} size="sm" /><em>{teamName || '—'} · {coach.year}</em></span>
    <ul class="attrs">{#each ATTRS as [key, label]}<li><span>{label}</span><i style={`--v:${coach[key]}%`}></i><b>{coach[key]}</b></li>{/each}</ul>
  </div>
  {#if $$slots.default}<footer><slot /></footer>{/if}
</article>

<style>
  .card { --rarity: var(--line); position: relative; display: grid; min-width: 0; border: 1px solid var(--rarity); background: linear-gradient(165deg, color-mix(in srgb, var(--rarity) 14%, var(--surface-2)), var(--surface)); }
  .rarity-rare { --rarity: #4f8cff; } .rarity-elite { --rarity: #a66bff; } .rarity-superstar { --rarity: #ff7a45; } .rarity-legend { --rarity: #f2c14e; } .rarity-goat { --rarity: #ff4d6d; }
  .face { display: grid; gap: 6px; padding: 12px; }
  .top { display: flex; justify-content: space-between; align-items: start; }
  .kind { padding: 3px 7px; border: 1px solid var(--accent); color: var(--accent); font-size: .56rem; font-weight: 900; letter-spacing: .14em; }
  .ovr { display: grid; justify-items: end; color: var(--accent); font: 900 2rem/1 'Arial Narrow', Impact, sans-serif; } .ovr small { color: var(--muted); font: 700 .5rem Inter, Arial, sans-serif; }
  .rarity { color: color-mix(in srgb, var(--rarity) 75%, var(--text)); font-size: .56rem; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
  .name { overflow: hidden; font: 800 1.3rem/1.1 'Arial Narrow', Impact, sans-serif; text-overflow: ellipsis; white-space: nowrap; }
  .team { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 5px 6px; border: 1px solid color-mix(in srgb, var(--line) 80%, transparent); color: var(--muted); font-size: .66rem; }
  .team em { overflow: hidden; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
  .attrs { display: grid; gap: 3px; margin: 2px 0 0; padding: 0; list-style: none; }
  .attrs li { display: grid; grid-template-columns: 30px minmax(0, 1fr) 22px; gap: 6px; align-items: center; font-size: .6rem; }
  .attrs span { color: var(--muted); font-weight: 800; } .attrs b { text-align: right; }
  .attrs i { height: 4px; background: linear-gradient(90deg, var(--accent) var(--v), var(--line) var(--v)); }
  footer { display: flex; gap: 4px; padding: 0 12px 12px; } footer :global(button) { flex: 1; }
  .tag { position: absolute; top: -9px; left: 10px; z-index: 2; padding: 3px 8px; background: var(--accent); color: #0a0d08; font-size: .56rem; font-weight: 900; letter-spacing: .14em; }
  .active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .affinity { box-shadow: 0 0 0 1px var(--accent), 0 0 24px color-mix(in srgb, var(--accent) 30%, transparent); }
</style>
