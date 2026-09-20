<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { onlineSession, queueView } from '$lib/game/online/session';

  const HIDDEN_QUEUE_LIMIT_MS = 60_000;
  let hiddenTimer: number | null = null;

  const clearHiddenTimer = () => {
    if (hiddenTimer === null) return;
    window.clearTimeout(hiddenTimer);
    hiddenTimer = null;
  };

  const handleVisibility = () => {
    if (!document.hidden) {
      clearHiddenTimer();
      return;
    }
    if (get(queueView).state !== 'waiting' || hiddenTimer !== null) return;
    hiddenTimer = window.setTimeout(() => {
      hiddenTimer = null;
      if (document.hidden && get(queueView).state === 'waiting') void onlineSession.cancelQueue('hidden');
    }, HIDDEN_QUEUE_LIMIT_MS);
  };

  const handlePageExit = () => onlineSession.dispose();

  onMount(() => {
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageExit);
  });

  onDestroy(() => {
    clearHiddenTimer();
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('pagehide', handlePageExit);
    onlineSession.dispose();
  });
</script>
