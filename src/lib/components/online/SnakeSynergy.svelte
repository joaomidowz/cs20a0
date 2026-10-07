<script lang="ts">
  import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import { getRoleLabel } from '$lib/game/roleRules';
  import type { SnakeLineHints } from '$lib/game/online/snake-hints';
  import type { HistoricalTeam, Language } from '$lib/game/types';
  import { ROLE_SHORT, snakeThemeName } from './snakeLabels';

  /** O que a line parcial já tem e o que falta: funções centrais, temas e química. Só apresentação. */
  export let hints: SnakeLineHints;
  export let language: Language = 'pt-BR';
  export let teams: ReadonlyMap<string, HistoricalTeam>;
  /** Barra fixa do celular: uma linha de chips, sem rodapé. */
  export let compact = false;

  $: t = (key: OnlineTranslationKey) => translateOnline(language, key);
  $: visibleThemes = hints.themes.filter((line) => line.count >= 2).slice(0, compact ? 2 : 3);
</script>

<div class="snake-synergy" class:compact aria-live="polite">
  {#each hints.missingCore as role (role)}
    <span class="chip need"><b>{compact ? ROLE_SHORT[role] : getRoleLabel(role)}</b><small>{compact ? '?' : t('snakeNeedRole').replace('{role}', '').trim()}</small></span>
  {/each}
  {#each visibleThemes as line (line.key + line.theme)}
    <span class="chip theme" class:locked={line.locks}><b>{snakeThemeName(line, language, teams)} ×{line.count}</b>{#if !line.locks && !compact}<small>{t('snakeThemeOneMore').replace('{n}', String(Math.max(1, 3 - line.count)))}</small>{/if}</span>
  {/each}
  {#if !compact}
    <span class="chip verdict" class:ok={hints.chemistry}>{hints.chemistry ? t('snakeChemistryOk') : t('snakeNoChemistry')}</span>
  {:else if hints.chemistry}
    <span class="chip verdict ok">✓</span>
  {/if}
</div>

<style>
  .snake-synergy { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chip { display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 8px; border: 1px solid var(--line); background: var(--surface-2); font-size: .72rem; font-weight: 700; line-height: 1.2; }
  .chip small { color: var(--muted); font-size: .62rem; font-weight: 700; }
  .chip.need { border-color: color-mix(in srgb, var(--accent-2) 55%, var(--line)); color: var(--accent-2); }
  .chip.theme { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .chip.theme.locked { background: color-mix(in srgb, var(--accent) 16%, var(--surface-2)); border-color: var(--accent); color: var(--accent); }
  .chip.verdict { color: var(--muted); font-weight: 600; }
  .chip.verdict.ok { color: var(--accent); border-color: var(--accent); font-weight: 800; }
  .compact { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .compact::-webkit-scrollbar { display: none; }
  .compact .chip { flex: none; padding: 3px 6px; font-size: .62rem; }
</style>
