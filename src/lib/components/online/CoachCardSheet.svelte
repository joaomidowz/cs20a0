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
  <svelte:fragment slot="actions">
    <button class="secondary" type="button" on:click={closeFromButton}>{closeLabel}</button>
  </svelte:fragment>
</Modal>

<style>
  .coach-detail-card { width: min(100%, 360px); margin-inline: auto; }
  .coach-detail-card :global(.card) { width: 100%; }
</style>
