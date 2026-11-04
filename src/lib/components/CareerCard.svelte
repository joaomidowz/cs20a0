<script lang="ts">
  // A carta da Carreira de Jogador: raridade pelo overall (escada do modo online, cards.ts), os 6 atributos
  // sempre à vista e, na sua carta, quanto falta pro próximo degrau. Rodapé livre (slot) pra relação/ações.
  import { CAREER_RARITY_LABEL, careerRarity } from '$lib/game/playerCareer/cards';
  import type { Player } from '$lib/game/types';
  import type { CardInfo } from '$lib/game/playerCareer/scout';
  import { licensedImageFor, licensedImageSrc } from '$lib/game/visuals/licensed';

  export let player: Player;
  /** Rótulo da função ("Entry fragger"). */
  export let roleLabel = '';
  /** Linha de apoio sob o nick ("Você · ODDIK"). */
  export let caption = '';
  export let me = false;
  /** Bônus de treino por atributo (só a sua carta tem). */
  export let trained: Partial<Record<string, number>> | null = null;
  export let onOpen: (() => void) | null = null;
  /** País, idioma, idade e a língua da call (no lugar da linha de apoio). */
  export let profile: CardInfo | null = null;
  /** Aviso rápido em cima da carta (conversa, vestiário); a página some com ele em 5 s. */
  export let notice: { who: string; text: string; tone: 'good' | 'bad' | 'neutral' } | null = null;
  export let onNoticeClose: (() => void) | null = null;
  /** 'sheet' é a versão grande da modal. */
  export let size: 'mate' | 'sheet' = 'mate';

  const ATTRIBUTES = [
    { key: 'firepower', short: 'MIR', label: 'Mira' },
    { key: 'entry', short: 'ENT', label: 'Entrada' },
    { key: 'clutch', short: 'CLU', label: 'Clutch' },
    { key: 'awp', short: 'AWP', label: 'AWP' },
    { key: 'support', short: 'SUP', label: 'Suporte' },
    { key: 'igl', short: 'IGL', label: 'IGL' }
  ] as const;

  $: overall = player.overall ?? 60;
  $: info = careerRarity(overall);
  $: values = ATTRIBUTES.map((attribute) => ({ ...attribute, value: Number(player[attribute.key] ?? 0), gain: trained?.[attribute.key] ?? 0 }));
  $: best = new Set([...values].sort((a, b) => b.value - a.value).slice(0, 2).map((attribute) => attribute.key));
  $: initials = (player.nickname ?? '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?';
  // Foto licenciada do jogador real (registro em licensed-images.json), nunca na sua carta.
  // Bandeira que não está no pacote do jogo: some sem quebrar a linha.
  let flagMissing = false;
  $: profile?.flag, (flagMissing = false);
  $: photo = me ? null : licensedImageFor('player', player.baseId ?? null) ?? licensedImageFor('player', (player.nickname ?? '').toLowerCase());
</script>

<article class="ccard r-{info.rarity} size-{size}" class:me>
  <svelte:element
    this={onOpen ? 'button' : 'div'}
    class="face"
    type={onOpen ? 'button' : undefined}
    aria-label={onOpen ? `Abrir a carta de ${player.nickname ?? 'jogador'}` : undefined}
    on:click={() => onOpen?.()}
    role={onOpen ? undefined : 'group'}
  >
    {#if photo}
      <img class="photo" src={licensedImageSrc(photo)} alt="" decoding="async" loading="lazy" />
    {:else}
      <span class="mono" aria-hidden="true">{initials}</span>
    {/if}
    <span class="top">
      <span class="ovr-block">
        <span class="ovr">{overall}</span>
        {#if roleLabel}<span class="pos">{roleLabel}</span>{/if}
      </span>
      <span class="rar">{CAREER_RARITY_LABEL[info.rarity]}</span>
    </span>
    <span class="id">
      <b class="nick">{player.nickname ?? player.id}</b>
      {#if caption}<span class="cap">{caption}</span>{/if}
      {#if profile}
        <span class="cap meta" title={profile.detail}>
          {#if profile.flag && !flagMissing}<img class="flag" src={`/flags/${profile.flag}.svg`} alt={profile.country ?? ''} width="16" height="12" on:error={() => (flagMissing = true)} />{/if}
          <span class="lang">{profile.spoken}</span>
          {#if profile.age !== null}<span class="age">· {profile.age} anos</span>{/if}
          {#if profile.call}<span class="call" class:warn={!profile.call.ok} title={`Call em ${profile.call.label}: ${profile.call.fluency}/100`}>{profile.call.code}</span>{/if}
        </span>
        {#if size === 'sheet'}<span class="cap detail">{profile.detail}</span>{/if}
      {/if}
    </span>
    <span class="stats">
      {#each values as attribute}
        <span class="stat" class:best={best.has(attribute.key)} title={attribute.label}>
          <span class="k">{size === 'sheet' ? attribute.label : attribute.short}</span>
          <span class="v">{attribute.value || '—'}{#if attribute.gain}<small>+{attribute.gain}</small>{/if}</span>
        </span>
      {/each}
    </span>
    {#if me}
      <span class="climb">
        {#if info.next}
          <span class="climb-line"><span>{CAREER_RARITY_LABEL[info.next.rarity]} no {info.next.at}</span><b>faltam {info.next.missing}</b></span>
        {:else}
          <span class="climb-line"><span>Topo da escada</span><b>GOAT</b></span>
        {/if}
        <span class="climb-bar" aria-hidden="true"><i style={`width:${Math.round(info.progress * 100)}%`}></i></span>
      </span>
    {/if}
  </svelte:element>
  {#if $$slots.default}<div class="foot"><slot /></div>{/if}
  {#if notice}
    <div class="notice tone-{notice.tone}" role="status">
      <p><b>{notice.who}</b> {notice.text}</p>
      <button type="button" class="notice-x" aria-label="Fechar aviso" on:click={() => onNoticeClose?.()}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  {/if}
</article>

<style>
  .ccard {
    --r: #6b7681;
    --r-ink: var(--text);
    --display: 'Big Shoulders Display', 'Arial Narrow', Impact, sans-serif;
    position: relative;
    display: grid;
    grid-template-rows: 1fr auto;
    min-width: 0;
    border: 1px solid color-mix(in srgb, var(--r) 70%, var(--line));
    background: var(--surface);
    isolation: isolate;
    transition: transform .18s cubic-bezier(.16, 1, .3, 1), box-shadow .18s ease;
  }
  .r-rare { --r: #4f8cff; --r-ink: #8db4ff; }
  .r-elite { --r: #a66bff; --r-ink: #c9a3ff; }
  .r-superstar { --r: #2de2ff; --r-ink: #8ff0ff; box-shadow: 0 0 18px rgb(45 226 255 / 12%); }
  .r-legend { --r: #ffcc55; --r-ink: #ffd97f; box-shadow: 0 0 20px rgb(255 204 85 / 14%); }
  .r-goat { --r: #e4ff3b; --r-ink: #efff8a; box-shadow: 0 0 22px rgb(215 239 82 / 18%); animation: goat-glow 2.8s ease-in-out infinite; }
  :global(:root[data-theme='light']) .ccard { --r-ink: color-mix(in srgb, var(--r) 55%, var(--text)); }
  .ccard.me { border-width: 2px; border-color: var(--r); }
  .ccard:not(.r-common):hover, .ccard.me:hover { box-shadow: 0 10px 30px color-mix(in srgb, var(--r) 22%, transparent); }
  .ccard:has(.face:hover) { transform: translateY(-3px); }

  .face {
    position: relative;
    display: grid;
    align-content: start;
    gap: 6px;
    min-width: 0;
    width: 100%;
    margin: 0;
    padding: 10px 10px 10px;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    color: var(--text);
    font: inherit;
    text-align: left;
    background:
      radial-gradient(130% 70% at 0% 0%, color-mix(in srgb, var(--r) 24%, transparent) 0%, transparent 60%),
      linear-gradient(180deg, var(--surface-2), var(--surface));
  }
  button.face { cursor: pointer; }
  button.face:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  /* Folha metalizada nas cartas altas: um brilho atravessa devagar. */
  .r-legend .face::after, .r-goat .face::after {
    content: '';
    position: absolute;
    inset: -40% -60%;
    z-index: 0;
    background: linear-gradient(105deg, transparent 42%, color-mix(in srgb, var(--r) 22%, transparent) 50%, transparent 58%);
    animation: sheen 5.5s ease-in-out infinite;
    pointer-events: none;
  }
  .face > * { position: relative; z-index: 1; }
  .mono {
    position: absolute;
    right: -6px;
    top: 30px;
    z-index: 0;
    font: 900 76px/.8 var(--display);
    letter-spacing: -.02em;
    color: color-mix(in srgb, var(--r) 14%, transparent);
    pointer-events: none;
  }
  /* Rosto à direita, sob a etiqueta de raridade, sumindo para a esquerda e para baixo: os status ficam por cima. */
  .photo {
    position: absolute;
    right: 0;
    top: 26px;
    z-index: 0;
    width: 62%;
    height: 72%;
    object-fit: cover;
    object-position: center top;
    opacity: .5;
    pointer-events: none;
    -webkit-mask-image: linear-gradient(to left, #000 35%, transparent 95%), linear-gradient(to bottom, #000 45%, transparent 100%);
    -webkit-mask-composite: source-in;
    mask-image: linear-gradient(to left, #000 35%, transparent 95%), linear-gradient(to bottom, #000 45%, transparent 100%);
    mask-composite: intersect;
  }
  .size-sheet .photo { top: 40px; width: 58%; height: 70%; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; }
  .ovr-block { display: grid; gap: 3px; }
  .ovr { font: 900 38px/.82 var(--display); color: var(--r-ink); font-variant-numeric: tabular-nums; }
  .r-common .ovr { color: var(--text); }
  .pos { color: var(--muted); font: 800 11px/1 Archivo, Inter, sans-serif; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 11ch; }
  .rar { padding: 4px 6px; border: 1px solid color-mix(in srgb, var(--r) 60%, transparent); color: var(--r-ink); font: 800 10px/1 Archivo, Inter, sans-serif; letter-spacing: .12em; text-transform: uppercase; white-space: nowrap; }
  .r-common .rar { color: var(--muted); border-color: var(--line); }
  .id { display: grid; gap: 2px; min-width: 0; margin-top: 2px; }
  .nick { font: 800 21px/1 var(--display); text-transform: uppercase; letter-spacing: .01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cap { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .notice { position: absolute; top: 6px; right: 6px; left: 6px; z-index: 4; padding: 8px 30px 8px 10px; border: 1px solid var(--line); border-left: 3px solid var(--muted); background: color-mix(in srgb, var(--surface) 94%, transparent); box-shadow: 0 8px 24px rgb(0 0 0 / 35%); animation: notice-in .18s cubic-bezier(.16, 1, .3, 1); }
  .notice.tone-good { border-left-color: var(--accent); }
  .notice.tone-bad { border-left-color: var(--accent-2, #ff8a3d); }
  .notice p { display: -webkit-box; margin: 0; overflow: hidden; color: var(--text); font-size: 12px; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 6; line-clamp: 6; }
  .notice b { font-weight: 800; }
  .notice.tone-good b { color: var(--accent); }
  .notice.tone-bad b { color: var(--accent-2, #ff8a3d); }
  .notice-x { position: absolute; top: 2px; right: 2px; display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; background: none; color: var(--muted); cursor: pointer; }
  .notice-x:hover { color: var(--text); }
  .notice-x:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  @keyframes notice-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .notice { animation: none; } }
  .meta { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .meta .flag { flex: none; width: 16px; height: 12px; object-fit: cover; border: 1px solid color-mix(in srgb, var(--line) 70%, transparent); }
  .meta .lang { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .meta .age { flex: none; }
  .meta .call { flex: none; margin-left: auto; padding: 1px 4px; border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent); color: var(--accent); font-size: 10px; font-weight: 800; line-height: 1.2; letter-spacing: .06em; }
  .meta .call.warn { border-color: color-mix(in srgb, var(--accent-2, #ff8a3d) 60%, transparent); color: var(--accent-2, #ff8a3d); }
  .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px; }
  .stat { display: grid; justify-items: center; gap: 2px; padding: 4px 2px; background: color-mix(in srgb, var(--bg) 55%, transparent); border: 1px solid color-mix(in srgb, var(--line) 70%, transparent); }
  .stat .k { color: var(--muted); font: 800 10px/1 Archivo, Inter, sans-serif; letter-spacing: .08em; }
  .stat .v { font: 800 16px/1 var(--display); font-variant-numeric: tabular-nums; }
  .stat .v small { margin-left: 1px; color: var(--accent); font: 800 10px/1 Archivo, Inter, sans-serif; }
  .stat.best { border-color: color-mix(in srgb, var(--r) 55%, transparent); }
  .stat.best .v { color: var(--r-ink); }
  .r-common .stat.best .v { color: var(--accent); }
  .r-common .stat.best { border-color: color-mix(in srgb, var(--accent) 35%, transparent); }
  .climb { display: grid; gap: 5px; margin-top: 2px; }
  .climb-line { display: flex; justify-content: space-between; gap: 6px; color: var(--muted); font: 700 11px/1.1 Archivo, Inter, sans-serif; text-transform: uppercase; letter-spacing: .06em; }
  .climb-line b { color: var(--accent); white-space: nowrap; }
  .climb-bar { height: 5px; background: color-mix(in srgb, var(--line) 80%, transparent); }
  .climb-bar i { display: block; height: 100%; background: var(--accent); }
  .foot { display: grid; gap: 5px; padding: 6px 8px 8px; border-top: 1px solid color-mix(in srgb, var(--r) 30%, var(--line)); background: var(--surface); }

  .size-sheet .face { gap: 12px; padding: 20px; }
  .size-sheet .ovr { font-size: 72px; }
  .size-sheet .mono { font-size: 150px; top: 50px; }
  .size-sheet .nick { font-size: 40px; }
  .size-sheet .cap { font-size: 14px; }
  .size-sheet .detail { white-space: normal; }
  .size-sheet .stats { gap: 6px; }
  .size-sheet .stat { padding: 10px 6px; }
  .size-sheet .stat .k { font-size: 11px; }
  .size-sheet .stat .v { font-size: 26px; }

  /* Tela grande e alta: a carta cresce em retrato (o hub cabe numa tela e ainda sobra altura). */
  @media (min-width: 1500px) and (min-height: 960px) {
    .size-mate .face { gap: 11px; padding: 16px 14px; }
    .size-mate .ovr { font-size: 58px; }
    .size-mate .mono { font-size: 120px; top: 44px; }
    .size-mate .nick { font-size: 30px; }
    .size-mate .cap { font-size: 13px; }
    .size-mate .stat { padding: 8px 2px; }
    .size-mate .stat .v { font-size: 21px; }
    .size-mate .stat .k { font-size: 11px; }
    .size-mate .rar { font-size: 11px; }
  }

  @keyframes goat-glow { 50% { box-shadow: 0 0 34px rgb(215 239 82 / 30%); } }
  @keyframes sheen { 0%, 55% { transform: translateX(-35%); } 85%, 100% { transform: translateX(35%); } }
  @media (prefers-reduced-motion: reduce) {
    .ccard, .r-goat { animation: none; transition: none; }
    .ccard:has(.face:hover) { transform: none; }
    .r-legend .face::after, .r-goat .face::after { animation: none; display: none; }
  }
</style>
