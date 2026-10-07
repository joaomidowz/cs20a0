<script lang="ts">
  import { onMount } from 'svelte';
  import CollectionCard from './CollectionCard.svelte';
  import { playGameSound } from '$lib/game/offlineAudio';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import type { PublicParticipant, PublicSnake } from '$lib/game/online/contracts';
  import type { HistoricalTeam, Language, Player } from '$lib/game/types';
  import type { SnakeCardHint } from '$lib/game/online/snake-hints';
  import { ROLE_SHORT, snakeThemeName } from './snakeLabels';

  /**
   * Fila Draft: o pool compartilhado da sala e de quem é a vez. Só apresentação — quem decide turno, prazo e
   * carta válida é o servidor; aqui a carta livre abre a ficha (na vez do jogador ela confirma, fora dela só lê).
   * A ordem das cartas é a do sorteio (embaralhada): o pool chega "scrambled" de propósito, para ler o pool dar trabalho.
   */
  export let snake: PublicSnake;
  export let participants: PublicParticipant[] = [];
  export let selfId: string;
  export let players: Map<string, Player>;
  export let language: Language = 'pt-BR';
  export let teamName: (player: Player) => string = () => '';
  export let onOpen: (player: Player) => void = () => {};
  /** Dicas por carta livre (função central que falta, tema que cresce); vazio fora da vez do jogador ou sem picks. */
  export let cardHints: ReadonlyMap<string, SnakeCardHint> = new Map();
  export let teams: ReadonlyMap<string, HistoricalTeam> = new Map();

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: nameOf = (participantId: string) => participants.find((participant) => participant.id === participantId)?.organizationName ?? '?';
  $: myTurn = snake.turnParticipantId === selfId;
  $: myPicks = Object.values(snake.taken).filter((participantId) => participantId === selfId).length;
  $: picksLeft = Math.max(0, snake.picksPerParticipant - myPicks);
  $: cards = snake.pool.map((id) => ({ id, player: players.get(id) ?? null, takenBy: snake.taken[id] ?? null }));

  /** No celular (≤720px) a carta é a miniatura do deck, com a ficha inteira em letra miúda, quatro por fileira. */
  let dense = false;
  onMount(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const apply = () => { dense = media.matches; };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  });

  /**
   * Fantasmas da escolha: a carta recém-levada ganha uma cópia por cima que voa para o deck (minha) ou sai do pool
   * (de outro), enquanto a carta de verdade já aparece apagada no lugar. Some sozinha ao fim da animação.
   */
  let ghosts: Array<{ id: string; mine: boolean }> = [];
  let knownTaken = new Set(Object.keys(snake.taken));
  $: {
    const current = Object.keys(snake.taken);
    const fresh = current.filter((id) => !knownTaken.has(id));
    if (fresh.length) {
      ghosts = [...ghosts, ...fresh.map((id) => ({ id, mine: snake.taken[id] === selfId }))];
      const ids = new Set(fresh);
      setTimeout(() => { ghosts = ghosts.filter((ghost) => !ids.has(ghost.id)); }, 800);
    }
    knownTaken = new Set(current);
  }
  $: freeCount = cards.filter((card) => !card.takenBy).length;
  $: roundIndex = snake.order.length ? Math.floor(snake.turn / snake.order.length) : 0;
  /** Rodadas ímpares correm ao contrário: a faixa de ordem mostra a direção atual para ninguém se perder. */
  $: reversed = roundIndex % 2 === 1;

  /** Entrada "embaralhada": cada carta revela num instante pseudo-aleatório (hash do id), não da esquerda para a direita. */
  const scrambleDelay = (id: string, size: number): number => {
    let hash = 7;
    for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return (hash % Math.max(1, size)) * Math.min(45, Math.round(900 / Math.max(1, size)));
  };

  // Sons do tabuleiro: carta levada por outro (baque curto), últimos cinco segundos da minha vez (tique) e a abertura.
  let takenCount = Object.keys(snake.taken).length;
  $: {
    const count = Object.keys(snake.taken).length;
    if (count > takenCount) {
      const latest = Object.entries(snake.taken).slice(takenCount).some(([, participantId]) => participantId !== selfId);
      if (latest) playGameSound('land');
    }
    takenCount = count;
  }
  onMount(() => { playGameSound('charge'); });
</script>

