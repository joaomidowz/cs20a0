<script lang="ts">
  import PlayerAvatar from '../PlayerAvatar.svelte';
  import { collectionCoachById, collectionPlayerById, collectionTeamById } from '$lib/game/online/collection-pool';
  import { primaryRoleOf } from '$lib/game/online/collection-lineup';
  import { rarityOf } from '$lib/game/online/collection-rules';
  import { getRoleLabel } from '$lib/game/roleRules';

  /**
   * Small collection card (player or coach by id): photo, OVR, nick, rarity and year. Built to sit two side by side
   * on a phone without clipping; it never grows past its column.
   */
  export let id: string;
  export let selected = false;
  export let label = '';
  export let onClick: (() => void) | null = null;

  $: player = collectionPlayerById.get(id);
  $: coach = player ? undefined : collectionCoachById.get(id);
  $: card = player ?? coach;
  $: rarity = card ? rarityOf(card) : 'common';
  $: name = player ? player.nickname ?? player.id : coach?.name ?? id;
  $: meta = player ? `${getRoleLabel(primaryRoleOf(player))} · ${player.year ?? '—'}` : coach ? `COACH · ${coach.year}` : '';
  $: team = collectionTeamById.get(player?.teamId ?? coach?.teamId ?? '')?.name ?? '';
</script>

<button type="button" class="mini rarity-{rarity}" class:selected disabled={!onClick} aria-pressed={onClick ? selected : undefined} aria-label={label ? `${label}: ${name}` : name} on:click={() => onClick?.()}>
  <span class="top">
    <span class="photo">{#if card}<PlayerAvatar player={{ id: card.id, baseId: card.baseId }} bare />{/if}</span>
    <span class="ovr"><small>OVR</small>{card?.overall ?? '—'}</span>
  </span>
  <span class="rarity">{rarity}</span>
  <strong class="name">{name}</strong>
  <span class="meta">{meta}</span>
  {#if team}<span class="team">{team}</span>{/if}
</button>

<style>
  .mini { --rarity: var(--line); display: grid; gap: 3px; width: 100%; min-width: 0; padding: clamp(6px, 2vw, 10px); overflow: hidden; border: 1px solid var(--rarity); border-radius: 0; background: linear-gradient(165deg, color-mix(in srgb, var(--rarity) 14%, var(--surface-2)), var(--surface)); color: var(--text); font: inherit; text-align: left; cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease; }
  .mini:disabled { cursor: default; }
  .mini:hover:not(:disabled) { border-color: var(--accent); }
  .mini:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .mini.selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent), 0 0 18px color-mix(in srgb, var(--accent) 30%, transparent); }
  .rarity-rare { --rarity: #4f8cff; } .rarity-elite { --rarity: #a66bff; } .rarity-superstar { --rarity: #ff7a45; } .rarity-legend { --rarity: #f2c14e; } .rarity-goat { --rarity: #ff4d6d; }
  .top { display: flex; align-items: start; justify-content: space-between; gap: 4px; min-width: 0; }
  .photo { flex: 0 0 auto; display: block; width: clamp(30px, 9vw, 44px); height: clamp(30px, 9vw, 44px); overflow: hidden; border: 1px solid color-mix(in srgb, var(--rarity) 60%, var(--line)); background: var(--surface-2); }
  .ovr { display: grid; justify-items: end; min-width: 0; color: var(--accent); font: 900 clamp(1.1rem, 4.6vw, 1.5rem)/1 'Arial Narrow', Impact, sans-serif; font-variant-numeric: tabular-nums; }
  .ovr small { color: var(--muted); font: 700 .45rem Inter, Arial, sans-serif; }
  .rarity { overflow: hidden; color: color-mix(in srgb, var(--rarity) 75%, var(--text)); font-size: .5rem; font-weight: 900; letter-spacing: .12em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .name { overflow: hidden; font: 800 clamp(.82rem, 3.4vw, 1rem)/1.1 'Arial Narrow', Impact, sans-serif; text-overflow: ellipsis; white-space: nowrap; }
  .meta, .team { overflow: hidden; color: var(--muted); font-size: clamp(.52rem, 2.2vw, .6rem); font-weight: 700; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .team { text-transform: none; }
  @media (prefers-reduced-motion: reduce) { .mini { transition: none; } }
</style>
