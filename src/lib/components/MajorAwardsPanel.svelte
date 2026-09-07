<script lang="ts">
  import { translate, translatePlacement, translateTeamName } from '$lib/game/i18n';
  import type { Language, MajorAwards, MajorPlayerAward, MajorTeamAward } from '$lib/game/types';

  /** Awards of the whole Major (null when the run carried no kill feed). */
  export let awards: MajorAwards | null = null;
  export let language: Language = 'pt-BR';
  /** Team of the viewer, highlighted with the accent colour wherever it appears. */
  export let userTeamId: string | null = null;
  export let onTeam: ((teamId: string) => void) | null = null;

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const initials = (name: string) => (name || '?').slice(0, 2).toUpperCase();
  const isUser = (teamId: string) => userTeamId !== null && teamId === userTeamId;
  const teamName = (award: { teamName?: string; name?: string }, lang: Language) => translateTeamName(lang, award.teamName ?? award.name ?? '');
  const multiKills = (award: MajorPlayerAward) => `${award.multiKills.ace} / ${award.multiKills.quad} / ${award.multiKills.triple}`;
  const openTeam = (teamId: string) => onTeam?.(teamId);
  const teamRecord = (team: MajorTeamAward) => `${team.mapsWon}–${team.mapsLost}`;
</script>

