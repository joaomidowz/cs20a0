<script lang="ts">
  import CountryFlag from '../CountryFlag.svelte';
  import PlayerAvatar from '../PlayerAvatar.svelte';
  import TeamBadge from '../TeamBadge.svelte';
  import { playerCountryOf } from '$lib/game/online/collection-countries';
  import { rarityOf } from '$lib/game/online/collection-rules';
  import { primaryRoleOf } from '$lib/game/online/collection-lineup';
  import { getRoleLabel } from '$lib/game/roleRules';
  import { countryName } from '$lib/game/visuals/flags';
  import type { Language, Player } from '$lib/game/types';

  /** One collection card: photo, OVR, flag and team inside the frame, rarity border and the builder states. */
  export let player: Player;
  export let teamName = '';
  export let language: Language = 'en';
  export let compact = false;
  export let inLineup = false;
  export let star = false;
  export let effect: 'up' | 'down' | null = null;
  export let tag = '';
  /** Pack reveal: a tall card with a big photo, the country by name and the four best attributes. */
  export let showcase = false;
  export let onOpen: ((player: Player) => void) | null = null;

  $: rarity = rarityOf(player);
  $: country = playerCountryOf(player);
  const STATS: Array<[keyof Player, string]> = [['firepower', 'FIRE'], ['entry', 'ENTRY'], ['awp', 'AWP'], ['igl', 'IGL'], ['support', 'SUP'], ['clutch', 'CLUTCH'], ['consistency', 'CONS'], ['mental', 'MENTAL'], ['experience', 'EXP']];
  $: bestStats = showcase ? STATS.map(([key, label]) => ({ label, value: Number(player[key] ?? 0) })).filter((stat) => stat.value > 0).sort((a, b) => b.value - a.value).slice(0, 4) : [];
</script>

