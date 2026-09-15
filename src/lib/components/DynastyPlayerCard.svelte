<script lang="ts">
  import { getRoleLabel } from '$lib/game/roleRules';
  import type { EvolutionEntry, Language, LineupSlotRole, Player, PlayerOverride } from '$lib/game/types';

  export let player: Player;
  export let role: LineupSlotRole | null = null;
  export let offRole = false;
  export let evolution: EvolutionEntry | null = null;
  export let training: PlayerOverride['training'] | null = null;
  export let teamLabel = '';
  export let language: Language = 'pt-BR';
  export let selected = false;
  export let onOpen: (() => void) | null = null;
  /** Compact card: bordered shell with actions in the footer and the two strongest attributes on the front. */
  export let compact = false;

  const ATTRIBUTES = ['firepower', 'entry', 'clutch', 'awp', 'support', 'igl'] as const;
  const copy = {
    'pt-BR': { flip: 'Atributos', front: 'Carta', history: 'Histórico', trained: 'treino', firepower: 'Mira', entry: 'Entrada', clutch: 'Clutch', awp: 'AWP', support: 'Suporte', igl: 'IGL' },
    es: { flip: 'Atributos', front: 'Carta', history: 'Historial', trained: 'entreno', firepower: 'Puntería', entry: 'Entrada', clutch: 'Clutch', awp: 'AWP', support: 'Apoyo', igl: 'IGL' },
    en: { flip: 'Attributes', front: 'Card', history: 'History', trained: 'training', firepower: 'Aim', entry: 'Entry', clutch: 'Clutch', awp: 'AWP', support: 'Support', igl: 'IGL' }
  } as const;

  let flipped = false;
  $: c = copy[language];
  $: rarity = (player.rarity ?? 'common').toLowerCase();
  $: delta = evolution ? evolution.overallAfter - evolution.overallBefore : 0;
  $: keyAttributes = compact ? [...ATTRIBUTES].sort((a, b) => (player[b] ?? 0) - (player[a] ?? 0)).slice(0, 2) : [];
  const gainOf = (key: string) => (training as Record<string, number | undefined> | null | undefined)?.[key] ?? 0;
</script>

