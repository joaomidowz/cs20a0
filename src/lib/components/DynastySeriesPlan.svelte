<script lang="ts">
  import SegmentedControl from '$lib/components/SegmentedControl.svelte';
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
  $: if (studiesLeft <= 0) study = false;
  const copy = {
    'pt-BR': { title: 'Plano da série', versus: 'Adversário', style: 'Estilo', tactic: 'Tática do coach', study: 'Estudo', noStudy: 'Sem estudo', studyLeft: 'Estudar', left: 'restantes', confirm: 'Confirmar plano', standard: 'Padrão', pressure: 'Pressão', control: 'Controle', antistrat: 'Anti-strat', aggressive: 'Agressivo', balanced: 'Controlador', tactical: 'Tático',
      effect: { standard: 'Sem ajuste: o time joga o seu jogo base.', pressure: 'Pressão: mais força no ataque, mais risco na defesa.', control: 'Controle: ritmo cadenciado e defesa mais sólida.', antistrat: 'Anti-strat: foca em anular os pontos fortes do rival.' } },
    es: { title: 'Plan de la serie', versus: 'Rival', style: 'Estilo', tactic: 'Táctica del coach', study: 'Estudio', noStudy: 'Sin estudio', studyLeft: 'Estudiar', left: 'restantes', confirm: 'Confirmar plan', standard: 'Estándar', pressure: 'Presión', control: 'Control', antistrat: 'Anti-strat', aggressive: 'Agresivo', balanced: 'Controlador', tactical: 'Táctico',
      effect: { standard: 'Sin ajuste: el equipo juega su juego base.', pressure: 'Presión: más fuerza en ataque, más riesgo en defensa.', control: 'Control: ritmo pausado y defensa más sólida.', antistrat: 'Anti-strat: busca anular los puntos fuertes del rival.' } },
    en: { title: 'Series plan', versus: 'Opponent', style: 'Style', tactic: 'Coach tactic', study: 'Study', noStudy: 'No study', studyLeft: 'Study', left: 'left', confirm: 'Confirm plan', standard: 'Standard', pressure: 'Pressure', control: 'Control', antistrat: 'Anti-strat', aggressive: 'Aggressive', balanced: 'Controller', tactical: 'Tactical',
      effect: { standard: 'No adjustment: the team plays its base game.', pressure: 'Pressure: stronger attack, riskier defense.', control: 'Control: slower tempo and a sturdier defense.', antistrat: 'Anti-strat: focuses on shutting down the opponent’s strengths.' } }
  } as const;
  $: c = copy[language];
  $: styleOptions = (['aggressive', 'balanced', 'tactical'] as const).map((value) => ({ value, label: c[value] }));
  $: tacticOptions = (['standard', 'pressure', 'control', 'antistrat'] as const).map((value) => ({ value, label: c[value] }));
  $: studyOptions = [{ value: 'no', label: c.noStudy }, { value: 'yes', label: `${c.studyLeft} · ${studiesLeft} ${c.left}` }];
</script>

<section class="series-plan panel">
  <header>
    <span class="eyebrow">DINASTIA · PRE-SERIES</span>
    <h2>{c.title}</h2>
    <p class="versus">{c.versus}: <strong>{opponent}</strong></p>
    {#if tactic}<p class="effect">{c.effect[tactic]}</p>{/if}
  </header>
  <div class="match-controls plan-controls">
    <div class="control-group">
      <span>{c.style}</span>
      <SegmentedControl value={style} label={c.style} options={styleOptions} onChange={(value) => { style = value as OrgStyle; }} />
    </div>
    <div class="control-group">
      <span>{c.tactic}</span>
      <SegmentedControl value={tactic} label={c.tactic} options={tacticOptions} onChange={(value) => { tactic = value as CoachTactic; }} />
    </div>
    <div class="control-group">
      <span>{c.study}</span>
      <SegmentedControl value={study ? 'yes' : 'no'} label={c.study} options={studyOptions} disabled={studiesLeft <= 0} onChange={(value) => { study = value === 'yes'; }} />
    </div>
  </div>
  <button class="primary" type="button" on:click={() => onConfirm({ style, tactic, study })}>{c.confirm} →</button>
</section>

<style>
  .series-plan { display: grid; gap: 14px; padding: 18px; min-width: 0; }
  header { display: grid; gap: 4px; min-width: 0; }
  h2, p { margin: 0; }
  .versus { color: var(--muted); }
  .versus strong { color: var(--text); font-size: 1.2rem; }
  .effect { color: var(--accent); font-size: .8rem; }
  .plan-controls { grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; padding: 0; }
  .plan-controls .control-group:nth-child(2) { grid-column: span 2; }
  @media (max-width: 679px) {
    .plan-controls { grid-template-columns: 1fr; }
    .plan-controls .control-group:nth-child(2) { grid-column: auto; }
    .plan-controls :global(.segmented-control) { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
