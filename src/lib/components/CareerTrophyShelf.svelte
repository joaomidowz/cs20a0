<script lang="ts">
  // A estante da Carreira: taças de Major e de Tier S e medalhas de MVP e EVP dos campeonatos grandes, em 3D
  // pré-renderizado (scripts/career-trophies: 24 quadros por troféu numa folha de sprite). Gira ao passar o mouse ou
  // focar, e dá para girar arrastando; com movimento reduzido fica parado. Só carrega as imagens onde a estante aparece.
  import type { ShelfTrophy } from '$lib/game/playerCareer/engine';

  export let items: ShelfTrophy[] = [];
  export let compact = false;
  /** Quantos de cada tipo aparecem antes do "+N". */
  export let limit = 10;

  const FRAMES = 24;
  const KINDS: Array<{ kind: ShelfTrophy['kind']; label: string; one: string; many: string }> = [
    { kind: 'major', label: 'Majors', one: 'Major', many: 'Majors' },
    { kind: 's', label: 'Tier S', one: 'título Tier S', many: 'títulos Tier S' },
    { kind: 'mvp', label: 'MVPs', one: 'MVP', many: 'MVPs' },
    { kind: 'evp', label: 'EVPs', one: 'EVP', many: 'EVPs' }
  ];
  const AWARD: Record<ShelfTrophy['kind'], string> = { major: 'Campeão do Major', s: 'Campeão', mvp: 'MVP', evp: 'EVP' };

  $: rows = KINDS.map((spec) => ({ ...spec, all: items.filter((item) => item.kind === spec.kind) })).filter((row) => row.all.length);

  // Arrastar gira: cada 14px é um quadro.
  let drag: { key: string; x: number; frame: number } | null = null;
  let frames: Record<string, number> = {};
  function down(event: PointerEvent, key: string) {
    drag = { key, x: event.clientX, frame: frames[key] ?? 0 };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!drag) return;
    const frame = (((drag.frame + Math.round((event.clientX - drag.x) / 14)) % FRAMES) + FRAMES) % FRAMES;
    frames = { ...frames, [drag.key]: frame };
  }
  const up = () => (drag = null);
  function turn(event: KeyboardEvent, key: string) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    frames = { ...frames, [key]: (((frames[key] ?? 0) + step) % FRAMES + FRAMES) % FRAMES };
  }
</script>

{#if rows.length}
  <section class="shelf" class:compact aria-label="Estante de troféus">
    {#each rows as row (row.kind)}
      <div class="shelf-row">
        <p class="shelf-label">{row.label}<b>{row.all.length}</b></p>
        <ul class="shelf-items">
          {#each row.all.slice(0, limit) as item, index (`${item.kind}-${item.year}-${item.name}-${index}`)}
            {@const key = `${item.kind}-${index}`}
            <li class="trophy kind-{item.kind}">
              <button
                type="button"
                class="sprite"
                class:dragging={drag?.key === key}
                class:turned={frames[key] !== undefined}
                style={`--sheet: url('/career/trophies/${item.kind}.webp'); --frame: ${frames[key] ?? 0}`}
                aria-label={`${AWARD[item.kind]} · ${item.name} · ${item.year}. Setas giram o troféu.`}
                title={`${AWARD[item.kind]} · ${item.name} · ${item.year}`}
                on:pointerdown={(event) => down(event, key)}
                on:pointermove={move}
                on:pointerup={up}
                on:pointercancel={up}
                on:keydown={(event) => turn(event, key)}
              ></button>
              <span class="caption"><b>{item.name}</b><small>{item.year}</small></span>
            </li>
          {/each}
          {#if row.all.length > limit}
            <li class="more" aria-label={`Mais ${row.all.length - limit} ${row.many}`}>+{row.all.length - limit}</li>
          {/if}
        </ul>
      </div>
    {/each}
  </section>
{/if}

<style>
  .shelf { display: grid; gap: 4px; padding: 14px 16px 6px; border: 1px solid var(--line); background: radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--gold, #d9a441) 9%, var(--surface-2)), var(--surface-2) 70%); }
  .shelf-row { display: grid; gap: 6px; }
  .shelf-label { display: flex; align-items: baseline; gap: 8px; margin: 0; color: var(--muted); font: 800 11px/1 var(--body); letter-spacing: .12em; text-transform: uppercase; }
  .shelf-label b { color: var(--text); font: 900 16px/1 var(--display); letter-spacing: 0; }
  /* A prateleira: os troféus apoiados numa faixa com sombra. */
  .shelf-items { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 10px; margin: 0 0 12px; padding: 0 4px 10px; list-style: none; border-bottom: 3px solid color-mix(in srgb, var(--gold, #d9a441) 35%, var(--line)); box-shadow: 0 10px 14px -12px rgba(0, 0, 0, .7); }
  .trophy { --h: 150px; --ratio: .8; display: grid; justify-items: center; gap: 4px; width: calc(var(--h) * var(--ratio)); }
  /* O Tier S é largo: a folha dele tem quadros de 320x260. */
  .kind-s { --h: 96px; --ratio: 1.2308; }
  .kind-mvp, .kind-evp { --h: 96px; }
  .compact .trophy { --h: 112px; }
  .compact .kind-s { --h: 74px; }
  .compact .kind-mvp, .compact .kind-evp { --h: 76px; }
  .sprite { display: block; padding: 0; border: 0; background-color: transparent; width: calc(var(--h) * var(--ratio)); height: var(--h); background-image: var(--sheet); background-repeat: no-repeat; background-size: calc(var(--h) * var(--ratio) * 24) var(--h); background-position: calc(var(--h) * var(--ratio) * var(--frame) * -1) 0; cursor: grab; touch-action: pan-y; outline: none; filter: drop-shadow(0 6px 8px rgba(0, 0, 0, .45)); }
  .sprite.dragging { cursor: grabbing; }
  .sprite:focus-visible { box-shadow: 0 0 0 2px var(--accent); border-radius: 4px; }
  @keyframes spin { to { background-position: calc(var(--h) * var(--ratio) * -24) 0; } }
  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    .sprite:not(.turned):hover, .sprite:not(.turned):focus-visible { animation: spin 2.4s steps(24) infinite; }
  }
  .caption { display: grid; justify-items: center; gap: 1px; width: 100%; min-width: 0; text-align: center; }
  .caption b { max-width: 100%; overflow: hidden; color: var(--text); font: 800 11px/1.15 var(--body); text-overflow: ellipsis; white-space: nowrap; }
  .caption small { color: var(--muted); font-size: 10px; }
  .kind-major .caption b { color: var(--gold, #d9a441); }
  .more { align-self: center; padding: 8px 10px; border: 1px dashed var(--line); color: var(--muted); font: 900 18px/1 var(--display); }
  @media (max-width: 520px) {
    .shelf { padding: 12px 10px 4px; }
    .trophy { --h: 112px; }
    .kind-s { --h: 72px; }
    .kind-mvp, .kind-evp { --h: 72px; }
  }
</style>
