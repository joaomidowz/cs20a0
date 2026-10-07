<script lang="ts">
  import PlayerAvatar from '../PlayerAvatar.svelte';
  import SnakeSynergy from './SnakeSynergy.svelte';
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import { rarityOf } from '$lib/game/online/collection-rules';
  import { collectionRoleOf } from '$lib/game/online/collection-lineup';
  import type { SnakeLineHints } from '$lib/game/online/snake-hints';
  import type { HistoricalTeam, Language, Player, SelectedPlayer } from '$lib/game/types';
  import { ROLE_SHORT } from './snakeLabels';

  /**
   * Fila Draft: o deck do jogador — as cinco cartas (o que já tem) e as vagas (o que falta), com os chips de sinergia.
   * No celular fica fixo no rodapé, no lugar da navbar, para não rolar até o HUD; no desktop é um painel acima do pool.
   */
  export let lineup: SelectedPlayer[] = [];
  export let players: Map<string, Player>;
  export let hints: SnakeLineHints | null = null;
  export let picksPerParticipant = 5;
  export let language: Language = 'pt-BR';
  export let teams: ReadonlyMap<string, HistoricalTeam> = new Map();
  export let starPlayerId: string | null = null;
  export let onOpen: (player: Player) => void = () => {};

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: slots = Array.from({ length: picksPerParticipant }, (_, index) => {
    const pick = lineup[index];
    const player = pick ? players.get(pick.playerId) ?? null : null;
    // Vaga: sugere, em ordem, as funções centrais que ainda faltam.
    const suggestion = pick ? null : hints?.missingCore[index - lineup.length] ?? null;
    return { pick, player, suggestion };
  });
</script>

<aside class="deck-bar" aria-label={t('snakeDeckTitle')}>
  <div class="deck-head"><span class="eyebrow">{t('snakeDeckTitle')}</span><small>{lineup.length}/{picksPerParticipant}</small></div>
  <ol class="deck-row">
    {#each slots as slot, index (index)}
      {#if slot.player && slot.pick}
        <li class="deck-slot filled rarity-{rarityOf(slot.player)}" class:star={slot.player.id === starPlayerId}>
          <button type="button" on:click={() => slot.player && onOpen(slot.player)} aria-label={slot.player.nickname ?? slot.player.id}>
            <span class="photo"><PlayerAvatar player={slot.player} bare /></span>
            <span class="ovr">{slot.player.overall ?? '—'}</span>
            <span class="nick">{slot.player.nickname ?? slot.player.id}</span>
            <span class="role">{ROLE_SHORT[collectionRoleOf(slot.pick) === 'awper-igl' ? 'awper' : collectionRoleOf(slot.pick) === 'igl-support' ? 'igl' : collectionRoleOf(slot.pick) as keyof typeof ROLE_SHORT] ?? ''}</span>
          </button>
        </li>
      {:else}
        <li class="deck-slot empty" class:suggested={Boolean(slot.suggestion)}>
          <span class="photo">?</span>
          <span class="nick">{slot.suggestion ? `${ROLE_SHORT[slot.suggestion]}?` : `0${index + 1}`}</span>
        </li>
      {/if}
    {/each}
  </ol>
  {#if hints}<SnakeSynergy {hints} {language} {teams} compact />{/if}
</aside>

<style>
  .deck-bar { display: grid; gap: 8px; padding: 10px 14px 12px; border: 1px solid var(--line); background: var(--surface); }
  .deck-head { display: flex; justify-content: space-between; align-items: baseline; }
  .deck-head small { color: var(--muted); font-size: .72rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  .deck-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
  .deck-slot { --rarity: var(--line); position: relative; min-width: 0; border: 1px solid var(--rarity); background: linear-gradient(165deg, color-mix(in srgb, var(--rarity) 14%, var(--surface-2)), var(--surface)); }
  .rarity-rare { --rarity: #4f8cff; } .rarity-elite { --rarity: #a66bff; } .rarity-superstar { --rarity: #ff7a45; } .rarity-legend { --rarity: #f2c14e; } .rarity-goat { --rarity: #ff4d6d; }
  .deck-slot button { display: grid; width: 100%; gap: 3px; justify-items: center; padding: 6px 4px 7px; border: 0; background: transparent; color: var(--text); font: inherit; cursor: pointer; min-height: 0; }
  .photo { display: grid; place-items: center; width: 44px; height: 44px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--rarity) 55%, var(--line)); background: var(--surface-2); color: var(--muted); font-weight: 900; }
  .photo :global(img), .photo :global(svg) { width: 100%; height: 100%; object-fit: cover; }
  .ovr { position: absolute; top: 4px; left: 4px; padding: 1px 4px; background: var(--rarity); color: #0b0d12; font: 900 .8rem/1.1 'Arial Narrow', Impact, sans-serif; }
  .rarity-common .ovr, .deck-slot:not([class*="rarity-"]) .ovr { background: #b9c0cc; }
  .nick { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .68rem; font-weight: 800; }
  .role { color: var(--muted); font-size: .56rem; font-weight: 800; letter-spacing: .08em; }
  .deck-slot.star::after { content: '★'; position: absolute; top: 2px; right: 4px; color: #d9a441; font-size: .7rem; }
  .deck-slot.empty { display: grid; gap: 3px; justify-items: center; padding: 6px 4px 7px; border-style: dashed; }
  .deck-slot.empty .nick { color: var(--muted); }
  .deck-slot.suggested { border-color: color-mix(in srgb, var(--accent-2) 55%, var(--line)); }
  .deck-slot.suggested .nick { color: var(--accent-2); }
  .deck-slot.filled { animation: deckIn 420ms var(--ease-out-strong) both; }
  @keyframes deckIn { from { opacity: 0; transform: translateY(-6px) scale(.94); } to { opacity: 1; transform: none; } }
  @media (max-width: 720px) {
    .deck-bar { position: fixed; inset: auto 0 0; z-index: 30; gap: 6px; padding: 6px 10px calc(6px + env(safe-area-inset-bottom)); border-width: 1px 0 0; background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(10px); box-shadow: 0 -8px 24px rgb(0 0 0 / 35%); }
    .deck-head { display: none; }
    .deck-row { gap: 6px; }
    .photo { width: 36px; height: 36px; }
    .deck-slot button, .deck-slot.empty { padding: 4px 2px 5px; gap: 2px; }
    .nick { font-size: .6rem; }
    .role { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { .deck-slot.filled { animation: none; } }
</style>
