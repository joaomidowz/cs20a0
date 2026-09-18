<script lang="ts">
  import '../../app.css';
  import { onMount } from 'svelte';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import { AccountError, accountUser, loadAccount } from '$lib/game/online/account';
  import { COLLECTION_YEARS, collectionPlayerById, collectionPlayers, collectionTeamById } from '$lib/game/online/collection-pool';
  import { getOnlineServerUrl } from '$lib/game/online/config';
  import { NUMERIC_RATING_FIELDS, sendContact, sendRatingReport, type ContactCategory, type RatingField } from '$lib/game/online/support';
  import { language, theme } from '$lib/game/pageState';
  import { getRoleLabel } from '$lib/game/roleRules';
  import type { LineupSlotRole, Player } from '$lib/game/types';

  const serverUrl = getOnlineServerUrl();
  const TEXT = {
    'pt-BR': {
      title: 'Suporte', intro: 'Problema com compra, conta ou jogo? Mande por aqui: cai direto no nosso e-mail e respondemos no seu.',
      tabContact: 'Falar com o suporte', tabRating: 'Overall errado', category: 'Assunto', email: 'Seu e-mail', name: 'Nome (opcional)',
      paymentRef: 'Número da transação do Mercado Pago (opcional)', paymentHint: 'Aparece no comprovante ou em "Atividade" no Mercado Pago. Ajuda a achar sua compra.',
      message: 'Mensagem', send: 'Enviar', sending: 'Enviando…', loggedAs: 'Responderemos em', sent: 'Recebido! Protocolo', sentHint: 'Guarde o número. Respondemos no seu e-mail, normalmente em até 2 dias úteis.',
      another: 'Enviar outra', year: 'Ano', team: 'Time', player: 'Jogador', pick: 'Escolha…', field: 'O que está errado', current: 'Valor atual', suggested: 'Valor que você sugere',
      reason: 'Por quê? (conquistas, estatísticas, função no time)', source: 'Link de fonte (opcional: HLTV, Liquipedia…)', card: 'Carta atual', searchPlayer: 'Buscar jogador',
      errors: { RATE_LIMITED: 'Muitas mensagens. Tente mais tarde.', EMAIL_REQUIRED: 'Informe seu e-mail.', UNKNOWN_PLAYER: 'Jogador não encontrado.', INVALID_VALUE: 'Sugira um número de 1 a 99.', generic: 'Não foi possível enviar. Confira os campos (mensagem com 10+ caracteres).', offline: 'Servidor indisponível. Escreva para contato@cs13a0.com.' },
      categories: { purchase: 'Compra de coins', account: 'Conta / login', bug: 'Bug no jogo', suggestion: 'Sugestão', other: 'Outro' },
      fields: { overall: 'Overall', firepower: 'Firepower / mira', entry: 'Entry', awp: 'AWP', igl: 'IGL', support: 'Suporte', clutch: 'Clutch', consistency: 'Consistência', mental: 'Mental', experience: 'Experiência', role: 'Função principal', team: 'Time', nationality: 'Nacionalidade', photo: 'Foto', name: 'Nome / nick', other: 'Outro' }
    },
    en: {
      title: 'Support', intro: 'Trouble with a purchase, your account or the game? Send it here: it goes straight to our inbox and we reply to yours.',
      tabContact: 'Contact support', tabRating: 'Wrong rating', category: 'Subject', email: 'Your e-mail', name: 'Name (optional)',
      paymentRef: 'Mercado Pago transaction number (optional)', paymentHint: 'Shown on the receipt or under "Activity" in Mercado Pago. Helps us find your purchase.',
      message: 'Message', send: 'Send', sending: 'Sending…', loggedAs: 'We will reply to', sent: 'Received! Ticket', sentHint: 'Keep the number. We reply by e-mail, usually within 2 business days.',
      another: 'Send another', year: 'Year', team: 'Team', player: 'Player', pick: 'Choose…', field: 'What is wrong', current: 'Current value', suggested: 'Your suggested value',
      reason: 'Why? (titles, stats, role in the team)', source: 'Source link (optional: HLTV, Liquipedia…)', card: 'Current card', searchPlayer: 'Search player',
      errors: { RATE_LIMITED: 'Too many messages. Try again later.', EMAIL_REQUIRED: 'Enter your e-mail.', UNKNOWN_PLAYER: 'Player not found.', INVALID_VALUE: 'Suggest a number from 1 to 99.', generic: 'Could not send. Check the fields (message with 10+ characters).', offline: 'Server unavailable. Write to contato@cs13a0.com.' },
      categories: { purchase: 'Coin purchase', account: 'Account / login', bug: 'Game bug', suggestion: 'Suggestion', other: 'Other' },
      fields: { overall: 'Overall', firepower: 'Firepower / aim', entry: 'Entry', awp: 'AWP', igl: 'IGL', support: 'Support', clutch: 'Clutch', consistency: 'Consistency', mental: 'Mental', experience: 'Experience', role: 'Main role', team: 'Team', nationality: 'Nationality', photo: 'Photo', name: 'Name / nick', other: 'Other' }
    },
    es: {
      title: 'Soporte', intro: '¿Problema con una compra, tu cuenta o el juego? Envíalo aquí: llega directo a nuestro correo y respondemos al tuyo.',
      tabContact: 'Hablar con soporte', tabRating: 'Overall incorrecto', category: 'Asunto', email: 'Tu correo', name: 'Nombre (opcional)',
      paymentRef: 'Número de transacción de Mercado Pago (opcional)', paymentHint: 'Aparece en el comprobante o en "Actividad" en Mercado Pago. Ayuda a encontrar tu compra.',
      message: 'Mensaje', send: 'Enviar', sending: 'Enviando…', loggedAs: 'Responderemos a', sent: '¡Recibido! Protocolo', sentHint: 'Guarda el número. Respondemos por correo, normalmente en 2 días hábiles.',
      another: 'Enviar otro', year: 'Año', team: 'Equipo', player: 'Jugador', pick: 'Elige…', field: 'Qué está mal', current: 'Valor actual', suggested: 'Valor que sugieres',
      reason: '¿Por qué? (títulos, estadísticas, rol en el equipo)', source: 'Enlace de fuente (opcional: HLTV, Liquipedia…)', card: 'Carta actual', searchPlayer: 'Buscar jugador',
      errors: { RATE_LIMITED: 'Demasiados mensajes. Intenta más tarde.', EMAIL_REQUIRED: 'Escribe tu correo.', UNKNOWN_PLAYER: 'Jugador no encontrado.', INVALID_VALUE: 'Sugiere un número de 1 a 99.', generic: 'No se pudo enviar. Revisa los campos (mensaje con 10+ caracteres).', offline: 'Servidor no disponible. Escribe a contato@cs13a0.com.' },
      categories: { purchase: 'Compra de coins', account: 'Cuenta / login', bug: 'Bug del juego', suggestion: 'Sugerencia', other: 'Otro' },
      fields: { overall: 'Overall', firepower: 'Firepower / puntería', entry: 'Entry', awp: 'AWP', igl: 'IGL', support: 'Support', clutch: 'Clutch', consistency: 'Consistencia', mental: 'Mental', experience: 'Experiencia', role: 'Rol principal', team: 'Equipo', nationality: 'Nacionalidad', photo: 'Foto', name: 'Nombre / nick', other: 'Otro' }
    }
  } as const;
  $: text = TEXT[($language in TEXT ? $language : 'pt-BR') as keyof typeof TEXT];

  const CATEGORIES: ContactCategory[] = ['purchase', 'account', 'bug', 'suggestion', 'other'];
  const FIELDS: RatingField[] = ['overall', 'firepower', 'entry', 'awp', 'igl', 'support', 'clutch', 'consistency', 'mental', 'experience', 'role', 'team', 'nationality', 'photo', 'name', 'other'];
  const ROLES: LineupSlotRole[] = ['igl', 'awper', 'entry', 'lurker', 'support', 'rifler'];
  const STAT_FIELDS: RatingField[] = ['firepower', 'entry', 'awp', 'igl', 'support', 'clutch', 'consistency', 'mental', 'experience'];

  let tab: 'contact' | 'rating' = 'contact';
  let busy = false;
  let error = '';
  let ticketId = '';
  let website = '';

  // Contact.
  let category: ContactCategory = 'purchase';
  let email = '';
  let name = '';
  let paymentRef = '';
  let message = '';

  // Rating report.
  let year = '';
  let teamId = '';
  let playerId = '';
  let search = '';
  let field: RatingField = 'overall';
  let suggested = '';
  let reason = '';
  let source = '';

  $: teamsOfYear = year
    ? [...new Set(collectionPlayers.filter((player) => String(player.year) === year && player.teamId).map((player) => player.teamId as string))]
      .map((id) => ({ id, name: collectionTeamById.get(id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  $: term = search.trim().toLowerCase();
  $: playerOptions = (term.length >= 2
    ? collectionPlayers.filter((player) => (player.nickname ?? player.id).toLowerCase().includes(term))
    : collectionPlayers.filter((player) => year && String(player.year) === year && (!teamId || player.teamId === teamId)))
    .slice(0, 200)
    .sort((a, b) => (a.nickname ?? a.id).localeCompare(b.nickname ?? b.id) || (a.year ?? 0) - (b.year ?? 0));
  $: selected = playerId ? collectionPlayerById.get(playerId) ?? null : null;
  $: numeric = NUMERIC_RATING_FIELDS.includes(field);
  $: currentValue = selected ? currentOf(selected, field) : '';
  $: needsEmail = !$accountUser;

  const valueOf = (player: Player, key: RatingField) => (player as unknown as Record<string, number | null | undefined>)[key];
  function currentOf(player: Player, key: RatingField): string {
    if (NUMERIC_RATING_FIELDS.includes(key)) return String(valueOf(player, key) ?? '—');
    if (key === 'role') return player.role ? getRoleLabel(player.role as LineupSlotRole) : '—';
    if (key === 'team') return collectionTeamById.get(player.teamId ?? '')?.name ?? player.teamId ?? '—';
    if (key === 'name') return player.nickname ?? player.id;
    return '—';
  }
  const teamName = (player: Player) => collectionTeamById.get(player.teamId ?? '')?.name ?? '';

  function pickPlayer(id: string) {
    playerId = id;
    const player = collectionPlayerById.get(id);
    if (player) { year = String(player.year ?? ''); teamId = player.teamId ?? ''; search = ''; }
  }

  function failWith(caught: unknown) {
    const errors = text.errors as Record<string, string>;
    error = caught instanceof AccountError ? errors[caught.code] ?? (caught.status >= 500 ? errors.offline : errors.generic) : errors.offline;
  }

  async function submitContact() {
    error = ''; busy = true;
    try {
      ({ ticketId } = await sendContact(serverUrl, { category, message, name, paymentRef: category === 'purchase' ? paymentRef.replace(/\s/g, '') : undefined, email: needsEmail ? email : undefined, website }));
      message = ''; paymentRef = '';
    } catch (caught) { failWith(caught); } finally { busy = false; }
  }

  async function submitRating() {
    if (!selected) return;
    error = ''; busy = true;
    try {
      ({ ticketId } = await sendRatingReport(serverUrl, { playerId: selected.id, field, suggested: String(suggested), reason, source, email: needsEmail ? email : undefined, website }));
      reason = ''; suggested = ''; source = '';
    } catch (caught) { failWith(caught); } finally { busy = false; }
  }

  function switchTab(next: 'contact' | 'rating') {
    tab = next; error = ''; ticketId = '';
    history.replaceState(null, '', next === 'rating' ? '?aba=overall' : window.location.pathname);
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('aba') === 'overall') tab = 'rating';
    const topic = params.get('tipo');
    const map: Record<string, ContactCategory> = { compra: 'purchase', conta: 'account', bug: 'bug', sugestao: 'suggestion', outro: 'other' };
    if (topic && map[topic]) category = map[topic];
    const preset = params.get('jogador');
    if (preset && collectionPlayerById.has(preset)) { tab = 'rating'; pickPlayer(preset); }
    void loadAccount(serverUrl).catch(() => null);
  });
</script>

<svelte:head><title>{text.title} · cs13a0</title><meta name="robots" content="noindex" /></svelte:head>

<PageLayout language={$language} theme={$theme} onLanguage={(value) => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}>
  <section class="support">
    <header class="page-header">
      <span class="eyebrow">cs13a0</span>
      <h1>{text.title}</h1>
      <p>{text.intro}</p>
    </header>

    <div class="segmented-control tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'contact'} class:active={tab === 'contact'} on:click={() => switchTab('contact')}>{text.tabContact}</button>
      <button type="button" role="tab" aria-selected={tab === 'rating'} class:active={tab === 'rating'} on:click={() => switchTab('rating')}>{text.tabRating}</button>
    </div>

    {#if ticketId}
      <section class="panel done" role="status">
        <strong>{text.sent} #{ticketId}</strong>
        <p>{text.sentHint}</p>
        <button class="secondary" type="button" on:click={() => ticketId = ''}>{text.another}</button>
      </section>
    {:else if tab === 'contact'}
      <form class="panel form" on:submit|preventDefault={submitContact}>
        <label><span>{text.category}</span>
          <select bind:value={category}>{#each CATEGORIES as item}<option value={item}>{text.categories[item]}</option>{/each}</select>
        </label>
        {#if needsEmail}
          <label><span>{text.email}</span><input type="email" bind:value={email} required maxlength="254" autocomplete="email" /></label>
        {:else}
          <p class="note">{text.loggedAs} <b>{$accountUser?.email}</b></p>
        {/if}
        <label><span>{text.name}</span><input bind:value={name} maxlength="40" autocomplete="nickname" /></label>
        {#if category === 'purchase'}
          <label><span>{text.paymentRef}</span><input bind:value={paymentRef} maxlength="40" inputmode="numeric" pattern="[\w\s-]*" /><small>{text.paymentHint}</small></label>
        {/if}
        <label><span>{text.message} <small>{message.trim().length}/2000</small></span><textarea bind:value={message} rows="6" minlength="10" maxlength="2000" required></textarea></label>
        <label class="trap" aria-hidden="true">Website<input tabindex="-1" autocomplete="off" bind:value={website} /></label>
        <button class="primary" type="submit" disabled={busy || message.trim().length < 10 || (needsEmail && !email.includes('@'))}>{busy ? text.sending : text.send}</button>
      </form>
    {:else}
      <form class="panel form" on:submit|preventDefault={submitRating}>
        <label><span>{text.searchPlayer}</span><input bind:value={search} placeholder="s1mple, coldzera…" /></label>
        <div class="row">
          <label><span>{text.year}</span>
            <select bind:value={year} on:change={() => { teamId = ''; playerId = ''; }}><option value="">{text.pick}</option>{#each [...COLLECTION_YEARS].reverse() as item}<option value={String(item)}>{item}</option>{/each}</select>
          </label>
          <label><span>{text.team}</span>
            <select bind:value={teamId} disabled={!year} on:change={() => { playerId = ''; }}><option value="">{text.pick}</option>{#each teamsOfYear as team (team.id)}<option value={team.id}>{team.name}</option>{/each}</select>
          </label>
          <label><span>{text.player}</span>
            <select value={playerId} disabled={!playerOptions.length} on:change={(event) => pickPlayer(event.currentTarget.value)}>
              <option value="">{text.pick}</option>
              {#each playerOptions as player (player.id)}<option value={player.id}>{player.nickname ?? player.id} · {player.year ?? ''} · {teamName(player)}</option>{/each}
            </select>
          </label>
        </div>

        {#if selected}
          <div class="card-summary">
            <div class="head"><span class="ovr">{selected.overall ?? '—'}</span><div><strong>{selected.nickname ?? selected.id}</strong><small>{selected.year ?? ''} · {teamName(selected)} · {selected.role ? getRoleLabel(selected.role as LineupSlotRole) : '—'}</small></div></div>
            <ul class="stats">{#each STAT_FIELDS as key}<li class:hit={key === field}><span>{text.fields[key]}</span><b>{valueOf(selected, key) ?? '—'}</b></li>{/each}</ul>
          </div>
          <div class="row">
            <label><span>{text.field}</span>
              <select bind:value={field} on:change={() => suggested = ''}>{#each FIELDS as item}<option value={item}>{text.fields[item]}</option>{/each}</select>
            </label>
            <label><span>{text.current}</span><input value={currentValue} readonly /></label>
            <label><span>{text.suggested}</span>
              {#if numeric}
                <input type="number" min="1" max="99" step="1" bind:value={suggested} required />
              {:else if field === 'role'}
                <select bind:value={suggested} required><option value="">{text.pick}</option>{#each ROLES as role}<option value={role}>{getRoleLabel(role)}</option>{/each}</select>
              {:else}
                <input bind:value={suggested} maxlength="40" required />
              {/if}
            </label>
          </div>
          <label><span>{text.reason} <small>{reason.trim().length}/1000</small></span><textarea bind:value={reason} rows="4" minlength="10" maxlength="1000" required></textarea></label>
          <label><span>{text.source}</span><input type="url" bind:value={source} maxlength="300" placeholder="https://" /></label>
          {#if needsEmail}
            <label><span>{text.email}</span><input type="email" bind:value={email} required maxlength="254" autocomplete="email" /></label>
          {/if}
          <label class="trap" aria-hidden="true">Website<input tabindex="-1" autocomplete="off" bind:value={website} /></label>
          <button class="primary" type="submit" disabled={busy || !String(suggested).trim() || reason.trim().length < 10 || (needsEmail && !email.includes('@'))}>{busy ? text.sending : text.send}</button>
        {/if}
      </form>
    {/if}
    {#if error}<p class="online-error" role="alert">{error}</p>{/if}
  </section>
</PageLayout>

<style>
  .support { display: grid; gap: 18px; max-width: 820px; padding: 28px 0 70px; }
  .page-header h1 { margin: 10px 0 12px; font-size: clamp(2.4rem, 8vw, 4.2rem); }
  .page-header p { margin: 0; color: var(--muted); line-height: 1.6; }
  .tabs { justify-self: start; }
  .form { display: grid; gap: 14px; padding: 22px; }
  .form label { display: grid; gap: 6px; min-width: 0; }
  .form label > span { color: var(--muted); font-size: .6rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .form label small { color: var(--muted); font-size: .7rem; line-height: 1.4; text-transform: none; letter-spacing: 0; font-weight: 400; }
  .form input, .form select, .form textarea { min-height: 44px; padding: 8px 10px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: inherit; }
  .form textarea { resize: vertical; line-height: 1.5; }
  .form input[readonly] { color: var(--muted); }
  .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .note { margin: 0; color: var(--muted); font-size: .85rem; } .note b { color: var(--text); }
  .trap { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
  .card-summary { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--line); background: var(--surface-2); }
  .card-summary .head { display: flex; gap: 12px; align-items: center; }
  .card-summary .head div { display: grid; gap: 2px; } .card-summary small { color: var(--muted); font-size: .75rem; }
  .ovr { display: grid; place-items: center; min-width: 52px; height: 52px; background: var(--accent); color: #0a0d08; font: 900 1.6rem/1 'Arial Narrow', Impact, sans-serif; }
  .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 4px; margin: 0; padding: 0; list-style: none; }
  .stats li { display: flex; justify-content: space-between; gap: 6px; padding: 6px 8px; background: var(--surface); font-size: .74rem; }
  .stats li.hit { outline: 1px solid var(--accent); } .stats b { color: var(--accent); }
  .done { display: grid; gap: 10px; padding: 22px; border-color: var(--accent); }
  .done strong { color: var(--accent); font: 900 1.6rem/1.1 'Arial Narrow', Impact, sans-serif; }
  .done p { margin: 0; color: var(--muted); } .done button { justify-self: start; }
  .online-error { padding: 12px; border: 1px solid var(--danger); color: #ff9b90; }
</style>
