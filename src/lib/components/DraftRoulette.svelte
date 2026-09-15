<script lang="ts">
  import Roulette, { type RouletteEntry } from './Roulette.svelte';
  import type { HistoricalTeam, Language } from '$lib/game/types';

  export let candidates: HistoricalTeam[];
  export let result: HistoricalTeam;
  export let anonymous = false;
  export let language: Language = 'en';
  export let onComplete: () => void;
  export let duration = 2800;

  const toEntry = (team: HistoricalTeam): RouletteEntry => ({
    id: team.id,
    avatar: (team.name ?? 'T').slice(0, 2).toUpperCase(),
    title: team.name ?? 'Team',
    subtitle: team.year ? String(team.year) : ''
  });

  const entries = candidates.map(toEntry);
  const winner = toEntry(result);
  $: labels = language === 'pt-BR'
    ? { spinning: 'Sorteando time…', skip: 'Pular animação', hidden: 'Oferta oculta' }
    : language === 'es'
      ? { spinning: 'Sorteando equipo…', skip: 'Saltar animación', hidden: 'Oferta oculta' }
      : { spinning: 'Drawing team…', skip: 'Skip animation', hidden: 'Hidden offer' };
</script>

<Roulette {entries} result={winner} {anonymous} {labels} {onComplete} {duration} />
