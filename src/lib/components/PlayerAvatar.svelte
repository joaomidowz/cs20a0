<script lang="ts">
  import { avatarFor, avatarParts } from '$lib/game/visuals/avatar';
  import { licensedImageFor, licensedImageSrc } from '$lib/game/visuals/licensed';

  /** Any card: the avatar keys on `baseId` (same face in every year) and falls back to `id`. */
  export let player: { id: string; baseId?: string | null };
  /** Size classes of the existing `.avatar` rules (`large` 58px, `huge` 72px); default follows the surrounding card. */
  export let variant: 'default' | 'large' | 'huge' = 'default';
  /** Without the `.avatar` frame, for containers that bring their own box (share card). */
  export let bare = false;

  // Generated silhouette by default; a licensed photo only when `licensed-images.json` registers one for the base id.
  $: avatar = avatarFor(player);
  $: parts = avatarParts(avatar);
  $: licensed = licensedImageFor('player', player.baseId ?? player.id);
</script>

<span class="player-avatar {variant === 'default' ? '' : variant}" class:avatar={!bare} class:bare aria-hidden="true">
  {#if licensed}
    <img src={licensedImageSrc(licensed)} alt="" decoding="async" />
  {:else}
    <svg viewBox={parts.viewBox} focusable="false">
      <rect width="64" height="64" fill={avatar.background} />
      <path d={parts.bodyPath} fill={avatar.figure} />
      <circle cx={parts.head.cx} cy={parts.head.cy} r={parts.head.r} fill={avatar.figure} />
      {#each parts.accents as piece}
        {#if piece.stroke}
          <path d={piece.d} fill="none" stroke={piece.stroke} stroke-width={piece.strokeWidth ?? 2} stroke-linecap="round" />
        {:else}
          <path d={piece.d} fill={piece.fill} />
        {/if}
      {/each}
    </svg>
  {/if}
</span>

<style>
  .player-avatar{overflow:hidden;padding:0}
  .player-avatar.bare{display:block;width:100%;height:100%}
  .player-avatar svg,.player-avatar img{display:block;width:100%;height:100%;object-fit:cover}
</style>
