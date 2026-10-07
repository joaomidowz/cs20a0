<script lang="ts">
  import { onMount } from 'svelte';
  import CollectionCard from './CollectionCard.svelte';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import type { PublicParticipant, PublicSnake } from '$lib/game/online/contracts';
  import type { Language, Player } from '$lib/game/types';

  /**
   * Fila Draft: o pool compartilhado da sala e de quem é a vez. Só apresentação — quem decide turno, prazo e
   * carta válida é o servidor; aqui a carta livre abre a ficha (na vez do jogador ela confirma, fora dela só lê).
   */
  export let snake: PublicSnake;
  export let participants: PublicParticipant[] = [];
  export let selfId: string;
  export let players: Map<string, Player>;
  export let language: Language = 'pt-BR';
  export let teamName: (player: Player) => string = () => '';
  /** Relógio do servidor (Date.now() + offset), atualizado pela página a cada tick. */
  export let now: number = Date.now();
  export let onOpen: (player: Player) => void = () => {};

  /** No celular as cartas ficam densas (foto + nome), para o pool inteiro caber sem rolagem infinita. */
  let dense = false;
  onMount(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const apply = () => { dense = media.matches; };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  });

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: nameOf = (participantId: string) => participants.find((participant) => participant.id === participantId)?.organizationName ?? '?';
  $: myTurn = snake.turnParticipantId === selfId;
  $: seconds = snake.turnEndsAt === null ? null : Math.max(0, Math.ceil((snake.turnEndsAt - now) / 1_000));
  $: myPicks = Object.values(snake.taken).filter((participantId) => participantId === selfId).length;
  $: picksLeft = Math.max(0, snake.picksPerParticipant - myPicks);
  /** Da carta mais forte à mais fraca: com 30 s por vez, o olho precisa achar o GOAT sem rolar a grade. */
  $: cards = snake.pool
    .map((id) => ({ id, player: players.get(id) ?? null, takenBy: snake.taken[id] ?? null }))
    .sort((left, right) => (right.player?.overall ?? 0) - (left.player?.overall ?? 0) || left.id.localeCompare(right.id));
  $: freeCount = cards.filter((card) => !card.takenBy).length;
  $: roundIndex = snake.order.length ? Math.floor(snake.turn / snake.order.length) : 0;
  /** Rodadas ímpares correm ao contrário: a faixa de ordem mostra a direção atual para ninguém se perder. */
  $: reversed = roundIndex % 2 === 1;
</script>

