<!-- src/lib/components/CoachDraft.svelte -->
<script lang="ts">
  import { translate } from '$lib/game/i18n';
  import type { Coach, Language } from '$lib/game/types';
  import DynastyCoachCard from './DynastyCoachCard.svelte';
  import Roulette, { type RouletteEntry } from './Roulette.svelte';

  export let offer: Coach[] = [];
  export let language: Language = 'pt-BR';
  export let rerollsLeft = 0;
  export let teamLabel: (teamId: string) => string = (teamId) => teamId;
  export let onPick: (coach: Coach) => void = () => {};
  export let onReroll: () => void = () => {};

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  $: labels = language === 'pt-BR'
    ? { spinning: 'Sorteando coaches…', skip: 'Pular animação', hidden: 'Coach' }
    : language === 'es'
      ? { spinning: 'Sorteando coaches…', skip: 'Saltar animación', hidden: 'Coach' }
      : { spinning: 'Drawing coaches…', skip: 'Skip animation', hidden: 'Coach' };

  const toEntry = (coach: Coach): RouletteEntry => ({
    id: coach.id,
    avatar: String(coach.overall),
    title: coach.name,
    subtitle: teamLabel(coach.teamId)
  });

  // The offer is seeded (offerCoaches). Only the reel is decorative; a new offer (open or reroll) spins again.
  $: offerKey = offer.map((coach) => coach.id).join('|');
  let spunKey = '';
  let spinning = false;
  let revealed = false;
  $: if (offerKey && offerKey !== spunKey) {
    spunKey = offerKey;
    spinning = true;
    revealed = false;
  }
  // The reel only cycles the three offered coaches.
  $: reel = offer.map(toEntry);

  function spinDone() {
    spinning = false;
    revealed = true;
  }
</script>

<section class="coach-draft">
  {#if spinning && offer[0]}
    {#key spunKey}
      <Roulette entries={reel} result={toEntry(offer[0])} {labels} onComplete={spinDone} />
    {/key}
  {:else}
    <div class="coach-grid" class:revealed>
      {#each offer as coach, index (coach.id)}
        <div class="coach-slot" style={`--reveal-delay:${index * 90}ms`}>
          <DynastyCoachCard {coach} teamLabel={teamLabel(coach.teamId)} {language}>
            {#if coach.needsReview}<small class="coach-review">{t('coachNeedsReview')}</small>{/if}
            <button class="primary pick" type="button" on:click={() => onPick(coach)}>{t('coachPick')}</button>
          </DynastyCoachCard>
        </div>
      {/each}
    </div>
    <button class="secondary" type="button" disabled={rerollsLeft <= 0} on:click={onReroll}>{t('coachReroll')} ({rerollsLeft})</button>
  {/if}
</section>

<style>
  .coach-draft { display: grid; gap: 16px; justify-items: start; min-width: 0; }
  .coach-grid { display: grid; gap: 14px; width: 100%; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); perspective: 1100px; }
  .coach-slot { min-width: 0; }
  .coach-grid.revealed .coach-slot { animation: coach-flip 460ms cubic-bezier(.16, 1, .3, 1) backwards; animation-delay: var(--reveal-delay, 0ms); transform-style: preserve-3d; -webkit-backface-visibility: hidden; backface-visibility: hidden; }
  @keyframes coach-flip { from { transform: rotateY(90deg); opacity: .2; } to { transform: rotateY(0); opacity: 1; } }
  .pick { width: 100%; min-height: 40px; }
  .coach-review { flex-basis: 100%; color: var(--accent-2); font-size: .68rem; }
  @media (prefers-reduced-motion: reduce) { .coach-grid.revealed .coach-slot { animation: none; } }
</style>
