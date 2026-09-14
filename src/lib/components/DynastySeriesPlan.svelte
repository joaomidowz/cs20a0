<script lang="ts">
  import type { CoachTactic, Language, OrgStyle, SeriesPlan } from '$lib/game/types';

  export let language: Language = 'pt-BR';
  export let opponent = '';
  export let studiesLeft = 0;
  export let initial: SeriesPlan;
  export let onConfirm: (plan: SeriesPlan) => void = () => {};

  let style: OrgStyle;
  let tactic: CoachTactic;
  let study = false;
  $: if (initial) { style ??= initial.style; tactic ??= initial.tactic; }
  const copy = {
    'pt-BR': { title: 'Plano da série', versus: 'Adversário', style: 'Estilo', tactic: 'Tática do coach', study: 'Estudar adversário', confirm: 'Confirmar plano', standard: 'Padrão', pressure: 'Pressão', control: 'Controle', antistrat: 'Anti-strat', aggressive: 'Agressivo', balanced: 'Controlador', tactical: 'Tático' },
    es: { title: 'Plan de la serie', versus: 'Rival', style: 'Estilo', tactic: 'Táctica del coach', study: 'Estudiar rival', confirm: 'Confirmar plan', standard: 'Estándar', pressure: 'Presión', control: 'Control', antistrat: 'Anti-strat', aggressive: 'Agresivo', balanced: 'Controlador', tactical: 'Táctico' },
    en: { title: 'Series plan', versus: 'Opponent', style: 'Style', tactic: 'Coach tactic', study: 'Study opponent', confirm: 'Confirm plan', standard: 'Standard', pressure: 'Pressure', control: 'Control', antistrat: 'Anti-strat', aggressive: 'Aggressive', balanced: 'Controller', tactical: 'Tactical' }
  } as const;
  $: c = copy[language];
</script>

<section class="series-plan panel">
  <header><div><span class="eyebrow">DINASTIA · PRE-SERIES</span><h2>{c.title}</h2></div><p>{c.versus}: <strong>{opponent}</strong></p></header>
  <div class="fields">
    <label>{c.style}<select bind:value={style}>{#each ['aggressive', 'balanced', 'tactical'] as value}<option value={value}>{c[value as OrgStyle]}</option>{/each}</select></label>
    <label>{c.tactic}<select bind:value={tactic}>{#each ['standard', 'pressure', 'control', 'antistrat'] as value}<option value={value}>{c[value as CoachTactic]}</option>{/each}</select></label>
    <label class="study"><input type="checkbox" bind:checked={study} disabled={studiesLeft <= 0} /> {c.study} <b>{studiesLeft}</b></label>
  </div>
  <button class="primary" type="button" on:click={() => onConfirm({ style, tactic, study })}>{c.confirm} →</button>
</section>

<style>
  .series-plan { display: grid; gap: 16px; padding: 18px; }
  header { display: flex; justify-content: space-between; gap: 16px; align-items: end; }
  h2, p { margin: 0; } p { color: var(--muted); }
  .fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  label { display: grid; gap: 6px; color: var(--muted); font-size: .75rem; font-weight: 800; text-transform: uppercase; }
  select { min-width: 0; padding: 11px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: inherit; }
  .study { display: flex; align-items: center; color: var(--text); text-transform: none; }
  .study b { color: var(--accent); }
  @media (max-width: 680px) { header { align-items: start; flex-direction: column; } .fields { grid-template-columns: 1fr; } }
</style>
