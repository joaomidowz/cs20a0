<script lang="ts">
  import SegmentedControl from './SegmentedControl.svelte';
  import type { StrategicAutomationPreferences } from '$lib/game/strategic-series';
  export let value: StrategicAutomationPreferences;
  export let onChange: (value: StrategicAutomationPreferences) => void;
  const options = [{ value: 'on', label: 'ON' }, { value: 'off', label: 'OFF' }];
  const controls = [
    { key: 'autoMapPicksAndVetos', label: 'Auto Map Picks and Vetos' },
    { key: 'autoPause', label: 'Auto Pause' },
    { key: 'autoEconomy', label: 'Auto Economy' }
  ] as const;
</script>
<div class="match-controls panel" aria-label="Automação estratégica">
  {#each controls as control}
    <div class="control-group"><span>{control.label}</span><SegmentedControl label={control.label} value={value[control.key] ? 'on' : 'off'} {options} onChange={(next) => onChange({ ...value, [control.key]: next === 'on' })} /></div>
  {/each}
</div>
