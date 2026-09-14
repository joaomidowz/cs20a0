<script lang="ts">
  import { getRoleLabel } from '$lib/game/roleRules';
  import type { Language, LineupSlotRole } from '$lib/game/types';

  export let value: LineupSlotRole;
  export let eligible: LineupSlotRole[] = [];
  export let language: Language = 'pt-BR';
  export let label = '';
  export let disabled = false;
  export let onChange: (role: LineupSlotRole) => void = () => {};

  const ROLES: LineupSlotRole[] = ['awper', 'igl', 'entry', 'lurker', 'rifler', 'support'];
  const hint = { 'pt-BR': 'Fora de posição: −1,5% de força', es: 'Fuera de posición: −1,5% de fuerza', en: 'Out of position: −1.5% strength' } as const;
  let buttons: HTMLButtonElement[] = [];

  function onKey(event: KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + ROLES.length) % ROLES.length;
    buttons[next]?.focus();
    onChange(ROLES[next]);
  }
</script>

<div class="role-chips" role="radiogroup" aria-label={label}>
  {#each ROLES as role, index}
    {@const off = !eligible.includes(role)}
    <button
      bind:this={buttons[index]}
      type="button"
      role="radio"
      aria-checked={value === role}
      tabindex={value === role ? 0 : -1}
      class:selected={value === role}
      class:off
      {disabled}
      title={off ? hint[language] : undefined}
      on:click={() => onChange(role)}
      on:keydown={(event) => onKey(event, index)}
    >
      {getRoleLabel(role)}{#if off}<small>{language === 'en' ? '−1.5%' : '−1,5%'}</small>{/if}
    </button>
  {/each}
</div>

<style>
  .role-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  button { display: inline-flex; align-items: baseline; gap: 4px; min-height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--muted); font: 800 .66rem/1 Inter, Arial, sans-serif; letter-spacing: .04em; text-transform: uppercase; cursor: pointer; }
  button:hover:not(:disabled) { color: var(--text); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button:disabled { cursor: not-allowed; opacity: .55; }
  button.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--surface)); color: var(--accent); }
  button.off { border-style: dashed; }
  button.off.selected { border-color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 14%, var(--surface)); color: var(--accent-2); }
  small { font-size: .56rem; color: var(--accent-2); }
</style>
