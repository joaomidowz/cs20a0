<script lang="ts">
  export let show = false;
  export let title: string;
  export let message: string;
  export let supportLabel: string;
  export let dismissLabel: string;
  export let closeLabel: string;
  export let onClose: () => void;
  export let onSupportClick: () => void;
</script>

{#if show}
  <aside class="support-nudge" aria-label={title} aria-live="polite">
    <button class="nudge-close" type="button" aria-label={closeLabel} on:click={onClose}>×</button>
    <span class="nudge-kicker">KO-FI / COMMUNITY SUPPORT</span>
    <strong>{title}</strong>
    <p>{message}</p>
    <div class="nudge-actions">
      <a href="https://ko-fi.com/cs13a0" target="_blank" rel="noopener noreferrer" on:click={onSupportClick}>{supportLabel}</a>
      <button type="button" on:click={onClose}>{dismissLabel}</button>
    </div>
  </aside>
{/if}

<style>
  .support-nudge{position:fixed;z-index:80;left:12px;right:12px;bottom:12px;padding:18px;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line));background:color-mix(in srgb,var(--surface) 94%,transparent);box-shadow:0 18px 55px rgb(0 0 0 / 28%);backdrop-filter:blur(12px);animation:nudgeIn .24s ease-out}
  .nudge-kicker{display:block;padding-right:30px;color:var(--accent);font-size:.52rem;font-weight:900;letter-spacing:.12em}
  strong{display:block;margin-top:8px;font:800 1.45rem 'Barlow Condensed',sans-serif}
  p{margin:7px 0 15px;color:var(--muted);font-size:.72rem;line-height:1.55}
  .nudge-close{position:absolute;right:9px;top:9px;width:30px;height:30px;padding:0;border:1px solid var(--line);color:var(--muted);background:transparent;font-size:1.1rem;cursor:pointer}
  .nudge-actions{display:grid;grid-template-columns:1fr auto;gap:7px}
  .nudge-actions a,.nudge-actions button{display:grid;place-items:center;min-height:42px;padding:8px 12px;border:1px solid var(--line);font-size:.65rem;font-weight:900;text-decoration:none;text-transform:uppercase;cursor:pointer}
  .nudge-actions a{border-color:var(--accent);color:#0b0e09;background:var(--accent)}
  .nudge-actions button{color:var(--muted);background:transparent}
  button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
  @keyframes nudgeIn{from{transform:translateY(18px);opacity:0}}

  @media (min-width:680px){.support-nudge{left:auto;right:22px;bottom:22px;width:min(390px,calc(100% - 44px));padding:20px}}
  @media (prefers-reduced-motion:reduce){.support-nudge{animation:none}}
</style>
