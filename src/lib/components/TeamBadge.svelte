<script context="module" lang="ts">
  // Each instance clips its pattern with its own id: the same crest can appear many times on one page.
  let instanceCounter = 0;
</script>

<script lang="ts">
  import { crestFor, crestParts } from '$lib/game/visuals/crest';
  import { licensedImageFor, licensedImageSrc } from '$lib/game/visuals/licensed';

  export let id = '';
  export let name = '';
  export let size: 'sm' | 'md' | 'lg' | 'xl' = 'sm';
  export let highlight = false;
  /** Organization id from the identity layer; without one the crest is keyed by the name with the year stripped. */
  export let orgId: string | null = null;

  const clipId = `crest-clip-${(instanceCounter += 1)}`;
  // Generated crest by default; a licensed image only when `licensed-images.json` registers one for the org or the team-year.
  $: crest = crestFor({ orgId, name, id });
  $: parts = crestParts(crest);
  $: licensed = licensedImageFor('org', crest.key) ?? licensedImageFor('team', id);
</script>

<span class="team-badge {size}" class:highlight aria-hidden="true">
  {#if licensed}
    <img src={licensedImageSrc(licensed)} alt="" decoding="async" />
  {:else}
    <svg viewBox={parts.viewBox} focusable="false">
      <clipPath id={clipId}><path d={parts.shapePath} /></clipPath>
      <path d={parts.shapePath} fill={crest.primary} />
      <g clip-path={`url(#${clipId})`}>
        {#each parts.patternPaths as path}<path d={path} fill={crest.secondary} />{/each}
      </g>
      <path d={parts.shapePath} fill="none" stroke={crest.secondary} stroke-width="2.5" />
      <text
        x="32"
        y="33"
        text-anchor="middle"
        dominant-baseline="central"
        font-family={parts.fontFamily}
        font-weight="900"
        font-size={parts.fontSize}
        fill={crest.ink}
        stroke="#0b0e10"
        stroke-width="2"
        paint-order="stroke"
        letter-spacing=".5">{crest.initials}</text>
    </svg>
  {/if}
</span>

<style>
  .team-badge{display:inline-grid;flex:0 0 auto;place-items:center;width:26px;height:26px;border-radius:3px}
  .team-badge.md{width:34px;height:34px}.team-badge.lg{width:44px;height:44px}.team-badge.xl{width:64px;height:64px}
  .team-badge svg{display:block;width:100%;height:100%;object-fit:contain}
  /*
   * Real logos come from Liquipedia in every combination of transparent/white/dark background and light or dark
   * artwork (allmode/lightmode/darkmode exports). A fixed near-white plate behind the image is the only backing
   * that keeps all of them legible regardless of our own dark theme; the generated crest above needs none of this
   * because it always paints its own opaque silhouette.
   */
  .team-badge img{display:block;width:100%;height:100%;object-fit:contain;background:#f4f2ec;border-radius:inherit;padding:12%;box-sizing:border-box}
  .team-badge.highlight{box-shadow:0 0 0 2px var(--accent)}
</style>