<section class="snake-board panel" class:my-turn={myTurn} aria-live="polite">
  <header class="snake-head">
    <span class="eyebrow">SNAKE DRAFT · {Math.min(snake.turn + 1, snake.totalTurns)}/{snake.totalTurns}</span>
    <p class="snake-sub">{myTurn ? t('snakePicksLeft').replace('{n}', String(picksLeft)) : t('snakeWaitingTurn')}</p>
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
    {#each cards as card (card.id)}
      {#if card.player}
        {@const hint = card.takenBy ? undefined : cardHints.get(card.id)}
        <div class="snake-card" class:taken={Boolean(card.takenBy)} class:mine={card.takenBy === selfId} class:fills-role={Boolean(hint?.fills)} class:adds-theme={Boolean(hint?.theme)} class:locks-theme={Boolean(hint?.theme?.locks)} data-offline-player={card.player.id} style={`--reveal-delay: ${scrambleDelay(card.id, cards.length)}ms`}>
          {#if hint}
            <b class="snake-hint" class:lock={hint.theme?.locks}>{#if hint.fills}{ROLE_SHORT[hint.fills]}{/if}{#if hint.fills && hint.theme} · {/if}{#if hint.theme}+{snakeThemeName(hint.theme, language, teams)}{/if}</b>
          {/if}
          <CollectionCard
            player={card.player}
            teamName={teamName(card.player)}
            {language}
            compact
            {dense}
            detailed={dense}
            inLineup={card.takenBy === selfId}
            tag={!card.takenBy ? '' : dense ? (card.takenBy === selfId ? '' : t('snakeTakenShort')) : t('snakeTakenBy').replace('{name}', nameOf(card.takenBy))}
            onOpen={card.takenBy ? null : onOpen}
          />
          {#each ghosts.filter((ghost) => ghost.id === card.id) as ghost (ghost.id)}
            <div class="snake-ghost" class:to-deck={ghost.mine} class:away={!ghost.mine} aria-hidden="true">
              <CollectionCard player={card.player} teamName={teamName(card.player)} {language} compact {dense} detailed={dense} />
            </div>
          {/each}
        </div>
      {/if}
    {/each}
  </div>
</section>

<style>
  /* Sobra nas laterais e em cima/embaixo: o tabuleiro nunca cola na borda do painel, nem no celular. */
  .snake-board { display: grid; gap: 14px; padding: clamp(14px, 2.6vw, 22px) clamp(12px, 2.6vw, 22px) clamp(16px, 3vw, 24px); }
  .snake-board.my-turn { border-color: var(--accent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent), 0 0 32px color-mix(in srgb, var(--accent) 14%, transparent); }
  .snake-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .snake-sub { margin: 0; color: var(--muted); font-size: .78rem; font-weight: 700; }
  .my-turn .snake-sub { color: var(--accent); }
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
  /* Sempre um número par de colunas (2, 4 ou 6): o pool tem 12 cartas por participante, então toda fileira fecha. */
  .snake-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 4px 0 2px; }
  .snake-grid.dense { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
  /* Dica de sinergia: selo no canto direito (o "Levada" fica à esquerda), mais forte na vez do jogador. */
  .snake-hint { position: absolute; top: -8px; right: 6px; z-index: 2; max-width: calc(100% - 12px); padding: 2px 6px; border: 1px solid var(--accent); background: var(--surface); color: var(--accent); font-size: .54rem; font-weight: 900; letter-spacing: .08em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
  .snake-hint.lock { background: var(--accent); color: #0a0d08; }
  .my-turn .snake-card.fills-role :global(.card), .my-turn .snake-card.adds-theme :global(.card) { box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 18px color-mix(in srgb, var(--accent) 16%, transparent); }
  .my-turn .snake-card.locks-theme :global(.card) { box-shadow: 0 0 0 2px var(--accent), 0 0 24px color-mix(in srgb, var(--accent) 28%, transparent); }
  .snake-grid.dense .snake-hint { top: -6px; right: 3px; padding: 1px 4px; font-size: .46rem; letter-spacing: .04em; }
  .snake-ghost { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  .snake-ghost.to-deck { animation: snakeToDeck 780ms var(--ease-in-out-strong) forwards; }
  .snake-ghost.away { animation: snakeAway 620ms var(--ease-out-strong) forwards; }
  @keyframes snakeToDeck { 0% { transform: none; opacity: 1; } 25% { transform: translateY(-10px) scale(1.04); opacity: 1; } 100% { transform: translateY(58vh) scale(.35); opacity: 0; } }
  @keyframes snakeAway { 0% { transform: none; opacity: 1; } 100% { transform: translateY(-46px) rotate(-6deg) scale(.82); opacity: 0; filter: grayscale(1); } }
  @media (min-width: 640px) { .snake-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } }
  @media (min-width: 1060px) { .snake-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
  .snake-card { position: relative; animation: snakeIn var(--dur-reveal) var(--ease-out-strong) both; animation-delay: var(--reveal-delay, 0ms); transition: opacity 420ms var(--ease-out-soft), filter 420ms var(--ease-out-soft), transform 420ms var(--ease-out-strong); }
  .snake-card:not(.taken) :global(.card) { transition: transform var(--dur-ui) var(--ease-out-strong), box-shadow var(--dur-ui) var(--ease-out-strong); }
  .my-turn .snake-card:not(.taken):hover :global(.card) { transform: translateY(-3px); box-shadow: 0 10px 24px color-mix(in srgb, var(--accent) 18%, transparent); }
  .snake-card.taken { opacity: .42; filter: grayscale(.7); transform: scale(.96); pointer-events: none; }
  .snake-card.taken.mine { opacity: .88; filter: none; transform: none; }
  /* Fora da vez o pool continua legível (a ficha abre só para leitura), mas o tom baixa para a atenção ir para o cabeçalho. */
  .snake-grid.waiting .snake-card:not(.taken) { opacity: .9; }
  @keyframes snakeIn { from { opacity: 0; transform: translateY(10px) scale(.94) rotate(-1.5deg); } 60% { opacity: 1; } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    .snake-card { animation: none; transition: none; }
    .snake-ghost { display: none; }
    .snake-order li { transition: none; transform: none; }
    .my-turn .snake-card:not(.taken):hover :global(.card) { transform: none; }
  }
</style>
