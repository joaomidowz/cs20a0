<script lang="ts">
  import PlayerAvatar from '../PlayerAvatar.svelte';
  import TeamBadge from '../TeamBadge.svelte';
  import { rarityOf } from '$lib/game/online/collection-rules';
  import type { Coach } from '$lib/game/types';

  /** Coach card of the collection: same frame as the players, with the four coaching attributes instead of the role. */
  export let coach: Coach;
  export let teamName = '';
  export let active = false;
  export let tag = '';
  export let affinity = false;
  /** Pack reveal: laid out like a player's big card (photo, big OVR, the four attributes in a grid). */
  export let showcase = false;

  $: rarity = rarityOf(coach);
  const ATTRS = [['tactics', 'TAC'], ['discipline', 'DIS'], ['aggression', 'AGR'], ['development', 'DEV']] as const;
</script>

<article class="card rarity-{rarity}" class:active class:affinity class:showcase>
  {#if tag}<b class="tag">{tag}</b>{/if}
  <div class="face">
    {#if showcase}
      <span class="top"><span class="photo"><PlayerAvatar player={{ id: coach.id, baseId: coach.baseId }} bare /></span><span class="ovr"><small>OVR</small>{coach.overall}</span></span>
      <span class="rarity">{rarity} · COACH</span>
      <strong class="name">{coach.name}</strong>
      <span class="role">COACH · {coach.year}</span>
    {:else}
      <span class="top"><span class="kind">COACH</span><span class="ovr"><small>OVR</small>{coach.overall}</span></span>
      <span class="rarity">{rarity}</span>
      <strong class="name">{coach.name}</strong>
    {/if}
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
  .showcase .face { gap: 8px; padding: 16px; }
  .showcase .top { align-items: end; }
  .photo { display: block; width: 58%; aspect-ratio: 1; overflow: hidden; border: 1px solid color-mix(in srgb, var(--rarity) 60%, var(--line)); background: var(--surface-2); }
  .showcase .ovr { font-size: 3.4rem; } .showcase .ovr small { font-size: .62rem; }
  .showcase .rarity { font-size: .66rem; } .showcase .name { font-size: 1.9rem; }
  .role { color: var(--muted); font-size: .7rem; font-weight: 700; text-transform: uppercase; }
  .showcase .team { padding: 7px 8px; font-size: .8rem; }
  .showcase .attrs { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; margin-top: 4px; }
  .showcase .attrs li { grid-template-columns: 1fr auto; gap: 2px 6px; font-size: .56rem; letter-spacing: .1em; }
  .showcase .attrs i { grid-column: 1 / -1; grid-row: 2; height: 3px; background: linear-gradient(90deg, var(--rarity) var(--v), var(--surface) var(--v)); }
  .showcase .attrs b { font: 900 1.05rem/1 'Arial Narrow', Impact, sans-serif; }
  footer { display: flex; gap: 4px; padding: 0 12px 12px; } footer :global(button) { flex: 1; }
  .tag { position: absolute; top: -9px; left: 10px; z-index: 2; padding: 3px 8px; background: var(--accent); color: #0a0d08; font-size: .56rem; font-weight: 900; letter-spacing: .14em; }
  .active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .affinity { box-shadow: 0 0 0 1px var(--accent), 0 0 24px color-mix(in srgb, var(--accent) 30%, transparent); }
</style>
