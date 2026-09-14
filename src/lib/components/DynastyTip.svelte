<script lang="ts">
  import type { DynastyTip } from '$lib/game/dynasty/tips';
  import type { Language } from '$lib/game/types';

  export let tip: DynastyTip;
  export let language: Language = 'pt-BR';
  export let onDismiss: () => void = () => {};
  export let onDisable: () => void = () => {};

  const copy = {
    'pt-BR': {
      label: 'Dica', ok: 'Entendi', off: 'Desligar dicas',
      'tip-identity': 'Primeiro escolha o estilo, depois contrate o coach. O coach pesa na força e na tática de cada série.',
      'tip-series-plan': 'Antes de cada série, ajuste estilo e tática. Estudar o adversário dá força extra, mas o saldo de estudos é curto.',
      'tip-team-tab': 'A aba Time mostra o poder efetivo: elenco, coach, plano da série e treino já somados.',
      'tip-training': 'O treino vale para todo o Major. Quem joga 3 mapas ou mais ganha +1 permanente no atributo treinado.',
      'tip-window': 'Na janela você vende, compra e troca o coach. Jogador fora de posição não bloqueia, só custa 1,5% de força.',
      'tip-swap': 'Troca direta entrega um jogador seu por um deles, com diferença em dinheiro. Conta como uma troca.'
    },
    es: {
      label: 'Consejo', ok: 'Entendido', off: 'Desactivar consejos',
      'tip-identity': 'Primero elige el estilo y luego contrata al coach. El coach influye en la fuerza y la táctica de cada serie.',
      'tip-series-plan': 'Antes de cada serie, ajusta estilo y táctica. Estudiar al rival da fuerza extra, pero hay pocos estudios.',
      'tip-team-tab': 'La pestaña Equipo muestra el poder efectivo: plantilla, coach, plan de la serie y entrenamiento sumados.',
      'tip-training': 'El entrenamiento dura todo el Major. Quien juega 3 mapas o más gana +1 permanente en el atributo entrenado.',
      'tip-window': 'En la ventana vendes, compras y cambias de coach. Un jugador fuera de posición no bloquea, solo cuesta 1,5% de fuerza.',
      'tip-swap': 'El intercambio directo da un jugador tuyo por uno de ellos, con diferencia en dinero. Cuenta como un movimiento.'
    },
    en: {
      label: 'Tip', ok: 'Got it', off: 'Turn off tips',
      'tip-identity': 'Pick the style first, then hire the coach. The coach shapes strength and tactics in every series.',
      'tip-series-plan': 'Before each series, set style and tactic. Studying the opponent adds strength, but studies are limited.',
      'tip-team-tab': 'The Team tab shows effective power: roster, coach, series plan and training combined.',
      'tip-training': 'Training lasts the whole Major. Players with 3+ maps get a permanent +1 in the trained attribute.',
      'tip-window': 'In the window you sell, buy and swap the coach. An off-role player does not block, it only costs 1.5% strength.',
      'tip-swap': 'A direct swap trades one of your players for one of theirs, with a cash difference. It counts as one move.'
    }
  } as const;

  $: c = copy[language];
  $: text = c[tip.id as keyof typeof c] ?? '';
</script>

<aside class="dynasty-tip" aria-live="polite">
  <span class="label">{c.label}</span>
  <p>{text}</p>
  <div class="actions">
    <button type="button" class="ok" on:click={onDismiss}>{c.ok}</button>
    <button type="button" class="off" on:click={onDisable}>{c.off}</button>
  </div>
</aside>

<style>
  .dynasty-tip { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px 14px; align-items: center; margin: 0 0 14px; padding: 10px 14px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent) 6%, var(--surface)); min-width: 0; }
  .label { color: var(--accent); font: 800 .62rem/1 Inter, Arial, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
  p { margin: 0; color: var(--text); font-size: .82rem; line-height: 1.45; overflow-wrap: anywhere; }
  .actions { display: flex; gap: 6px; }
  button { min-height: 32px; padding: 0 10px; border: 1px solid var(--line); background: transparent; color: var(--muted); font: 800 .62rem/1 Inter, Arial, sans-serif; text-transform: uppercase; cursor: pointer; }
  button.ok { border-color: var(--accent); color: var(--accent); }
  button:hover { color: var(--text); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (max-width: 560px) { .dynasty-tip { grid-template-columns: minmax(0, 1fr); } .actions { justify-content: flex-end; } }
</style>
