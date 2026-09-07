<script lang="ts">
  import { translateOnline } from '$lib/game/online/i18n';
  import type { PublicParticipant, PublicSeason } from '$lib/game/online/contracts';
  import type { Language } from '$lib/game/types';

  export let rematch: NonNullable<PublicSeason['rematch']>;
  export let participants: PublicParticipant[] = [];
  export let selfParticipantId: string | null = null;
  export let secondsLeft = 0;
  export let language: Language = 'pt-BR';
  export let onVote: (accept: boolean) => void = () => {};

  $: t = (key: Parameters<typeof translateOnline>[1]) => translateOnline(language, key);
  $: accepted = new Set(rematch.accepted);
  $: declined = new Set(rematch.declined);
  $: myVote = selfParticipantId ? (accepted.has(selfParticipantId) ? 'accepted' : declined.has(selfParticipantId) ? 'declined' : null) : null;
  $: stateOf = (id: string): 'accepted' | 'declined' | 'waiting' => accepted.has(id) ? 'accepted' : declined.has(id) ? 'declined' : 'waiting';
  $: open = secondsLeft > 0;
</script>

<section class="panel rematch-panel" aria-live="polite">
  <header class="rematch-head">
    <div><span class="eyebrow">REMATCH · {t('rematchClosesIn').toUpperCase()}</span><h2>{t('rematchTitle')}</h2></div>
    <strong class="rematch-clock" class:urgent={secondsLeft <= 3}>{secondsLeft}s</strong>
  </header>
  <div class="rematch-actions">
    <button class="primary" type="button" aria-pressed={myVote === 'accepted'} disabled={!open} on:click={() => onVote(true)}>{t('rematchAccept')}</button>
    <button class="secondary" type="button" aria-pressed={myVote === 'declined'} disabled={!open} on:click={() => onVote(false)}>{t('rematchDecline')}</button>
  </div>
  <p class="rematch-hint">{t('rematchHint')}{#if myVote} · <b>{t('rematchYourVote')}: {myVote === 'accepted' ? t('rematchAccepted') : t('rematchDeclined')}</b>{/if}</p>
  <ul class="rematch-list">
    {#each participants as participant (participant.id)}
      {@const state = stateOf(participant.id)}
      <li class={state} class:mine={participant.id === selfParticipantId}>
        <span>{participant.organizationName.slice(0, 2).toUpperCase()}</span>
        <div><strong>{participant.organizationName}</strong><small>{participant.playerName}</small></div>
        <b>{state === 'accepted' ? t('rematchAccepted') : state === 'declined' ? t('rematchDeclined') : t('rematchWaiting')}</b>
      </li>
    {/each}
  </ul>
  <p class="rematch-count"><b>{rematch.accepted.length}</b> / {participants.length} · {t('rematchAccepted').toLowerCase()}</p>
</section>

<style>
  .rematch-panel{display:grid;gap:12px;margin:0 0 18px;padding:18px;border-color:var(--accent);box-shadow:0 0 22px color-mix(in srgb,var(--accent) 18%,transparent)}
  .rematch-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.rematch-head h2{margin:4px 0 0;font-size:1.6rem}
  .rematch-clock{min-width:64px;font:900 2.4rem 'Arial Narrow',Impact,sans-serif;color:var(--accent);text-align:right;font-variant-numeric:tabular-nums}.rematch-clock.urgent{color:var(--danger)}
  .rematch-actions{display:grid;gap:8px}.rematch-actions button{min-height:52px;font-size:.9rem}.rematch-actions button[aria-pressed="true"]{outline:2px solid var(--accent);outline-offset:2px}
  .rematch-hint{margin:0;color:var(--muted);font-size:.68rem;line-height:1.45}.rematch-hint b{color:var(--text)}
  .rematch-list{display:grid;gap:6px;margin:0;padding:0;list-style:none}
  .rematch-list li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);background:var(--surface-2)}
  .rematch-list li>span{display:grid;place-items:center;width:32px;height:32px;background:var(--line);color:var(--text);font-size:.7rem;font-weight:900}
  .rematch-list strong,.rematch-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rematch-list small{margin-top:2px;color:var(--muted);font-size:.58rem}
  .rematch-list b{font-size:.55rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  .rematch-list li.accepted{border-color:var(--accent)}.rematch-list li.accepted>span{background:var(--accent);color:#0a0d08}.rematch-list li.accepted b{color:var(--accent)}
  .rematch-list li.declined{opacity:.55}.rematch-list li.declined b{color:var(--danger)}
  .rematch-list li.mine strong{text-decoration:underline;text-underline-offset:3px}
  .rematch-count{margin:0;color:var(--muted);font-size:.62rem;text-transform:uppercase;letter-spacing:.08em}.rematch-count b{color:var(--accent);font-size:.9rem}
  @media(min-width:680px){.rematch-actions{grid-template-columns:2fr 1fr}}
</style>
