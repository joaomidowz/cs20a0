<script lang="ts">
  export let id = '';
  export let name = '';
  export let size: 'sm' | 'md' | 'lg' = 'sm';
  export let highlight = false;

  const hue = (value: string) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 360;
  };
  $: initials = (name || id || '?').replace(/\b(19|20)\d{2}\b/g, '').trim().split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
  $: color = `hsl(${hue(id || name)} 42% 30%)`;
</script>

<span class="team-badge {size}" class:highlight style={`--badge:${color}`} aria-hidden="true">{initials}</span>

<style>
  .team-badge{display:inline-grid;flex:0 0 auto;place-items:center;width:26px;height:26px;border:1px solid color-mix(in srgb,var(--badge) 60%,var(--line));color:#fff;background:var(--badge);font:900 .62rem/1 'Arial Narrow',Impact,sans-serif;letter-spacing:.02em}
  .team-badge.md{width:34px;height:34px;font-size:.82rem}.team-badge.lg{width:44px;height:44px;font-size:1.05rem}
  .team-badge.highlight{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
</style>
