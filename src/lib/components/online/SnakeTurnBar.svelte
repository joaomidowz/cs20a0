<script lang="ts">
  import { playGameSound } from '$lib/game/offlineAudio';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import { snakeTurnParticipantAt } from '$lib/game/online/snake-draft';
  import type { PublicParticipant, PublicSnake } from '$lib/game/online/contracts';
  import type { Language } from '$lib/game/types';

  /**
   * Fila Draft: quem está escolhendo, quanto falta e quem vem depois — fixo no topo (sticky) para ninguém precisar rolar.
   * O relógio e o tique dos últimos segundos moram aqui; o tabuleiro fica só com o pool.
   */
  export let snake: PublicSnake;
  export let participants: PublicParticipant[] = [];
  export let selfId: string;
  export let language: Language = 'pt-BR';
  /** Relógio do servidor (Date.now() + offset), atualizado pela página a cada tick. */
  export let now: number = Date.now();

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: nameOf = (participantId: string | null) => (participantId ? participants.find((participant) => participant.id === participantId)?.organizationName ?? '?' : '');
  $: myTurn = snake.turnParticipantId === selfId;
  $: seconds = snake.turnEndsAt === null ? null : Math.max(0, Math.ceil((snake.turnEndsAt - now) / 1_000));
  $: nextId = snakeTurnParticipantAt(snake.order, snake.turn + 1);
  $: myPicks = Object.values(snake.taken).filter((participantId) => participantId === selfId).length;
  $: picksLeft = Math.max(0, snake.picksPerParticipant - myPicks);

  let lastTick = -1;
  $: if (myTurn && seconds !== null && seconds <= 5 && seconds > 0 && seconds !== lastTick) { lastTick = seconds; playGameSound('tick'); }
  $: if (!myTurn) lastTick = -1;
</script>

{#key myTurn}
<div class="turn-bar" class:my-turn={myTurn} class:urgent={myTurn && seconds !== null && seconds <= 5} role="status" aria-live="polite">
  <div class="who">
    <span class="eyebrow">{t('snakeTurnCounter').replace('{i}', String(Math.min(snake.turn + 1, snake.totalTurns))).replace('{n}', String(snake.totalTurns))}</span>
    <strong>{#if myTurn}{t('snakeYourTurn')}{:else}{t('snakeTurnOf').replace('{name}', nameOf(snake.turnParticipantId))}{/if}</strong>
    <small>{#if nextId}{t('snakeNextUp').replace('{name}', nextId === selfId ? t('snakeYou') : nameOf(nextId))} · {/if}{t('snakePicksLeft').replace('{n}', String(picksLeft))}</small>
  </div>
  {#if seconds !== null}
    <div class="clock" role="timer" aria-label={`${seconds}s`}><strong>{seconds}</strong><small>s</small></div>
  {/if}
</div>
{/key}

<style>
  .turn-bar { position: sticky; top: 140px; z-index: 9; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; margin-bottom: 12px; padding: 10px 14px; border: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 92%, transparent); backdrop-filter: blur(8px); animation: turnIn 520ms var(--ease-out-strong) both; }
  .turn-bar.my-turn { border-color: var(--accent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 8px 28px color-mix(in srgb, var(--accent) 18%, transparent); animation: turnIn 520ms var(--ease-out-strong) both, turnPulse 1.6s ease-in-out infinite 520ms; }
  .who { display: grid; gap: 2px; min-width: 0; }
  .who strong { font-size: clamp(1rem, .9rem + .8vw, 1.4rem); line-height: 1.1; overflow-wrap: anywhere; }
  .my-turn .who strong { color: var(--accent); }
  .who small { color: var(--muted); font-size: .72rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .clock { display: grid; grid-auto-flow: column; align-items: baseline; gap: 2px; min-width: 60px; padding: 6px 10px; border: 1px solid var(--line); background: var(--surface-2); font-variant-numeric: tabular-nums; justify-content: center; }
  .clock strong { font-size: 1.5rem; line-height: 1; }
  .clock small { color: var(--muted); font-size: .7rem; font-weight: 800; }
  .urgent .clock { border-color: var(--accent-2); color: var(--accent-2); animation: turnUrgent .8s ease-in-out infinite; }
  @keyframes turnIn { from { background: color-mix(in srgb, var(--accent) 24%, var(--surface)); transform: translateY(-4px); } to { transform: none; } }
  @keyframes turnPulse { 50% { box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent), 0 8px 20px color-mix(in srgb, var(--accent) 6%, transparent); } }
  @keyframes turnUrgent { 50% { opacity: .55; } }
  @media (max-width: 720px) { .turn-bar { top: 118px; padding: 8px 12px; } }
  @media (prefers-reduced-motion: reduce) { .turn-bar, .turn-bar.my-turn, .urgent .clock { animation: none; } }
</style>
