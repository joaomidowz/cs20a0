<script lang="ts">
  import type { Coach, Language, Player, SeriesPlan } from '$lib/game/types';
  export let players: Player[] = [];
  export let coach: Coach | null = null;
  export let plan: SeriesPlan;
  export let power = 0;
  export let studiesLeft = 0;
  export let language: Language = 'pt-BR';
  $: labels = language === 'en' ? { title: 'Team analysis', power: 'Effective power', coach: 'Coach', studies: 'Studies left' } : language === 'es' ? { title: 'Análisis del equipo', power: 'Poder efectivo', coach: 'Coach', studies: 'Estudios restantes' } : { title: 'Análise do time', power: 'Poder efetivo', coach: 'Coach', studies: 'Estudos restantes' };
</script>

<section class="team-panel panel">
  <header><div><span class="eyebrow">DINASTIA</span><h2>{labels.title}</h2></div><strong>{power.toFixed(1)}</strong></header>
  <div class="metrics"><span>{labels.power} <b>{power.toFixed(1)}</b></span><span>{labels.coach} <b>{coach?.name ?? '—'}</b></span><span>{labels.studies} <b>{studiesLeft}</b></span><span>{plan.style} · {plan.tactic}</span></div>
  <div class="roster">{#each players as player}<article><b>{player.nickname}</b><span>OVR {player.overall ?? '—'}</span><small>{player.role}</small></article>{/each}</div>
</section>

<style>
  .team-panel { display: grid; gap: 18px; padding: 18px; }
  header { display: flex; justify-content: space-between; align-items: end; } h2 { margin: 0; } header > strong { color: var(--accent); font-size: 2rem; }
  .metrics, .roster { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .metrics span, article { padding: 12px; border: 1px solid var(--line); background: var(--surface-2); }
  .metrics b, article span { color: var(--accent); } article { display: grid; gap: 4px; } article small { color: var(--muted); }
</style>