<article class="card rarity-{rarity}" class:compact class:showcase class:in-lineup={inLineup} class:star class:up={effect === 'up'} class:down={effect === 'down'}>
  {#if tag}<b class="tag">{tag}</b>{/if}
  <button class="face" type="button" on:click={() => onOpen?.(player)} disabled={!onOpen}>
    <span class="top">
      <span class="photo"><PlayerAvatar {player} bare /></span>
      <span class="ovr"><small>OVR</small>{player.overall ?? '—'}</span>
    </span>
    <span class="rarity">{rarity}{#if star} · ★ STAR{/if}</span>
    <strong class="name"><CountryFlag code={country} {language} /> <span>{player.nickname ?? player.id}</span></strong>
    <span class="role">{getRoleLabel(primaryRoleOf(player))} · {player.year ?? '—'}{#if showcase && country} · {countryName(country, language)}{/if}</span>
    <span class="team"><TeamBadge id={player.teamId ?? ''} name={teamName} size="sm" /><em>{teamName || '—'}</em></span>
    {#if showcase && bestStats.length}
      <span class="stats">{#each bestStats as stat}<span class="stat"><small>{stat.label}</small><b>{stat.value}</b><i><u style={`width:${stat.value}%`}></u></i></span>{/each}</span>
    {/if}
  </button>
  {#if $$slots.default}<footer><slot /></footer>{/if}
</article>

<style>
  .card { --rarity: var(--line); position: relative; display: grid; min-width: 0; border: 1px solid var(--rarity); background: linear-gradient(165deg, color-mix(in srgb, var(--rarity) 14%, var(--surface-2)), var(--surface)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rarity) 30%, transparent); transition: transform .18s ease, box-shadow .25s ease, border-color .18s ease; }
  .rarity-rare { --rarity: #4f8cff; } .rarity-elite { --rarity: #a66bff; } .rarity-superstar { --rarity: #ff7a45; } .rarity-legend { --rarity: #f2c14e; } .rarity-goat { --rarity: #ff4d6d; }
  .card:hover { transform: translateY(-2px); }
  .face { display: grid; gap: 6px; padding: 12px; border: 0; background: transparent; color: var(--text); text-align: left; cursor: pointer; }
  .face:disabled { cursor: default; }
  .top { display: flex; justify-content: space-between; align-items: start; gap: 8px; }
  .photo { display: block; width: 64px; height: 64px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--rarity) 60%, var(--line)); background: var(--surface-2); }
  .ovr { display: grid; justify-items: end; color: var(--accent); font: 900 2.1rem/1 'Arial Narrow', Impact, sans-serif; }
  .ovr small { color: var(--muted); font: 700 .5rem Inter, Arial, sans-serif; }
  .rarity { color: color-mix(in srgb, var(--rarity) 75%, var(--text)); font-size: .56rem; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
  .name { display: flex; align-items: center; gap: 6px; min-width: 0; font: 800 1.35rem/1.1 'Arial Narrow', Impact, sans-serif; }
  .name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .role { color: var(--muted); font-size: .64rem; font-weight: 700; text-transform: uppercase; }
  .team { display: flex; align-items: center; gap: 6px; min-width: 0; margin-top: 2px; padding: 5px 6px; border: 1px solid color-mix(in srgb, var(--line) 80%, transparent); background: color-mix(in srgb, var(--surface) 70%, transparent); color: var(--muted); font-size: .66rem; }
  .team em { overflow: hidden; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
  footer { display: flex; gap: 4px; padding: 0 12px 12px; }
  footer :global(button) { flex: 1; }
  .tag { position: absolute; top: -9px; left: 10px; z-index: 2; padding: 3px 8px; background: var(--accent); color: #0a0d08; font-size: .56rem; font-weight: 900; letter-spacing: .14em; }
  .showcase .face { gap: 8px; padding: 16px; }
  .showcase .top { align-items: end; }
  .showcase .photo { width: 58%; height: auto; aspect-ratio: 1; }
  .showcase .ovr { font-size: 3.4rem; } .showcase .ovr small { font-size: .62rem; }
  .showcase .rarity { font-size: .66rem; } .showcase .name { font-size: 1.9rem; } .showcase .role { font-size: .7rem; }
  .showcase .team { padding: 7px 8px; font-size: .8rem; }
  .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; margin-top: 4px; }
  .stat { display: grid; grid-template-columns: 1fr auto; gap: 2px 6px; align-items: baseline; }
  .stat small { color: var(--muted); font-size: .56rem; font-weight: 800; letter-spacing: .1em; } .stat b { color: var(--text); font: 900 1.05rem/1 'Arial Narrow', Impact, sans-serif; }
  .stat i { grid-column: 1 / -1; height: 3px; background: var(--surface); } .stat u { display: block; height: 100%; background: var(--rarity); }
  .compact .photo { width: 52px; height: 52px; } .compact .ovr { font-size: 1.7rem; } .compact .name { font-size: 1.1rem; } .compact .face { padding: 10px; }
  .in-lineup { border-color: var(--accent); }
  .up { box-shadow: 0 0 0 1px var(--accent), 0 0 22px color-mix(in srgb, var(--accent) 28%, transparent); animation: glow 2.4s ease-in-out infinite; }
  .down { border-color: var(--danger); box-shadow: 0 0 0 1px var(--danger), 0 0 18px color-mix(in srgb, var(--danger) 22%, transparent); }
  .star { border-color: #d9a441; box-shadow: 0 0 0 1px #d9a441, 0 0 30px color-mix(in srgb, #d9a441 35%, transparent); animation: star 2.2s ease-in-out infinite; }
  @keyframes glow { 50% { box-shadow: 0 0 0 1px var(--accent), 0 0 34px color-mix(in srgb, var(--accent) 40%, transparent); } }
  @keyframes star { 50% { box-shadow: 0 0 0 1px #f2c14e, 0 0 44px color-mix(in srgb, #d9a441 55%, transparent); } }
  @media (prefers-reduced-motion: reduce) { .card, .up, .star { animation: none; transition: none; } .card:hover { transform: none; } }
</style>