<section class="snake-board panel" class:my-turn={myTurn} aria-live="polite">
  <header class="snake-head">
    <div class="snake-title">
      <span class="eyebrow">SNAKE DRAFT · {Math.min(snake.turn + 1, snake.totalTurns)}/{snake.totalTurns}</span>
      <h2>{#if snake.turnParticipantId === null}{t('snakePoolTitle')}{:else if myTurn}{t('snakeYourTurn')}{:else}{t('snakeTurnOf').replace('{name}', nameOf(snake.turnParticipantId))}{/if}</h2>
      <p class="snake-sub">{myTurn ? t('snakePicksLeft').replace('{n}', String(picksLeft)) : `${t('snakeWaitingTurn')} · ${t('snakePicksLeft').replace('{n}', String(picksLeft))}`}</p>
    </div>
    {#if seconds !== null}
      <div class="snake-clock" class:urgent={seconds <= 5} role="timer" aria-label={`${seconds}s`}>
        <strong>{seconds}</strong><small>s</small>
      </div>
    {/if}
  </header>

  <div class="snake-order" role="list" aria-label={t('snakeOrder')}>
    <span class="eyebrow">{t('snakeOrder')} {reversed ? '←' : '→'}</span>
    <ol>
      {#each snake.order as participantId, index (participantId)}
        <li role="listitem" class:current={participantId === snake.turnParticipantId} class:me={participantId === selfId}>
          <b>{index + 1}</b><span>{nameOf(participantId)}</span>
        </li>
      {/each}
    </ol>
  </div>

  <div class="snake-pool-head">
    <span class="eyebrow">{t('snakePoolTitle')}</span>
    <small>{freeCount}/{snake.pool.length}</small>
  </div>
  <div class="snake-grid" class:dense class:waiting={!myTurn}>
    {#each cards as card, index (card.id)}
      {#if card.player}
        <div class="snake-card" class:taken={Boolean(card.takenBy)} class:mine={card.takenBy === selfId} data-offline-player={card.player.id} style={`--reveal-delay: ${Math.min(index, 24) * 30}ms`}>
          <CollectionCard
            player={card.player}
            teamName={teamName(card.player)}
            {language}
            compact
            {dense}
            inLineup={card.takenBy === selfId}
            tag={card.takenBy ? t('snakeTakenBy').replace('{name}', nameOf(card.takenBy)) : ''}
            onOpen={card.takenBy ? null : onOpen}
          />
        </div>
      {/if}
    {/each}
  </div>
</section>

<style>
  .snake-board { display: grid; gap: 14px; }
  .snake-board.my-turn { border-color: var(--accent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent), 0 0 32px color-mix(in srgb, var(--accent) 14%, transparent); }
  .snake-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; }
  .snake-title { display: grid; gap: 4px; min-width: 0; }
  .snake-title h2 { margin: 0; font-size: clamp(1.1rem, 1rem + .8vw, 1.5rem); line-height: 1.1; overflow-wrap: anywhere; }
  .snake-sub { margin: 0; color: var(--muted); font-size: .78rem; font-weight: 700; }
  .my-turn .snake-sub { color: var(--accent); }
  .snake-clock { display: grid; grid-auto-flow: column; align-items: baseline; gap: 2px; min-width: 64px; padding: 8px 12px; border: 1px solid var(--line); background: var(--surface-2); font-variant-numeric: tabular-nums; justify-content: center; }
  .snake-clock strong { font-size: 1.6rem; line-height: 1; }
  .snake-clock small { color: var(--muted); font-size: .7rem; font-weight: 800; }
  .snake-clock.urgent { border-color: var(--accent-2); color: var(--accent-2); animation: snakeUrgent .8s ease-in-out infinite; }
  .snake-order { display: grid; gap: 6px; }
  .snake-order ol { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .snake-order li { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 4px 8px 4px 4px; border: 1px solid var(--line); color: var(--muted); font-size: .72rem; font-weight: 700; transition: border-color var(--dur-ui) var(--ease-out-strong), color var(--dur-ui) var(--ease-out-strong), transform var(--dur-ui) var(--ease-out-strong); }
  .snake-order li b { display: grid; place-items: center; width: 18px; height: 18px; background: var(--surface-2); font-size: .62rem; }
  .snake-order li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .snake-order li.me { color: var(--text); }
  .snake-order li.current { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
  .snake-order li.current b { background: var(--accent); color: #0a0d08; }
  .snake-pool-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .snake-pool-head small { color: var(--muted); font-size: .72rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  .snake-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .snake-grid.dense { grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; }
  .snake-card { position: relative; animation: snakeIn var(--dur-reveal) var(--ease-out-strong) both; animation-delay: var(--reveal-delay, 0ms); transition: opacity var(--dur-ui) ease, filter var(--dur-ui) ease; }
  .snake-card.taken { opacity: .45; filter: grayscale(.6); pointer-events: none; }
  .snake-card.taken.mine { opacity: .85; filter: none; }
  /* Fora da vez o pool continua legível (a ficha abre só para leitura), mas o tom baixa para a atenção ir para o cabeçalho. */
  .snake-grid.waiting .snake-card:not(.taken) { opacity: .9; }
  @keyframes snakeIn { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
  @keyframes snakeUrgent { 50% { opacity: .55; } }
  @media (max-width: 420px) {
    .snake-head { grid-template-columns: minmax(0, 1fr); }
    .snake-clock { justify-self: start; }
  }
  @media (max-width: 340px) {
    .snake-grid.dense { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .snake-card { animation: none; transition: none; }
    .snake-clock.urgent { animation: none; }
    .snake-order li { transition: none; transform: none; }
  }
</style>