<article class="dynasty-card rarity-{rarity}" class:compact class:selected class:flipped>
  <div class="card-inner rarity-{rarity}">
    <div class="face front" aria-hidden={flipped}>
      <header>
        <span class="ovr">{player.overall ?? 70}</span>
        <span class="rarity">{rarity}</span>
      </header>
      <strong class="name">{player.nickname ?? player.id}</strong>
      <small class="team">{teamLabel}{player.year ? ` · ${player.year}` : ''}</small>
      {#if compact}
        <dl class="key-attrs">
          {#each keyAttributes as key}<div><dt>{c[key]}</dt><dd>{player[key] ?? '—'}</dd></div>{/each}
        </dl>
      {/if}
      <div class="tags">
        {#if role}<span class="role" class:warn={offRole}>{getRoleLabel(role)}{#if offRole} · {language === 'en' ? '−1.5%' : '−1,5%'}{/if}</span>{/if}
        {#if delta !== 0}<span class="delta" class:up={delta > 0} class:down={delta < 0}>{delta > 0 ? '+' : ''}{delta}</span>{/if}
      </div>
    </div>
    <div class="face back" aria-hidden={!flipped}>
      <ul>
        {#each ATTRIBUTES as key}
          <li>
            <span>{c[key]}</span>
            <i style={`--value:${player[key] ?? 0}%`}></i>
            <b>{player[key] ?? '—'}{#if gainOf(key)}<small> +{gainOf(key)} {c.trained}</small>{/if}</b>
          </li>
        {/each}
      </ul>
    </div>
  </div>
  <footer>
    <button type="button" class="card-action" aria-pressed={flipped} on:click={() => (flipped = !flipped)}>{flipped ? c.front : c.flip}</button>
    {#if onOpen}<button type="button" class="card-action" on:click={onOpen}>{c.history}</button>{/if}
    <slot />
  </footer>
</article>

<style>
  .dynasty-card { --rarity: var(--line); display: grid; gap: 8px; min-width: 0; perspective: 900px; }
  .card-inner { --rarity: var(--line); position: relative; min-height: 176px; border: 1px solid var(--rarity); border-radius: 6px; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rarity) 35%, transparent); transform-style: preserve-3d; transition: transform .45s cubic-bezier(.16, 1, .3, 1); }
  .rarity-rare { --rarity: #4f8cff; }
  .rarity-elite { --rarity: #a66bff; }
  .rarity-superstar { --rarity: #ff7a45; }
  .rarity-legend, .rarity-legendary { --rarity: #f2c14e; }
  .rarity-goat { --rarity: #ff4d6d; }
  .selected .card-inner { outline: 2px solid var(--accent); outline-offset: 2px; }
  .flipped .card-inner { transform: rotateY(180deg); }
  .face { position: absolute; inset: 0; display: grid; align-content: start; gap: 6px; padding: 12px; border-radius: 6px; overflow: hidden; background: linear-gradient(160deg, color-mix(in srgb, var(--rarity) 12%, var(--surface-2)), var(--surface)); backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .back { transform: rotateY(180deg); }
  header { display: flex; justify-content: space-between; align-items: start; }
  .ovr { font: 900 2.2rem/1 'Arial Narrow', Impact, sans-serif; color: var(--accent); }
  .rarity { font-size: .56rem; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: color-mix(in srgb, var(--rarity) 70%, var(--muted)); }
  .name { font-size: 1.15rem; overflow-wrap: anywhere; }
  .team { color: var(--muted); font-size: .7rem; overflow-wrap: anywhere; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; }
  .role, .delta { padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; font-size: .62rem; font-weight: 900; text-transform: uppercase; }
  .role.warn { border-color: var(--accent-2); color: var(--accent-2); }
  .delta.up { color: var(--accent); border-color: var(--accent); }
  .delta.down { color: var(--danger); border-color: var(--danger); }
  ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  li { display: grid; grid-template-columns: 62px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: .68rem; }
  li i { height: 5px; background: linear-gradient(90deg, var(--accent) var(--value), var(--line) var(--value)); }
  li b small { color: var(--accent); font-size: .56rem; }
  footer { display: flex; flex-wrap: wrap; gap: 6px; }
  .card-action { min-height: 30px; padding: 0 10px; border: 1px solid var(--line); background: transparent; color: var(--muted); font: 800 .62rem/1 Inter, Arial, sans-serif; text-transform: uppercase; cursor: pointer; }
  .card-action:hover { color: var(--text); }
  .card-action:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .compact { container-type: inline-size; gap: 0; overflow: hidden; border: 1px solid var(--rarity); border-radius: 6px; background: var(--surface); }
  .compact .card-inner { display: grid; min-height: 0; border: 0; border-radius: 0; box-shadow: none; }
  .compact .face { position: relative; inset: auto; grid-area: 1 / 1; gap: 4px; padding: 10px; border-radius: 0; }
  .compact .ovr { font-size: 1.8rem; }
  .compact .name { font-size: 1rem; line-height: 1.15; }
  .compact .team { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .compact .tags { margin-top: 2px; }
  .compact ul { gap: 4px; }
  .compact li { grid-template-columns: 50px minmax(0, 1fr) auto; gap: 6px; font-size: .62rem; }
  .compact li b small { display: none; }
  .key-attrs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 2px 0 0; }
  .key-attrs div { display: flex; justify-content: space-between; gap: 4px; min-width: 0; padding: 3px 6px; border-radius: 4px; background: color-mix(in srgb, var(--line) 45%, transparent); font-size: .6rem; }
  .key-attrs dt { overflow: hidden; color: var(--muted); font-weight: 800; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
  .key-attrs dd { margin: 0; font-weight: 900; }
  @container (max-width: 190px) { .key-attrs { grid-template-columns: 1fr; } }
  .compact footer { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 0; border-top: 1px solid var(--line); }
  .compact footer .card-action { min-width: 0; min-height: 34px; padding: 0 6px; border: 0; }
  .compact footer .card-action + .card-action { border-left: 1px solid var(--line); }
  @media (prefers-reduced-motion: reduce) { .card-inner { transition: none; } }
</style>
