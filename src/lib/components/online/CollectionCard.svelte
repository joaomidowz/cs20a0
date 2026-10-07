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
  export let quantity = 1;
  export let inLineup = false;
  export let star = false;
  export let effect: 'up' | 'down' | null = null;
  export let tag = '';
  /** Pack reveal: a tall card with a big photo, the country by name and the four best attributes. */
  export let showcase = false;
  export let onOpen: ((player: Player) => void) | null = null;
  export let selectable = false;
  export let selectedQuantity = 0;
  export let selectionDisabled = false;
  export let selectionLabel = '';
  /**
   * Collection grid on a phone (≤720px): four per row, Clash Royale style — photo, OVR, nick, ×copies and the rarity
   * border. Everything else (role, team, footer buttons) lives in the card sheet that opens on tap. Desktop is untouched.
   */
  export let dense = false;
  /** Dense com a ficha inteira (raridade, função · ano e time) em letra miúda: a Fila Draft no celular mostra tudo que a carta é. */
  export let detailed = false;

  $: rarity = rarityOf(player);
  $: country = playerCountryOf(player);
  const STATS: Array<[keyof Player, string]> = [['firepower', 'FIRE'], ['entry', 'ENTRY'], ['awp', 'AWP'], ['igl', 'IGL'], ['support', 'SUP'], ['clutch', 'CLUTCH'], ['consistency', 'CONS'], ['mental', 'MENTAL'], ['experience', 'EXP']];
  /** Why the card is rated like this: the season's awards, shortest label that still says what it was. */
  const shortAward = (award: string) => award.replace(/^HLTV Top 20 (\d{4}) #(\d+)$/, 'HLTV #$2 · $1').replace(/^HLTV /, '');
  $: awards = showcase ? [...new Set(player.awardBadges ?? [])].map(shortAward) : [];
  $: bestStats = showcase ? STATS.map(([key, label]) => ({ label, value: Number(player[key] ?? 0) })).filter((stat) => stat.value > 0).sort((a, b) => b.value - a.value).slice(0, 4) : [];
</script>

<article class="card rarity-{rarity}" class:compact class:showcase class:dense class:detailed class:in-lineup={inLineup} class:has-quantity={quantity > 1} class:star class:up={effect === 'up'} class:down={effect === 'down'} class:selected={selectedQuantity > 0} class:selection-disabled={selectable && selectionDisabled}>
  {#if quantity > 1}<b class="quantity" aria-label={`${quantity} cópias`}>×{quantity}</b>{/if}
  {#if selectable}<b class="selection-mark">{selectedQuantity > 0 ? `SELL ×${selectedQuantity}` : selectionLabel}</b>{/if}
  {#if tag}<b class="tag">{tag}</b>{/if}
  <button class="face" type="button" on:click={() => onOpen?.(player)} disabled={!onOpen || selectionDisabled} aria-pressed={selectable ? selectedQuantity > 0 : undefined}>
    <span class="top">
      <span class="photo"><PlayerAvatar {player} bare /></span>
      <span class="ovr"><small>OVR</small>{player.overall ?? '—'}</span>
    </span>
    <span class="rarity">{rarity}{#if star} · ★ STAR{/if}</span>
    <strong class="name"><CountryFlag code={country} {language} /> <span>{player.nickname ?? player.id}</span></strong>
    <span class="role">{getRoleLabel(primaryRoleOf(player))} · {player.year ?? '—'}{#if showcase && country} · {countryName(country, language)}{/if}</span>
    <span class="team"><TeamBadge id={player.teamId ?? ''} name={teamName} size="sm" /><em>{teamName || '—'}</em></span>
    {#if showcase && player.title}<span class="epithet">“{player.title}”</span>{/if}
    {#if showcase && bestStats.length}
      <span class="stats">{#each bestStats as stat}<span class="stat"><small>{stat.label}</small><b>{stat.value}</b><i><u style={`width:${stat.value}%`}></u></i></span>{/each}</span>
    {/if}
    {#if awards.length}<span class="awards">{#each awards as award}<span class:gold={/MVP|#1 ·|#2 ·|#3 ·/.test(award)}>{award}</span>{/each}</span>{/if}
  </button>
  {#if $$slots.default}<footer><slot /></footer>{/if}
</article>

<style>
  .card { --rarity: var(--line); position: relative; display: grid; min-width: 0; border: 1px solid var(--rarity); background: linear-gradient(165deg, color-mix(in srgb, var(--rarity) 14%, var(--surface-2)), var(--surface)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rarity) 30%, transparent); transition: transform .18s var(--ease-out-strong), box-shadow .25s ease, border-color .18s ease; }
  .rarity-rare { --rarity: #4f8cff; } .rarity-elite { --rarity: #a66bff; } .rarity-superstar { --rarity: #ff7a45; } .rarity-legend { --rarity: #f2c14e; } .rarity-goat { --rarity: #ff4d6d; }
  @media (hover: hover) and (pointer: fine) { .card:hover { transform: translateY(-2px); } }
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
  /* Grade que quebra em linhas: botão nunca encolhe abaixo de uma palavra (2026-10-06: o "Trocar" virava coluna ao lado do aviso de venda). */
  footer { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 110px), 1fr)); gap: 4px; padding: 0 12px 12px; }
  footer :global(button) { flex: 1; }
  .tag { position: absolute; top: -9px; left: 10px; z-index: 2; padding: 3px 8px; background: var(--accent); color: #0a0d08; font-size: .56rem; font-weight: 900; letter-spacing: .14em; }
  .quantity { position: absolute; right: 8px; bottom: 8px; z-index: 2; min-width: 25px; padding: 3px 6px; border: 1px solid var(--accent); background: var(--surface); color: var(--accent); font: 900 .68rem/1 'Arial Narrow', Impact, sans-serif; text-align: center; font-variant-numeric: tabular-nums; }
  .selection-mark { position: absolute; left: 4px; bottom: 4px; z-index: 4; padding: 3px 5px; border: 1px solid var(--accent); background: var(--surface); color: var(--accent); font-size: .52rem; font-weight: 900; letter-spacing: .05em; }
  .selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
  .selection-disabled { opacity: .52; }
  .showcase .face { gap: 8px; padding: 16px; }
  .showcase .top { align-items: end; }
  .showcase .photo { width: 58%; height: auto; aspect-ratio: 1; }
  .showcase .ovr { font-size: 3.4rem; } .showcase .ovr small { font-size: .62rem; }
  .showcase .rarity { font-size: .66rem; } .showcase .name { font-size: 1.9rem; } .showcase .role { font-size: .7rem; }
  .showcase .team { padding: 7px 8px; font-size: .8rem; }
  .epithet { color: var(--muted); font-size: .72rem; font-style: italic; }
  .awards { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
  .awards span { padding: 3px 6px; border: 1px solid color-mix(in srgb, var(--rarity) 55%, var(--line)); background: color-mix(in srgb, var(--rarity) 12%, transparent); color: var(--text); font-size: .56rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
  .awards span.gold { border-color: #d9a441; color: #ffd36b; background: color-mix(in srgb, #d9a441 16%, transparent); }
  .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; margin-top: 4px; }
  .stat { display: grid; grid-template-columns: 1fr auto; gap: 2px 6px; align-items: baseline; }
  .stat small { color: var(--muted); font-size: .56rem; font-weight: 800; letter-spacing: .1em; } .stat b { color: var(--text); font: 900 1.05rem/1 'Arial Narrow', Impact, sans-serif; }
  .stat i { grid-column: 1 / -1; height: 3px; background: var(--surface); } .stat u { display: block; height: 100%; background: var(--rarity); }
  .compact .photo { width: 52px; height: 52px; } .compact .ovr { font-size: 1.7rem; } .compact .name { font-size: 1.1rem; } .compact .face { padding: 10px; }
  /* Narrow columns (lineup slots): nothing may push past the frame; long names and teams end in an ellipsis. */
  .face { min-width: 0; overflow: hidden; }
  .face > * { min-width: 0; }
  .top > * { min-width: 0; } .photo { flex: 0 0 auto; }
  .rarity { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name { overflow: hidden; } .name span { min-width: 0; } .name :global(*) { flex-shrink: 0; } .name span { flex-shrink: 1; }
  .role { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .team { overflow: hidden; } .team :global(*) { flex-shrink: 0; } .team em { flex-shrink: 1; min-width: 0; }
  .compact .ovr { font-size: clamp(1.25rem, 1rem + 1.4vw, 1.7rem); }
  .compact .name { font-size: clamp(.95rem, .8rem + .6vw, 1.1rem); }
  footer { min-width: 0; } .has-quantity footer { padding-right: 42px; } footer :global(button) { min-width: 0; white-space: normal; overflow-wrap: normal; line-height: 1.2; } footer :global(.sell-locked) { grid-column: 1 / -1; }
  .in-lineup { border-color: var(--accent); }
  /* O anel fica na carta; o brilho difuso vive num pseudo-elemento fixo e só a opacidade dele pulsa (barato na grade grande). */
  .up { box-shadow: 0 0 0 1px var(--accent); }
  .down { border-color: var(--danger); box-shadow: 0 0 0 1px var(--danger), 0 0 18px color-mix(in srgb, var(--danger) 22%, transparent); }
  .star { border-color: #d9a441; box-shadow: 0 0 0 1px #d9a441; }
  .up::after, .star::after { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .6; animation: glow-pulse 2.4s ease-in-out infinite; }
  .up::after { box-shadow: 0 0 34px color-mix(in srgb, var(--accent) 40%, transparent); }
  .star::after { box-shadow: 0 0 44px color-mix(in srgb, #d9a441 55%, transparent); animation-duration: 2.2s; }
  .star.up::after { box-shadow: 0 0 44px color-mix(in srgb, #d9a441 55%, transparent), 0 0 34px color-mix(in srgb, var(--accent) 40%, transparent); }
  @keyframes glow-pulse { 50% { opacity: 1; } }
  /* Dense (phone, four per row): the photo is the card; OVR and ×copies sit on it like Clash Royale's cost and level.
     Same 720px limit as the collection grid, so a full card never lands in a four-column row. */
  @media (max-width: 720px) {
    .dense .face { gap: 0; padding: 0; }
    .dense .top { position: relative; display: block; }
    .dense .photo { width: 100%; height: auto; aspect-ratio: 1; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--rarity) 45%, var(--line)); }
    .dense .ovr { position: absolute; top: 3px; left: 3px; justify-items: start; padding: 1px 4px 0; border: 1px solid color-mix(in srgb, var(--rarity) 60%, var(--line)); background: color-mix(in srgb, var(--surface) 88%, transparent); font-size: clamp(.95rem, 4.2vw, 1.15rem); }
    .dense .ovr small { display: none; }
    .dense .rarity, .dense .role, .dense .team, .dense footer { display: none; }
    /* Dense detalhada: as três linhas da ficha voltam, miúdas e centradas, abaixo do nome. */
    .dense.detailed .rarity { display: block; padding: 2px 3px 0; font-size: .5rem; letter-spacing: .1em; text-align: center; }
    .dense.detailed .role { display: block; padding: 0 3px; color: var(--muted); font-size: .56rem; line-height: 1.2; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dense.detailed .team { display: block; padding: 0 3px 5px; color: var(--muted); font-size: .54rem; line-height: 1.2; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dense.detailed .team :global(.badge), .dense.detailed .team :global(img), .dense.detailed .team :global(svg) { display: none; }
    .dense.detailed .team em { font-style: normal; }
    .dense.detailed .name { padding-bottom: 1px; }
    .dense .name { display: block; padding: 4px 4px 5px; font-size: clamp(.68rem, 3.1vw, .82rem); line-height: 1.15; text-align: center; }
    .dense .name > :global(:not(span)) { display: none; }
    .dense .quantity { top: 3px; right: 3px; bottom: auto; min-width: 0; padding: 2px 4px; font-size: .58rem; }
    .dense .tag { top: -7px; left: 4px; padding: 2px 5px; font-size: .48rem; letter-spacing: .08em; }
    /* In the lineup: a corner check instead of the accent border only, so the state reads at thumbnail size. */
    .dense.in-lineup .top::after { content: '✓'; position: absolute; right: 3px; bottom: 3px; display: grid; place-items: center; width: 16px; height: 16px; background: var(--accent); color: #0a0d08; font-size: .62rem; font-weight: 900; line-height: 1; }
    .dense.has-quantity.in-lineup .top::after { right: auto; left: 3px; }
    .dense.up::after, .dense.star::after { box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 45%, transparent); }
    .dense.star::after { box-shadow: 0 0 16px color-mix(in srgb, #d9a441 60%, transparent); }
  }
  @media (prefers-reduced-motion: reduce) { .card, .up::after, .star::after { animation: none; transition: none; } .card:hover { transform: none; } }
</style>
