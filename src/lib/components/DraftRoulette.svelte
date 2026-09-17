<script lang="ts">
  import { get } from 'svelte/store';
  import Roulette, { type RouletteEntry } from './Roulette.svelte';
  import { getCatalogContext } from '$lib/game/catalogContext';
  import type { HistoricalTeam, Language } from '$lib/game/types';

  export let candidates: HistoricalTeam[];
  export let result: HistoricalTeam;
  export let anonymous = false;
  export let language: Language = 'en';
  export let onComplete: () => void;
  export let duration = 2800;

  // Org ids come from the page's catalog (core on /online: none there, the crest keys on the name).
  const catalog = get(getCatalogContext());
  const toEntry = (team: HistoricalTeam): RouletteEntry => ({
    id: team.id,
    avatar: (team.name ?? 'T').slice(0, 2).toUpperCase(),
    title: team.name ?? 'Team',
    subtitle: team.year ? String(team.year) : '',
    badge: { id: team.id, name: team.name ?? 'Team', orgId: catalog.teamOrgId(team) }
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
