<script lang="ts">
  import { tick } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import type { Coach } from '$lib/game/types';
  import CoachCard from './CoachCard.svelte';

  export let coach: Coach;
  export let teamName = '';
  export let closeLabel: string;
  export let returnFocus: HTMLElement | null = null;
  export let onClose: () => void = () => {};
  /** Renders the `actions` slot under the card (stake/aim buttons). Off when the coach is only being looked at. */
  export let showActions = false;

  async function closeFromButton() {
    onClose();
    await tick();
    returnFocus?.focus();
  }
</script>

<Modal open title={coach.name} onClose={onClose}>
  <div class="coach-detail-card">
    <CoachCard {coach} {teamName} showcase />
  </div>
  {#if showActions && $$slots.actions}<div class="coach-actions"><slot name="actions" /></div>{/if}
  <svelte:fragment slot="actions">
    <button class="secondary" type="button" on:click={closeFromButton}>{closeLabel}</button>
  </svelte:fragment>
</Modal>

<style>
  .coach-detail-card { width: min(100%, 360px); margin-inline: auto; }
  .coach-detail-card :global(.card) { width: 100%; }
  .coach-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px; width: min(100%, 360px); margin: 10px auto 0; }
  .coach-actions :global(button) { min-width: 0; min-height: 44px; white-space: normal; line-height: 1.2; }
</style>
