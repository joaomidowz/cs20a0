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
  $: if (studiesLeft <= 0) study = false;

  const STYLES = ['aggressive', 'balanced', 'tactical'] as const;
  const TACTICS = ['standard', 'pressure', 'control', 'antistrat'] as const;
  const copy = {
    'pt-BR': {
      title: 'Plano da série', versus: 'Adversário', style: 'Estilo', tactic: 'Tática do coach', study: 'Estudo do adversário',
      studyOn: 'Estudar este rival', studyHint: 'Gasta 1 estudo e melhora a leitura do adversário.', noStudies: 'Sem estudos neste Major.', left: 'restantes', confirm: 'Confirmar plano',
      names: { aggressive: 'Agressivo', balanced: 'Controlador', tactical: 'Tático', standard: 'Padrão', pressure: 'Pressão', control: 'Controle', antistrat: 'Anti-strat' },
      hints: { aggressive: 'Entry e poder de fogo', balanced: 'Consistência e mental', tactical: 'IGL e estudo rendem mais', standard: 'Jogo base, sem ajuste', pressure: 'Ataque forte, defesa arriscada', control: 'Ritmo lento, pausa melhor', antistrat: 'Anula os pontos fortes' }
    },
    es: {
      title: 'Plan de la serie', versus: 'Rival', style: 'Estilo', tactic: 'Táctica del coach', study: 'Estudio del rival',
      studyOn: 'Estudiar a este rival', studyHint: 'Gasta 1 estudio y mejora la lectura del rival.', noStudies: 'Sin estudios en este Major.', left: 'restantes', confirm: 'Confirmar plan',
      names: { aggressive: 'Agresivo', balanced: 'Controlador', tactical: 'Táctico', standard: 'Estándar', pressure: 'Presión', control: 'Control', antistrat: 'Anti-strat' },
      hints: { aggressive: 'Entry y potencia de fuego', balanced: 'Consistencia y mental', tactical: 'IGL y estudio rinden más', standard: 'Juego base, sin ajuste', pressure: 'Ataque fuerte, defensa arriesgada', control: 'Ritmo lento, mejor pausa', antistrat: 'Anula los puntos fuertes' }
    },
    en: {
      title: 'Series plan', versus: 'Opponent', style: 'Style', tactic: 'Coach tactic', study: 'Opponent study',
      studyOn: 'Study this opponent', studyHint: 'Spends 1 study and sharpens the read on the opponent.', noStudies: 'No studies left this Major.', left: 'left', confirm: 'Confirm plan',
      names: { aggressive: 'Aggressive', balanced: 'Controller', tactical: 'Tactical', standard: 'Standard', pressure: 'Pressure', control: 'Control', antistrat: 'Anti-strat' },
      hints: { aggressive: 'Entry and firepower', balanced: 'Consistency and mental', tactical: 'IGL and study pay off more', standard: 'Base game, no adjustment', pressure: 'Strong attack, risky defense', control: 'Slow tempo, better timeouts', antistrat: 'Shuts down their strengths' }
    }
  } as const;
  $: c = copy[language];
</script>

<section class="series-plan panel">
  <header>
    <div>
      <span class="eyebrow">Dinastia · pre-series</span>
      <h2>{c.title}</h2>
    </div>
    <p class="versus"><small>{c.versus}</small><strong>{opponent}</strong></p>
  </header>

  <fieldset>
    <legend>{c.style}</legend>
    <div class="options styles" role="radiogroup" aria-label={c.style}>
      {#each STYLES as value}
        <button type="button" role="radio" aria-checked={style === value} class:active={style === value} on:click={() => { style = value; }}>
          <strong>{c.names[value]}</strong><small>{c.hints[value]}</small>
        </button>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>{c.tactic}</legend>
    <div class="options tactics" role="radiogroup" aria-label={c.tactic}>
      {#each TACTICS as value}
        <button type="button" role="radio" aria-checked={tactic === value} class:active={tactic === value} on:click={() => { tactic = value; }}>
          <strong>{c.names[value]}</strong><small>{c.hints[value]}</small>
        </button>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>{c.study}</legend>
    <button type="button" class="study" role="switch" aria-checked={study} class:active={study} disabled={studiesLeft <= 0} on:click={() => { study = !study; }}>
      <span class="switch" aria-hidden="true"><i></i></span>
      <span class="study-text"><strong>{c.studyOn}</strong><small>{studiesLeft > 0 ? c.studyHint : c.noStudies}</small></span>
      <span class="count"><b>{studiesLeft}</b>{c.left}</span>
    </button>
  </fieldset>

  <button class="primary confirm" type="button" disabled={!style || !tactic} on:click={() => onConfirm({ style, tactic, study })}>{c.confirm} →</button>
</section>

<style>
  .series-plan { display: grid; gap: 18px; padding: 20px; min-width: 0; }
  header { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 10px 20px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
  h2, p { margin: 0; }
  .versus { display: grid; justify-items: end; gap: 2px; min-width: 0; }
  .versus small { color: var(--muted); font-size: .66rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .versus strong { font-size: 1.35rem; overflow-wrap: anywhere; text-align: right; }
  fieldset { display: grid; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0; }
  legend { padding: 0 0 8px; color: var(--muted); font-size: .66rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .options { display: grid; gap: 8px; }
  .styles { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .tactics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .options button, .study {
    display: grid; gap: 4px; align-content: start; min-width: 0; min-height: 64px; padding: 12px 14px;
    border: 1px solid var(--line); border-radius: 4px; background: var(--surface-2); color: var(--text);
    font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, background .15s, transform .15s;
  }
  .options button:hover, .study:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .options button:focus-visible, .study:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .options button.active, .study.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 11%, var(--surface-2)); box-shadow: inset 3px 0 0 var(--accent); }
  .options strong, .study strong { font-size: .82rem; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; overflow-wrap: anywhere; }
  .options button.active strong, .study.active strong { color: var(--accent); }
  .options small, .study small { color: var(--muted); font-size: .72rem; line-height: 1.3; overflow-wrap: anywhere; }
  .study { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px; }
  .study:disabled { cursor: not-allowed; opacity: .55; }
  .study-text { display: grid; gap: 3px; min-width: 0; }
  .switch { position: relative; width: 38px; height: 22px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); }
  .switch i { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--muted); transition: transform .15s, background .15s; }
  .study.active .switch { border-color: var(--accent); }
  .study.active .switch i { transform: translateX(16px); background: var(--accent); }
  .count { display: grid; justify-items: center; color: var(--muted); font-size: .6rem; font-weight: 800; text-transform: uppercase; }
  .count b { color: var(--text); font-size: 1.3rem; line-height: 1; }
  .confirm { min-height: 50px; }
  @media (max-width: 679px) {
    .series-plan { padding: 16px; }
    .versus { justify-items: start; }
    .versus strong { text-align: left; }
    .styles { grid-template-columns: 1fr; }
    .tactics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .options button { min-height: 0; }
  }
  @media (prefers-reduced-motion: reduce) { .options button, .study, .switch i { transition: none; } }
</style>
