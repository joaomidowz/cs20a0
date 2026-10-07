<script lang="ts">
  import CoachCard from './CoachCard.svelte';
  import { translate } from '$lib/game/i18n';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import type { Coach, Language } from '$lib/game/types';

  /**
   * Fila Draft (protocolo 13): o pool de coaches da sala, igual para todos. Quem contrata primeiro leva; a carta tomada
   * fica apagada com o nome de quem levou. Só apresentação — a corrida é decidida pelo servidor (COACH_TAKEN para quem perde).
   */
  export let coaches: Coach[] = [];
  export let taken: Record<string, string> = {};
  export let selfId: string;
  export let myCoachId: string | null = null;
  export let nameOf: (participantId: string) => string = () => '?';
  export let teamLabel: (teamId: string) => string = (teamId) => teamId;
  export let language: Language = 'pt-BR';
  /** Fechado enquanto o snake não terminou: dá para estudar os coaches, mas não contratar. */
  export let open = true;
  /** Coach cujo `pick-coach` já foi enviado e ainda não voltou no snapshot. */
  export let pendingId: string | null = null;
  export let onPick: (coach: Coach) => void = () => {};

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: g = (key: Parameters<typeof translate>[1]) => translate(language, key);
  $: freeCount = coaches.filter((coach) => !taken[coach.id]).length;
</script>

<div class="coach-pool" class:locked={!open}>
  <header class="pool-head">
    <div><span class="eyebrow">COACH</span><h2>{t('snakeCoachPoolTitle')}</h2><p>{open ? t('snakeCoachPoolHint') : t('snakeCoachPoolLocked')}</p></div>
    <small>{t('snakeCoachFree').replace('{n}', String(freeCount))} · {coaches.length}</small>
  </header>
  <div class="pool-grid">
    {#each coaches as coach, index (coach.id)}
      {@const owner = taken[coach.id] ?? null}
      {@const mine = owner === selfId || coach.id === myCoachId}
      <div class="coach-slot" class:taken={Boolean(owner) && !mine} class:mine style={`--reveal-delay:${index * 60}ms`}>
        <CoachCard {coach} teamName={teamLabel(coach.teamId)} active={mine} tag={owner && !mine ? t('snakeCoachTakenBy').replace('{name}', nameOf(owner)) : ''}>
          <button class="primary pick" type="button" disabled={!open || (Boolean(owner) && !mine) || Boolean(pendingId)} on:click={() => onPick(coach)}>
            {pendingId === coach.id ? '…' : g('coachPick')}
          </button>
        </CoachCard>
      </div>
    {/each}
  </div>
</div>

<style>
  .coach-pool { display: grid; gap: 14px; }
  .pool-head { display: flex; justify-content: space-between; align-items: end; gap: 12px; }
  .pool-head h2 { margin: 2px 0 4px; }
  .pool-head p { margin: 0; color: var(--muted); font-size: .8rem; max-width: 60ch; }
  .pool-head small { flex: none; color: var(--muted); font-size: .72rem; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pool-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; max-width: 980px; margin: 0 auto; width: 100%; }
  .coach-slot { min-width: 0; animation: coachIn var(--dur-reveal) var(--ease-out-strong) both; animation-delay: var(--reveal-delay, 0ms); transition: opacity 420ms var(--ease-out-soft), filter 420ms var(--ease-out-soft), transform 420ms var(--ease-out-strong); }
  .coach-slot.taken { opacity: .42; filter: grayscale(.7); transform: scale(.97); }
  .coach-slot.taken :global(.face) { pointer-events: none; }
  .locked .coach-slot :global(.card) { opacity: .85; }
  .pick { width: 100%; min-height: 40px; }
  @keyframes coachIn { from { opacity: 0; transform: translateY(10px) scale(.96); } to { opacity: 1; transform: none; } }
  @media (max-width: 720px) { .pool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } .pool-head { flex-direction: column; align-items: start; } }
  @media (prefers-reduced-motion: reduce) { .coach-slot { animation: none; transition: none; } }
</style>
