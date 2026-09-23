<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { showToast } from '$lib/game/notifications';
  import { queueIncreaseMessage } from '$lib/game/notificationCopy';
  import { accountUser } from '$lib/game/online/account';
  import { getOnlineServerUrl } from '$lib/game/online/config';
  import { clearPresence, presenceView, startPresencePolling, stopPresencePolling } from '$lib/game/online/presence';
  import { language } from '$lib/game/pageState';
  import { loadOfflineSound, playGameSound, unlockOfflineAudio } from '$lib/game/offlineAudio';
  import { onlineSession, queueView } from '$lib/game/online/session';

  const HIDDEN_QUEUE_LIMIT_MS = 60_000;
  let hiddenTimer: number | null = null;
  let lastOtherQueueCount: number | null = null;
  let presenceAccountId = '';

  $: if ($accountUser && presenceAccountId !== $accountUser.id) {
    presenceAccountId = $accountUser.id;
    lastOtherQueueCount = null;
    startPresencePolling(getOnlineServerUrl());
  }
  $: if (!$accountUser && presenceAccountId) {
    presenceAccountId = '';
    lastOtherQueueCount = null;
    stopPresencePolling();
    clearPresence();
  }
  $: observeQueueArrivals($presenceView);

  function observeQueueArrivals(presence: { queue?: number; queuedByMe?: boolean } | null) {
    if (typeof presence?.queue !== 'number') return;
    const otherCount = Math.max(0, presence.queue - (presence.queuedByMe ? 1 : 0));
    if (lastOtherQueueCount !== null && otherCount > lastOtherQueueCount) {
      showToast({ message: queueIncreaseMessage($language, presence.queue), kind: 'info', duration: 5_000, key: 'matchmaking-arrivals' });
    }
    lastOtherQueueCount = otherCount;
  }

  function handleActionSound(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    if (button.matches('[role="tab"], [role="switch"], [aria-pressed], .skip, .info-btn, .presence-chip, .timeline-expand, .row-link, .link-btn, [data-sound="off"]')) return;
    if (button.matches('.primary, .secondary, [data-sound="action"]')) playGameSound('uiClick');
  }

  const unlockSound = () => unlockOfflineAudio();

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
    loadOfflineSound();
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('pointerdown', unlockSound);
    document.addEventListener('keydown', unlockSound);
    document.addEventListener('click', handleActionSound);
    window.addEventListener('pagehide', handlePageExit);
  });

  onDestroy(() => {
    clearHiddenTimer();
    document.removeEventListener('visibilitychange', handleVisibility);
    document.removeEventListener('pointerdown', unlockSound);
    document.removeEventListener('keydown', unlockSound);
    document.removeEventListener('click', handleActionSound);
    window.removeEventListener('pagehide', handlePageExit);
    onlineSession.dispose();
    stopPresencePolling();
  });
</script>
