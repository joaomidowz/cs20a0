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
  /** Compact mode: small photo like the player card and attributes hidden until the card is opened; opt-in so other screens keep their current layout. */
  export let compact = false;
  export let quantity = 1;
  /** Phone grid (≤720px): photo, OVR, name and ×copies only, like the dense player card; the rest lives in the sheet. */
  export let dense = false;
  export let onOpen: ((coach: Coach, trigger: HTMLButtonElement) => void) | null = null;
  export let selectable = false;
  export let selectedQuantity = 0;
  export let selectionDisabled = false;
  export let selectionLabel = '';

  $: rarity = rarityOf(coach);
  const ATTRS = [['tactics', 'TAC'], ['discipline', 'DIS'], ['aggression', 'AGR'], ['development', 'DEV']] as const;
</script>

<article class="card rarity-{rarity}" class:active class:affinity class:showcase class:dense class:has-quantity={quantity > 1} class:selected={selectedQuantity > 0} class:selection-disabled={selectable && selectionDisabled}>
  {#if quantity > 1}<b class="quantity" aria-label={`×${quantity}`}>×{quantity}</b>{/if}
  {#if selectable}<b class="selection-mark">{selectedQuantity > 0 ? `SELL ×${selectedQuantity}` : selectionLabel}</b>{/if}
  {#if tag}<b class="tag">{tag}</b>{/if}
  <button class="face" type="button" disabled={!onOpen || selectionDisabled} aria-haspopup={onOpen && !selectable ? 'dialog' : undefined} aria-label={onOpen ? coach.name : undefined} aria-pressed={selectable ? selectedQuantity > 0 : undefined} on:click={(event) => onOpen?.(coach, event.currentTarget as HTMLButtonElement)}>
    {#if showcase}
      <span class="top"><span class="photo"><PlayerAvatar player={{ id: coach.id, baseId: coach.baseId }} bare /></span><span class="ovr"><small>OVR</small>{coach.overall}</span></span>
      <span class="rarity">{rarity} · COACH</span>
      <strong class="name">{coach.name}</strong>
      <span class="role">COACH · {coach.year}</span>
    {:else}
      <span class="top">{#if dense || compact}<span class="photo"><PlayerAvatar player={{ id: coach.id, baseId: coach.baseId }} bare /></span>{/if}<span class="kind">COACH</span><span class="ovr"><small>OVR</small>{coach.overall}</span></span>
    <span class="rarity">{rarity}</span>
    <strong class="name">{coach.name}</strong>
    {#if compact && !showcase}<span class="role">COACH · {coach.year}</span>{/if}
  {/if}
    <span class="team"><TeamBadge id={coach.teamId} name={teamName} size="sm" /><em>{teamName || '—'} · {coach.year}</em></span>
    {#if !compact || showcase}<ul class="attrs">{#each ATTRS as [key, label]}<li><span>{label}</span><i style={`--v:${coach[key]}%`}></i><b>{coach[key]}</b></li>{/each}</ul>{/if}
  </button>
  {#if $$slots.default}<footer><slot /></footer>{/if}
</article>

<style>
  .card { --rarity: var(--line); position: relative; display: grid; min-width: 0; border: 1px solid var(--rarity); background: linear-gradient(165deg, color-mix(in srgb, var(--rarity) 14%, var(--surface-2)), var(--surface)); }
  .rarity-rare { --rarity: #4f8cff; } .rarity-elite { --rarity: #a66bff; } .rarity-superstar { --rarity: #ff7a45; } .rarity-legend { --rarity: #f2c14e; } .rarity-goat { --rarity: #ff4d6d; }
  .face { display: grid; width: 100%; gap: 6px; padding: 12px; border: 0; background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
  .face:disabled { cursor: default; }
  .face:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .top { display: flex; justify-content: space-between; align-items: start; }
  .kind { padding: 3px 7px; border: 1px solid var(--accent); color: var(--accent); font-size: .56rem; font-weight: 900; letter-spacing: .14em; }
  .card { --ovr-chip: var(--rarity); --ovr-ink: #0b0d12; } .rarity-common { --ovr-chip: #b9c0cc; }
  .ovr { display: inline-grid; justify-items: end; align-self: start; padding: 3px 7px 2px; border: 1px solid color-mix(in srgb, var(--ovr-chip) 70%, #000); background: var(--ovr-chip); color: var(--ovr-ink); font: 900 2rem/1 'Arial Narrow', Impact, sans-serif; box-shadow: 0 1px 0 color-mix(in srgb, #000 35%, transparent); } .ovr small { color: color-mix(in srgb, var(--ovr-ink) 72%, transparent); font: 700 .5rem Inter, Arial, sans-serif; letter-spacing: .08em; }
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
  .showcase .ovr { padding: 6px 10px 4px; font-size: 3.4rem; } .showcase .ovr small { font-size: .62rem; }
  .showcase .rarity { font-size: .66rem; } .showcase .name { font-size: 1.9rem; }
  .role { color: var(--muted); font-size: .7rem; font-weight: 700; text-transform: uppercase; }
  .showcase .team { padding: 7px 8px; font-size: .8rem; }
  .showcase .attrs { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; margin-top: 4px; }
  .showcase .attrs li { grid-template-columns: 1fr auto; gap: 2px 6px; font-size: .56rem; letter-spacing: .1em; }
  .showcase .attrs i { grid-column: 1 / -1; grid-row: 2; height: 3px; background: linear-gradient(90deg, var(--rarity) var(--v), var(--surface) var(--v)); }
  .showcase .attrs b { font: 900 1.05rem/1 'Arial Narrow', Impact, sans-serif; }
  .compact:not(.showcase) .attrs { display: none; }
  /* Compact mirrors CollectionCard's compact: same 52px photo, OVR, name and padding — coach and player cards line up. */
  .compact:not(.showcase) .photo { flex: 0 0 auto; width: 52px; height: 52px; }
  .compact:not(.showcase) .ovr { font-size: 1.7rem; }
  .compact:not(.showcase) .name { font-size: 1.1rem; }
  .compact:not(.showcase) .face { padding: 10px; }
  footer { display: flex; gap: 4px; padding: 0 12px 12px; } footer :global(button) { flex: 1; }
  .tag { position: absolute; top: -9px; left: 10px; z-index: 2; padding: 3px 8px; background: var(--accent); color: #0a0d08; font-size: .56rem; font-weight: 900; letter-spacing: .14em; }
  .quantity { position: absolute; right: 8px; bottom: 8px; z-index: 2; min-width: 25px; padding: 3px 6px; border: 1px solid var(--accent); background: var(--surface); color: var(--accent); font: 900 .68rem/1 'Arial Narrow', Impact, sans-serif; text-align: center; font-variant-numeric: tabular-nums; }
  .selection-mark { position: absolute; left: 4px; bottom: 4px; z-index: 4; padding: 3px 5px; border: 1px solid var(--accent); background: var(--surface); color: var(--accent); font-size: .52rem; font-weight: 900; letter-spacing: .05em; }
  .selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
  .selection-disabled { opacity: .52; }
  .active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .affinity { box-shadow: 0 0 0 1px var(--accent), 0 0 24px color-mix(in srgb, var(--accent) 30%, transparent); }
  /* The ×N badge sits over the footer's right edge; keep the buttons clear of it, as the player card does. */
  .has-quantity footer { padding-right: 42px; }
  /* Dense (phone, four per row): mirrors CollectionCard's dense rules — the photo is the card, OVR top-left, COACH bottom-left. */
  .dense:not(.showcase) .photo { display: none; }
  @media (max-width: 720px) {
    .dense .face { gap: 0; padding: 0; }
    .dense .top { position: relative; display: block; }
    .dense:not(.showcase) .photo { display: block; width: 100%; height: auto; aspect-ratio: 1; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--rarity) 45%, var(--line)); }
    .dense .ovr { position: absolute; top: 3px; left: 3px; justify-items: start; padding: 1px 4px 0; border: 1px solid color-mix(in srgb, var(--ovr-chip) 70%, #000); background: var(--ovr-chip); color: var(--ovr-ink); font-size: clamp(.95rem, 4.2vw, 1.15rem); }
    .dense .ovr small { display: none; }
    .dense .kind { position: absolute; left: 3px; bottom: 3px; padding: 1px 4px; background: color-mix(in srgb, var(--surface) 88%, transparent); font-size: .46rem; letter-spacing: .08em; }
    .dense .rarity, .dense .team, .dense .attrs, .dense footer { display: none; }
    .dense .name { padding: 4px 4px 5px; font-size: clamp(.68rem, 3.1vw, .82rem); line-height: 1.15; text-align: center; }
    .dense .quantity { top: 3px; right: 3px; bottom: auto; min-width: 0; padding: 2px 4px; font-size: .58rem; }
    .dense .tag { top: -7px; left: 4px; padding: 2px 5px; font-size: .48rem; letter-spacing: .08em; }
  }
</style>
