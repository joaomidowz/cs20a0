<script lang="ts">
  import DynastyCardSheet from './DynastyCardSheet.svelte';
  import DynastyCoachCard from './DynastyCoachCard.svelte';
  import DynastyPlayerCard from './DynastyPlayerCard.svelte';
  import { coachMajorHistory, playerMajorHistory } from '$lib/game/dynasty/cards';
  import { offRolePlayerIds, positionMultiplier } from '$lib/game/dynasty/position';
  import { translatePlacement } from '$lib/game/i18n';
  import type { Coach, DynastyMajorSummary, Language, Player, PlayerOverride, SelectedPlayer, SeriesPlan, TrainingFocus } from '$lib/game/types';

  export let players: Player[] = [];
  export let lineup: SelectedPlayer[] = [];
  export let coach: Coach | null = null;
  export let plan: SeriesPlan;
  export let power = 0;
  export let studiesLeft = 0;
  export let language: Language = 'pt-BR';
  export let training: TrainingFocus | null = null;
  export let history: DynastyMajorSummary[] = [];
  export let playerById: Map<string, Player> = new Map();
  export let overrides: Record<string, PlayerOverride> = {};
  export let teamLabel: (teamId: string) => string = (teamId) => teamId;

  const copy = {
    'pt-BR': { title: 'Análise do time', power: 'Poder efetivo', coach: 'Coach', studies: 'Estudos restantes', plan: 'Plano', training: 'Treino', positions: 'Posições', offRole: 'fora de posição', allGood: 'todas elegíveis', major: 'Major', placement: 'Colocação', rating: 'Rating', overall: 'OVR', evolution: 'Evolução', empty: 'Sem Majors registrados ainda', aggressive: 'Agressivo', balanced: 'Controlador', tactical: 'Tático', standard: 'Padrão', pressure: 'Pressão', control: 'Controle', antistrat: 'Anti-strat', aim: 'Mira', utility: 'Utilitária', clutch: 'Clutch', opening: 'Abertura', recovery: 'Recuperação' },
    es: { title: 'Análisis del equipo', power: 'Poder efectivo', coach: 'Coach', studies: 'Estudios restantes', plan: 'Plan', training: 'Entrenamiento', positions: 'Posiciones', offRole: 'fuera de posición', allGood: 'todas elegibles', major: 'Major', placement: 'Posición', rating: 'Rating', overall: 'OVR', evolution: 'Evolución', empty: 'Aún sin Majors registrados', aggressive: 'Agresivo', balanced: 'Controlador', tactical: 'Táctico', standard: 'Estándar', pressure: 'Presión', control: 'Control', antistrat: 'Anti-strat', aim: 'Puntería', utility: 'Utilidad', clutch: 'Clutch', opening: 'Apertura', recovery: 'Recuperación' },
    en: { title: 'Team analysis', power: 'Effective power', coach: 'Coach', studies: 'Studies left', plan: 'Plan', training: 'Training', positions: 'Positions', offRole: 'out of position', allGood: 'all eligible', major: 'Major', placement: 'Placement', rating: 'Rating', overall: 'OVR', evolution: 'Evolution', empty: 'No Majors recorded yet', aggressive: 'Aggressive', balanced: 'Controller', tactical: 'Tactical', standard: 'Standard', pressure: 'Pressure', control: 'Control', antistrat: 'Anti-strat', aim: 'Aim', utility: 'Utility', clutch: 'Clutch', opening: 'Opening', recovery: 'Recovery' }
  } as const;

  let sheet: { title: string; subtitle: string; headers: string[]; rows: string[][] } | null = null;

  $: labels = copy[language];
  $: offRole = offRolePlayerIds(players, lineup);
  $: roleOf = (playerId: string) => lineup.find((selected) => selected.playerId === playerId)?.selectedSlotRole ?? null;

  function openPlayer(player: Player) {
    const entries = playerMajorHistory(history, player, playerById);
    sheet = {
      title: player.nickname ?? player.id,
      subtitle: teamLabel(player.teamId ?? ''),
      headers: [labels.major, labels.placement, labels.rating, labels.overall, labels.training, labels.evolution],
      rows: entries.map((entry) => [
        `#${entry.majorNumber}`,
        translatePlacement(language, entry.placement),
        entry.rating === null ? '—' : entry.rating.toFixed(2),
        entry.overall === null ? '—' : String(entry.overall),
        entry.training ? labels[entry.training] : '—',
        entry.evolution ? `${entry.evolution.overallBefore} → ${entry.evolution.overallAfter}` : '—'
      ])
    };
  }

  function openCoach(current: Coach) {
    sheet = {
      title: current.name,
      subtitle: teamLabel(current.teamId),
      headers: [labels.major, labels.placement, labels.rating],
      rows: coachMajorHistory(history, current.id).map((entry) => [`#${entry.majorNumber}`, translatePlacement(language, entry.placement), entry.averageRating === null ? '—' : entry.averageRating.toFixed(2)])
    };
  }
