<script lang="ts">
  import type { Coach, Language } from '$lib/game/types';

  export let coach: Coach;
  export let teamLabel = '';
  export let language: Language = 'pt-BR';
  export let selected = false;
  export let onOpen: (() => void) | null = null;

  const copy = {
    'pt-BR': { tactics: 'Tática', discipline: 'Disciplina', aggression: 'Agressão', development: 'Desenvolvimento', history: 'Histórico' },
    es: { tactics: 'Táctica', discipline: 'Disciplina', aggression: 'Agresión', development: 'Desarrollo', history: 'Historial' },
    en: { tactics: 'Tactics', discipline: 'Discipline', aggression: 'Aggression', development: 'Development', history: 'History' }
  } as const;
  const ATTRIBUTES = ['tactics', 'discipline', 'aggression', 'development'] as const;
  $: c = copy[language];
  $: rarity = (coach.rarity ?? 'common').toLowerCase();
</script>

<article class="coach-card rarity-{rarity}" class:selected>
  <header>
    <span class="ovr">{coach.overall}</span>
    <div><strong>{coach.name}</strong><small>{teamLabel}</small></div>
  </header>
  <ul>
    {#each ATTRIBUTES as key}
      <li><span>{c[key]}</span><i style={`--value:${coach[key]}%`}></i><b>{coach[key]}</b></li>
    {/each}
  </ul>
  <footer>
    {#if onOpen}<button type="button" class="card-action" on:click={onOpen}>{c.history}</button>{/if}
    <slot />
  </footer>
</article>

<style>
  .coach-card { --rarity: var(--line); display: grid; gap: 10px; min-width: 0; padding: 12px; border: 1px solid var(--rarity); border-radius: 6px; background: linear-gradient(160deg, color-mix(in srgb, var(--accent-2) 8%, var(--surface-2)), var(--surface)); }
  .rarity-rare { --rarity: #4f8cff; }
  .rarity-elite { --rarity: #a66bff; }
  .rarity-superstar { --rarity: #ff7a45; }
  .rarity-legend, .rarity-legendary { --rarity: #f2c14e; }
  .rarity-goat { --rarity: #ff4d6d; }
  .coach-card.selected { outline: 2px solid var(--accent); outline-offset: 2px; }
  header { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: center; }
  .ovr { font: 900 2rem/1 'Arial Narrow', Impact, sans-serif; color: var(--accent); }
  strong { display: block; overflow-wrap: anywhere; }
  small { color: var(--muted); font-size: .7rem; overflow-wrap: anywhere; }
  ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  li { display: grid; grid-template-columns: minmax(0, 96px) minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: .68rem; }
  li span { overflow-wrap: anywhere; }
  li i { height: 5px; background: linear-gradient(90deg, var(--accent) var(--value), var(--line) var(--value)); }
  footer { display: flex; flex-wrap: wrap; gap: 6px; }
  .card-action { min-height: 30px; padding: 0 10px; border: 1px solid var(--line); background: transparent; color: var(--muted); font: 800 .62rem/1 Inter, Arial, sans-serif; text-transform: uppercase; cursor: pointer; }
  .card-action:hover { color: var(--text); }
  .card-action:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
