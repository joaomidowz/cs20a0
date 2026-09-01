<script lang="ts">
  import GoldenMirageReplayViewer from './GoldenMirageReplayViewer.svelte';
  import SchematicReplayViewer from './SchematicReplayViewer.svelte';
  import type { ReplayPlaybackSpeed } from '$lib/game/replay/types';
  import type { Language, SeriesResult, Theme } from '$lib/game/types';

  export let series: SeriesResult;
  export let mapIndex: number;
  export let visibleRounds: number;
  export let language: Language = 'en';
  export let theme: Theme = 'dark';
  export let autoplay = false;
  export let initialSpeed: ReplayPlaybackSpeed = 'normal';
  export let onComplete: () => void = () => {};

  $: mapId = series.maps[mapIndex]?.mapId;
</script>

{#if mapId === 'mirage'}
  <GoldenMirageReplayViewer {series} {mapIndex} {visibleRounds} {language} {theme} {autoplay} {initialSpeed} {onComplete} />
{:else}
  <SchematicReplayViewer {series} {mapIndex} {visibleRounds} {language} {theme} {autoplay} {initialSpeed} {onComplete} />
{/if}
