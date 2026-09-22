<script lang="ts">
  /**
   * Insignia da patente do CS que dá nome à caixa do Major. Desenho próprio em SVG: a arte oficial das patentes
   * é da Valve, então aqui são brasões originais no mesmo espírito (chevrons, estrela e globo).
   */
  export let tier: 'prata' | 'ouro' | 'supremo' | 'global';
  export let size = 18;
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class="rank-badge">
  {#if tier === 'prata'}
    <path d="M4 10.2 L12 4.2 L20 10.2 L20 11.9 L12 5.9 L4 11.9 Z" fill="#8b969f" opacity="0.7" />
    <path d="M4 16.5 L12 10.5 L20 16.5 L20 19.5 L12 13.5 L4 19.5 Z" fill="#c9d3db" />
  {:else if tier === 'ouro'}
    <path d="M4 16.5 L12 10.5 L20 16.5 L20 19.5 L12 13.5 L4 19.5 Z" fill="#e0ab3c" />
    <circle cx="12" cy="6.4" r="2.6" fill="#f5c542" />
  {:else if tier === 'supremo'}
    <path d="M4 17.5 L12 11.5 L20 17.5 L20 20.5 L12 14.5 L4 20.5 Z" fill="#7a86e8" />
    <path d="M12 2.6 L13.08 5.71 L16.38 5.78 L13.75 7.77 L14.7 10.92 L12 9.04 L9.3 10.92 L10.25 7.77 L7.62 5.78 L10.92 5.71 Z" fill="#b9c2ff" />
  {:else}
    <g fill="none" stroke="#6f9bdc" stroke-width="1.5">
      <circle cx="12" cy="12" r="8" />
      <ellipse cx="12" cy="12" rx="3.4" ry="8" />
      <path d="M4.5 12 H19.5" />
    </g>
    <path d="M12 9 L12.71 11.03 L14.85 11.07 L13.14 12.37 L13.76 14.43 L12 13.2 L10.24 14.43 L10.86 12.37 L9.15 11.07 L11.29 11.03 Z" fill="#ffd24d" />
  {/if}
</svg>

<style>
  .rank-badge { display: inline-block; vertical-align: -3px; flex: none; }
</style>