<section class="major-awards" aria-label={t('majorMvp')}>
  {#if !awards || !awards.mvp}
    <p class="awards-empty">{t('awardsUnavailable')}</p>
  {:else}
    {@const mvp = awards.mvp}
    <div class="awards-hero">
      <article class="award-card mvp-card" class:is-user={isUser(mvp.teamId)}>
        <span class="award-eyebrow">{t('majorMvp')}</span>
        <div class="award-player">
          <div class="avatar large">{initials(mvp.name)}</div>
          <div class="award-identity">
            <h2>{mvp.name}</h2>
            {#if onTeam}
              <button class="team-link" type="button" on:click={() => openTeam(mvp.teamId)}>{teamName(mvp, language)}</button>
            {:else}
              <p>{teamName(mvp, language)}</p>
            {/if}
            <small>{translatePlacement(language, mvp.placement)}</small>
          </div>
          <div class="award-rating"><small>{t('rating')}</small><b>{mvp.rating.toFixed(2)}</b></div>
        </div>
        <div class="award-numbers">
          <span><small>K / D</small><b>{mvp.kills} / {mvp.deaths}</b></span>
          <span><small>K/D</small><b>{mvp.kdRatio.toFixed(2)}</b></span>
          <span><small>CLUTCHES</small><b>{mvp.clutches}</b></span>
          <span><small>ACE / 4K / 3K</small><b>{multiKills(mvp)}</b></span>
          <span><small>OPENINGS</small><b>{mvp.openingKills}</b></span>
          <span><small>{t('maps')}</small><b>{mvp.mapsPlayed}</b></span>
        </div>
      </article>
      {#if awards.topTeam}
        {@const team = awards.topTeam}
        <article class="award-card team-card-award" class:is-user={isUser(team.teamId)}>
          <span class="award-eyebrow">{t('bestTeam')}</span>
          <div class="award-team">
            {#if onTeam}
              <button class="team-link big" type="button" on:click={() => openTeam(team.teamId)}>{teamName(team, language)}</button>
            {:else}
              <h2>{teamName(team, language)}</h2>
            {/if}
            <small>{translatePlacement(language, team.placement)}</small>
          </div>
          <div class="award-rating"><small>{t('rating')}</small><b>{team.rating.toFixed(2)}</b></div>
          <div class="award-numbers two">
            <span><small>{t('maps')}</small><b>{teamRecord(team)}</b></span>
            <span><small>ROUNDS</small><b>{team.roundsWon}–{team.roundsLost}</b></span>
          </div>
        </article>
      {/if}
    </div>

    {#if awards.clutchKing || awards.highlightReel}
      <div class="awards-minis">
        {#if awards.clutchKing}
          {@const king = awards.clutchKing}
          <article class="award-mini" class:is-user={isUser(king.teamId)}>
            <span class="award-eyebrow">{t('clutchKing')}</span>
            <strong>{king.name}</strong>
            <small>{teamName(king, language)}</small>
            <b>{king.clutches} <i>CLUTCHES</i></b>
          </article>
        {/if}
        {#if awards.highlightReel}
          {@const reel = awards.highlightReel}
          <article class="award-mini" class:is-user={isUser(reel.teamId)}>
            <span class="award-eyebrow">{t('highlightReel')}</span>
            <strong>{reel.name}</strong>
            <small>{teamName(reel, language)}</small>
            <b>{reel.multiKills.ace} <i>ACE</i> · {reel.multiKills.quad} <i>4K</i> · {reel.multiKills.triple} <i>3K</i></b>
          </article>
        {/if}
      </div>
    {/if}

    <div class="awards-columns">
      <article class="award-list">
        <span class="award-eyebrow">{t('topPlayers')}</span>
        <ol>
          {#each awards.topPlayers as award, index (award.playerId + award.teamId)}
            <li class:is-user={isUser(award.teamId)} class:is-mvp={index === 0}>
              <span class="rank">{index + 1}</span>
              <span class="who"><strong>{award.name}</strong><small>{teamName(award, language)}</small></span>
              <span class="line"><small>K–D</small>{award.kills}–{award.deaths}</span>
              <b>{award.rating.toFixed(2)}</b>
            </li>
          {/each}
        </ol>
      </article>
      <article class="award-list teams">
        <span class="award-eyebrow">{t('teamRatings')}</span>
        <div class="team-table-wrap">
          <table>
            <thead><tr><th>#</th><th class="left">{t('team')}</th><th>{t('rating')}</th><th>{t('maps')}</th><th class="left">{t('placement')}</th></tr></thead>
            <tbody>
              {#each awards.teams as team, index (team.teamId)}
                <tr class:is-user={isUser(team.teamId)}>
                  <td>{index + 1}</td>
                  <td class="left">
                    {#if onTeam}<button class="team-link" type="button" on:click={() => openTeam(team.teamId)}>{teamName(team, language)}</button>{:else}{teamName(team, language)}{/if}
                  </td>
                  <td><b>{team.rating.toFixed(2)}</b></td>
                  <td>{teamRecord(team)}</td>
                  <td class="left placement">{translatePlacement(language, team.placement)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  {/if}
</section>

<style>
  .major-awards{display:grid;gap:12px;margin-bottom:18px;min-width:0}
  .awards-empty{margin:0;padding:14px 16px;border:1px solid var(--line);color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.06em}
  .award-eyebrow{display:block;color:var(--muted);font-size:.58rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
  .awards-hero{display:grid;gap:12px}
  .award-card{position:relative;padding:18px;border:1px solid var(--line);background:linear-gradient(155deg,var(--surface-2),var(--surface));overflow:hidden}
  .mvp-card{border-color:color-mix(in srgb,var(--accent) 60%,var(--line));box-shadow:inset 4px 0 var(--accent)}
  .mvp-card::after{content:'MVP';position:absolute;right:-6px;top:-18px;color:color-mix(in srgb,var(--accent) 12%,transparent);font:900 6.5rem 'Arial Narrow',Impact,sans-serif;letter-spacing:-.05em;pointer-events:none}
  .award-player{position:relative;z-index:1;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;margin-top:12px}
  .award-identity{display:grid;gap:2px;min-width:0}
  .award-identity h2,.award-team h2{margin:0;font-size:2.1rem;text-transform:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .award-identity p{margin:0;color:var(--accent);font-size:.72rem;font-weight:800;text-transform:uppercase}
  .award-identity small,.award-team small{color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
  .team-link{padding:0;border:0;color:var(--accent);background:none;font:800 .72rem Inter,Arial,sans-serif;text-align:left;text-transform:uppercase;cursor:pointer}
  .team-link:hover{text-decoration:underline}
  .team-link.big{font:900 2.1rem 'Arial Narrow',Impact,sans-serif;color:var(--text);text-transform:uppercase;line-height:1}
  .award-rating{display:grid;justify-items:end;padding:10px 12px;border-left:3px solid var(--accent);background:var(--surface-2)}
  .award-rating small{color:var(--muted);font-size:.55rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
  .award-rating b{font-size:2.6rem;line-height:.85;color:var(--accent)}
  .award-numbers{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:14px}
  .award-numbers.two{grid-template-columns:repeat(2,1fr)}
  .award-numbers span{padding:9px 8px;border:1px solid var(--line);background:rgb(0 0 0 / 8%)}
  .award-numbers small,.award-numbers b{display:block}
  .award-numbers small{color:var(--muted);font-size:.52rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
  .award-numbers b{margin-top:4px;font-size:1.05rem}
  .team-card-award{display:grid;align-content:start;gap:12px}
  .award-team{display:grid;gap:3px;margin-top:2px}
  .awards-minis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .award-mini{display:grid;gap:3px;padding:14px;border:1px solid var(--line);background:var(--surface)}
  .award-mini strong{font-size:1.5rem;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .award-mini small{color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
  .award-mini b{margin-top:6px;color:var(--accent);font-size:1.3rem}
  .award-mini i{color:var(--muted);font:800 .55rem Inter,Arial,sans-serif;letter-spacing:.1em}
  .awards-columns{display:grid;gap:12px}
  .award-list{padding:14px;border:1px solid var(--line);background:var(--surface);min-width:0}
  .award-list ol{display:grid;gap:4px;margin:10px 0 0;padding:0;list-style:none}
  .award-list li{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);background:var(--surface-2)}
  .award-list li.is-mvp{border-color:color-mix(in srgb,var(--accent) 60%,var(--line))}
  .award-list .rank{display:grid;place-items:center;width:26px;height:26px;border:1px solid var(--line);color:var(--muted);font:900 .75rem Inter,Arial,sans-serif}
  .award-list li.is-mvp .rank{border-color:var(--accent);color:var(--accent)}
  .award-list .who{display:grid;min-width:0}
  .award-list .who strong{font-size:1.05rem;line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .award-list .who small{color:var(--muted);font-size:.56rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .award-list .line{display:grid;justify-items:end;font-size:.78rem}
  .award-list .line small{color:var(--muted);font-size:.5rem;font-weight:800;letter-spacing:.08em}
  .award-list li>b{min-width:44px;font-size:1.3rem;text-align:right}
  .team-table-wrap{margin-top:10px;overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:.74rem}
  th{padding:6px 8px;border-bottom:1px solid var(--line);color:var(--muted);font-size:.52rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;text-align:right;white-space:nowrap}
  td{padding:8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
  th.left,td.left{text-align:left}
  td.placement{color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
  td b{font-size:.95rem}
  tr.is-user td{background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--accent)}
  tr.is-user .team-link{color:var(--accent)}
  .is-user.award-card,.is-user.award-mini,li.is-user{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent)}
  li.is-user .who strong,li.is-user>b{color:var(--accent)}
  @media (min-width:680px){.awards-hero{grid-template-columns:1.5fr 1fr}.awards-columns{grid-template-columns:1fr 1.15fr}}
  @media (max-width:679px){.award-player{grid-template-columns:auto 1fr}.award-rating{grid-column:1/-1;justify-items:start}.award-numbers{grid-template-columns:repeat(2,1fr)}.awards-minis{grid-template-columns:1fr}.award-identity h2,.team-link.big{font-size:1.7rem}.mvp-card::after{font-size:4.5rem}}
</style>
