<script lang="ts">
  import type { Language, TrainingFocus } from '$lib/game/types';
  export let language: Language = 'pt-BR';
  export let value: TrainingFocus | null = null;
  export let suggested: TrainingFocus = 'aim';
  export let onChange: (focus: TrainingFocus) => void = () => {};
  const focuses: TrainingFocus[] = ['aim', 'utility', 'clutch', 'opening', 'recovery'];
  const copy = {
    'pt-BR': { title: 'Treino pré-Major', hint: 'Escolha um foco para todo o elenco.', suggested: 'Sugerido', aim: 'Mira', utility: 'Utilitária', clutch: 'Clutch', opening: 'Abertura', recovery: 'Recuperação' },
    es: { title: 'Entrenamiento pre-Major', hint: 'Elige un foco para toda la plantilla.', suggested: 'Sugerido', aim: 'Puntería', utility: 'Utilidad', clutch: 'Clutch', opening: 'Apertura', recovery: 'Recuperación' },
    en: { title: 'Pre-Major training', hint: 'Choose one focus for the whole roster.', suggested: 'Suggested', aim: 'Aim', utility: 'Utility', clutch: 'Clutch', opening: 'Opening', recovery: 'Recovery' }
  } as const;
  $: c = copy[language];
</script>

<section class="training panel">
  <header><div><span class="eyebrow">DINASTIA · CAMP</span><h2>{c.title}</h2></div><p>{c.hint}</p></header>
  <div class="focuses" role="radiogroup" aria-label={c.title}>
    {#each focuses as focus}<button type="button" role="radio" aria-checked={value === focus} class:selected={value === focus} on:click={() => onChange(focus)}><b>{c[focus]}</b>{#if focus === suggested}<small>{c.suggested}</small>{/if}</button>{/each}
  </div>
</section>

<style>
  .training { display: grid; gap: 14px; padding: 18px; } header { display: flex; justify-content: space-between; gap: 12px; align-items: end; } h2, p { margin: 0; } p { color: var(--muted); }
  .focuses { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; } button { display: grid; gap: 4px; min-height: 64px; padding: 10px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); text-align: left; } button.selected { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); } small { color: var(--accent); text-transform: uppercase; font-weight: 900; font-size: .6rem; }
  @media (max-width: 680px) { header { align-items: start; flex-direction: column; } .focuses { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
