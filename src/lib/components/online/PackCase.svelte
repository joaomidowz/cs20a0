<script lang="ts">
  import type { PackTier } from '$lib/game/online/collection-rules';

  /** The pack as an object: an isometric weapon-case style box, drawn here (no third-party art). */
  export let tier: PackTier;
  export let size: 'md' | 'lg' = 'md';
  export let label = '';
  /** Shakes, then lifts the lid with a beam of light. */
  export let opening = false;
</script>

<span class="case {tier} {size}" class:opening aria-hidden="true">
  <span class="glow"></span>
  <svg viewBox="0 0 200 190" role="presentation">
    <defs>
      <linearGradient id="top-{tier}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--case-hi)" /><stop offset="1" stop-color="var(--case-a)" /></linearGradient>
      <linearGradient id="left-{tier}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--case-a)" /><stop offset="1" stop-color="var(--case-b)" /></linearGradient>
      <linearGradient id="right-{tier}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--case-b)" /><stop offset="1" stop-color="var(--case-c)" /></linearGradient>
    </defs>
    <polygon class="beam" points="70,96 130,96 170,0 30,0" />
    <!-- body -->
    <polygon points="20,80 100,120 100,182 20,142" fill="url(#left-{tier})" />
    <polygon points="180,80 100,120 100,182 180,142" fill="url(#right-{tier})" />
    <polygon class="rim" points="20,80 100,40 180,80 100,120" />
    <!-- straps and latch -->
    <polygon class="strap" points="44,92 58,99 58,161 44,154" />
    <polygon class="strap" points="156,92 142,99 142,161 156,154" />
    <polygon class="latch" points="112,122 134,111 134,133 112,144" />
    <!-- front marks -->
    <g transform="matrix(1 0.5 0 1 28 96)"><text class="mark" x="4" y="30">CS</text></g>
    <g transform="matrix(1 -0.5 0 1 106 150)"><text class="name" x="30" y="16">{label}</text></g>
    <!-- lid -->
    <g class="lid">
      <polygon points="20,66 100,106 100,120 20,80" fill="url(#left-{tier})" />
      <polygon points="180,66 100,106 100,120 180,80" fill="url(#right-{tier})" />
      <polygon points="20,66 100,26 180,66 100,106" fill="url(#top-{tier})" />
      <polygon class="facet" points="100,26 140,46 100,66 60,46" />
      <polygon class="edge" points="20,66 100,26 180,66 100,106" />
    </g>
  </svg>
</span>

<style>
  .case { position: relative; display: grid; place-items: center; width: 128px; height: 122px; margin: 0 auto; transition: transform .2s ease; --case-hi: #aeb8a0; --case-a: #6f7d52; --case-b: #4b5637; --case-c: #333b26; --case-glow: #c8ff32; --case-ink: #0a0d08; }
  .case.lg { width: 184px; height: 175px; }
  svg { position: relative; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 14px 14px rgb(0 0 0 / .55)); }
  .glow { position: absolute; inset: 22% 12% 4%; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in srgb, var(--case-glow) 55%, transparent), transparent); opacity: .35; filter: blur(10px); transition: opacity .2s ease; }
  :global(.pack:hover) .case { transform: translateY(-4px); } :global(.pack:hover) .glow { opacity: .7; }
  .prata { --case-hi: #f1f4f6; --case-a: #b4bdc4; --case-b: #7c868e; --case-c: #515a61; --case-glow: #dfe6ea; }
  .funcao { --case-hi: #b9f5dc; --case-a: #399d78; --case-b: #226b55; --case-c: #123d32; --case-glow: #5dffbf; }
  .coach { --case-hi: #ffd3a6; --case-a: #b86e3e; --case-b: #75452d; --case-c: #40251b; --case-glow: #ff9c52; }
  .time { --case-hi: #a9d8ff; --case-a: #437fc1; --case-b: #285485; --case-c: #17324f; --case-glow: #63b7ff; }
  .era { --case-hi: #d2b6ff; --case-a: #8a55e0; --case-b: #5a31a3; --case-c: #3a1f6c; --case-glow: #a66bff; --case-ink: #fff; }
  .ouro { --case-hi: #ffe9a8; --case-a: #e0ab3c; --case-b: #a87516; --case-c: #6f4a0a; --case-glow: #ffc94d; }
  .diamante { --case-hi: #eafaff; --case-a: #7fdcff; --case-b: #2f9fd1; --case-c: #17607f; --case-glow: #5ad1ff; }
  .icone { --case-hi: #4a3a52; --case-a: #241a2b; --case-b: #150f1a; --case-c: #0a070d; --case-glow: #ff5ad8; --case-ink: #ffd36b; }
  .rim { fill: #07090a; }
  .strap { fill: color-mix(in srgb, var(--case-c) 70%, #000); }
  .latch { fill: var(--case-hi); stroke: var(--case-c); stroke-width: 1.5; }
  .edge { fill: none; stroke: color-mix(in srgb, var(--case-hi) 80%, #fff); stroke-width: 1.4; opacity: .7; }
  .facet { fill: #fff; opacity: .1; }
  .diamante .facet { opacity: .38; } .icone .facet { fill: #ff5ad8; opacity: .3; }
  .icone .edge, .icone .latch { stroke: #ffd36b; } .icone .latch { fill: #ffd36b; }
  .mark { fill: var(--case-ink); font: 900 30px 'Arial Narrow', Impact, sans-serif; letter-spacing: 1px; opacity: .85; }
  .name { fill: var(--case-ink); font: 900 12px 'Arial Narrow', Impact, sans-serif; letter-spacing: 1.5px; text-anchor: middle; text-transform: uppercase; opacity: .8; }
  .beam { fill: var(--case-glow); opacity: 0; }
  .icone .glow { animation: pulse 2.2s ease-in-out infinite; }
  .lid { transform-box: fill-box; transform-origin: 50% 100%; }
  .opening { animation: shake .6s ease-in-out; }
  .opening .lid { animation: lift .7s .55s cubic-bezier(.2, .9, .3, 1) forwards; }
  .opening .beam { animation: beam 1s .6s ease-out forwards; }
  .opening .glow { opacity: 1; }
  @keyframes pulse { 50% { opacity: .75; } }
  @keyframes shake { 0%, 100% { transform: rotate(0); } 15% { transform: rotate(-4deg); } 30% { transform: rotate(4deg); } 45% { transform: rotate(-3deg) translateY(-2px); } 60% { transform: rotate(3deg); } 80% { transform: rotate(-1deg); } }
  @keyframes lift { to { transform: translateY(-46px) rotate(-10deg); opacity: .0; } }
  @keyframes beam { 0% { opacity: 0; } 30% { opacity: .75; } 100% { opacity: .25; } }
  @media (prefers-reduced-motion: reduce) { .case, .opening, .opening .lid, .opening .beam, .icone .glow { animation: none; transition: none; } .opening .lid { opacity: 0; } }
</style>