</script>

<section class="team-panel">
  <header>
    <div><span class="eyebrow">DINASTIA</span><h2>{labels.title}</h2></div>
    <strong>{power.toFixed(1)}</strong>
  </header>

  <div class="metrics">
    <span>{labels.power}<b>{power.toFixed(1)}</b></span>
    <span>{labels.plan}<b>{labels[plan.style]} · {labels[plan.tactic]}</b></span>
    <span>{labels.studies}<b>{studiesLeft}</b></span>
    <span>{labels.training}<b>{training ? labels[training] : '—'}</b></span>
    <span class:warn={offRole.length > 0}>{labels.positions}<b>{offRole.length ? `${offRole.length} ${labels.offRole} · ×${positionMultiplier(offRole.length).toFixed(3)}` : labels.allGood}</b></span>
  </div>

  <div class="cards">
    {#each players as player (player.id)}
      <DynastyPlayerCard
        {player}
        role={roleOf(player.id)}
        offRole={offRole.includes(player.id)}
        training={overrides[player.id]?.training ?? null}
        teamLabel={teamLabel(player.teamId ?? '')}
        {language}
        compact
        onOpen={() => openPlayer(player)}
      />
    {/each}
  </div>
  {#if coach}
    <DynastyCoachCard {coach} teamLabel={teamLabel(coach.teamId)} {language} layout="strip" label={labels.coach} onOpen={() => coach && openCoach(coach)} />
  {/if}
</section>

{#if sheet}
  <DynastyCardSheet title={sheet.title} subtitle={sheet.subtitle} headers={sheet.headers} rows={sheet.rows} emptyLabel={labels.empty} {language} onClose={() => (sheet = null)} />
{/if}

<style>
  .team-panel { container-type: inline-size; display: grid; gap: 12px; min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  header { display: flex; justify-content: space-between; align-items: end; gap: 12px; }
  h2 { margin: 0; }
  header > strong { color: var(--accent); font: 900 2.4rem/1 'Arial Narrow', Impact, sans-serif; }
  .metrics { display: grid; gap: 6px; grid-auto-flow: row dense; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .metrics span { display: grid; gap: 2px; min-width: 0; padding: 7px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-2); color: var(--muted); font-size: .58rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  .metrics b { overflow: hidden; color: var(--text); font-size: .84rem; letter-spacing: 0; text-overflow: ellipsis; text-transform: none; white-space: nowrap; }
  .metrics .warn b { color: var(--accent-2); }
  .metrics span:nth-child(2), .metrics span:last-child { grid-column: 1 / -1; }
  .cards { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @container (min-width: 560px) { .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @container (min-width: 900px) {
    .metrics { grid-template-columns: auto minmax(0, 1.4fr) auto minmax(0, 1fr) minmax(0, 1.6fr); }
    .metrics span:nth-child(2), .metrics span:last-child { grid-column: auto; }
  }
  @container (min-width: 1100px) { .cards { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
</style>
