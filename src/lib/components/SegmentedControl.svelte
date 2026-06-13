<script lang="ts">
  export let value: string;
  export let options: Array<{ value: string; label: string }> = [];
  export let label = '';
  export let onChange: (value: string) => void = () => {};
</script>

<div class="segmented-control" role="group" aria-label={label}>
  {#each options as option}
    <button
      class:active={value === option.value}
      type="button"
      aria-pressed={value === option.value}
      on:click={() => onChange(option.value)}
    >{option.label}</button>
  {/each}
</div>
