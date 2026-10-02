<script lang="ts">
  import { translate } from '$lib/game/i18n';
  import { BUY_LABELS, ENDING_LABELS, SIDE_LABELS, WEAPON_LABELS, getRoundTagLabel } from '$lib/game/roundPresentation';
  import { KILL_FLAG_ICONS, KILL_FLAG_LABELS, killFlags } from '$lib/game/killfeedIcons';
  import { WEAPON_ICONS } from '$lib/game/sandbox/weaponIcons';
  import type { Language } from '$lib/game/types';
  import type { RoundInspection } from './round-inspection';

  export let inspection: RoundInspection;
  export let userIsA: boolean | null = null;
  export let language: Language = 'pt-BR';
  export let teamNames: { a: string; b: string } = { a: 'A', b: 'B' };

  $: buyLabels = BUY_LABELS[language];
  $: sideLabels = SIDE_LABELS[language];
  $: endingLabels = ENDING_LABELS[language];
  $: killsLabel = language === 'en' ? 'Kills' : language === 'es' ? 'Bajas' : 'Abates';
  $: noKillsLabel = language === 'en' ? 'No kills recorded.' : language === 'es' ? 'Sin bajas registradas.' : 'Sem abates registrados.';
  $: timeoutLabel = language === 'en' ? 'Tactical timeout' : language === 'es' ? 'Pausa táctica' : 'Pausa tática';
  $: isMine = (side: 'a' | 'b') => userIsA !== null && (side === 'a') === userIsA;
</script>

<header class="round-detail-header">
  <div>
    <span>R{inspection.number}{#if inspection.overtime} · OT{/if}</span>
    <strong class:mine={isMine(inspection.winner)}>{teamNames[inspection.winner]}</strong>
    {#if inspection.detail}<small>{endingLabels[inspection.detail.ending]}</small>{/if}
  </div>
  <b>{inspection.score.a} : {inspection.score.b}</b>
</header>

{#if inspection.detail}
  {@const detail = inspection.detail}
  <div class="round-detail-economy">
    <span class:mine={isMine('a')}>{teamNames.a} · {sideLabels[detail.sideA]} · {buyLabels[detail.economy.a.buy]} · ${detail.economy.a.money}{#if detail.economy.a.awp} · AWP{/if}</span>
    <span class:mine={isMine('b')}>{teamNames.b} · {sideLabels[detail.sideA === 'ct' ? 't' : 'ct']} · {buyLabels[detail.economy.b.buy]} · ${detail.economy.b.money}{#if detail.economy.b.awp} · AWP{/if}</span>
  </div>
  {#if detail.tags.length || detail.timeout}
    <div class="round-detail-tags">
      {#each detail.tags as tag (tag)}<i>{getRoundTagLabel(language, tag)}</i>{/each}
      {#if detail.timeout}<i class="timeout">{timeoutLabel} · {teamNames[detail.timeout]}{#if detail.timeoutTiming} · {translate(language, detail.timeoutTiming === 'window' ? 'timeoutWindow' : detail.timeoutTiming === 'early' ? 'timeoutEarly' : 'timeoutLate')}{/if}</i>{/if}
    </div>
  {/if}
  <div class="round-detail-kills">
    <span>{killsLabel} · {detail.kills.length}</span>
    {#if detail.kills.length}
      <ol>
        {#each detail.kills as kill, index (index)}
          <li>
            <b class:mine={isMine(kill.killerSide)}>{kill.killerName}</b>
            {#if kill.assistName}<span class="assist" title={KILL_FLAG_LABELS[language].assist}><i class="flag">{@html KILL_FLAG_ICONS.assist}</i>{kill.assistName}</span>{/if}
            {#if kill.flashAssistName}<span class="assist" title={KILL_FLAG_LABELS[language].flashAssist}><i class="flag">{@html KILL_FLAG_ICONS.flashAssist}</i>{kill.flashAssistName}</span>{/if}
            <em class="weapon" role="img" aria-label={WEAPON_LABELS[kill.weapon]} title={WEAPON_LABELS[kill.weapon]}>{@html WEAPON_ICONS[kill.weapon]}</em>
            {#each killFlags(kill) as flag (flag)}<i class="flag" class:hs={flag === 'headshot'} role="img" aria-label={KILL_FLAG_LABELS[language][flag]} title={KILL_FLAG_LABELS[language][flag]}>{@html KILL_FLAG_ICONS[flag]}</i>{/each}
            <span class="victim">{kill.victimName}</span>
            <small>{kill.second}s</small>
          </li>
        {/each}
      </ol>
    {:else}<p>{noKillsLabel}</p>{/if}
  </div>
{/if}

<style>
  .round-detail-header{display:flex;align-items:end;justify-content:space-between;gap:12px}.round-detail-header div{display:grid;gap:3px;min-width:0}.round-detail-header div>span{color:var(--accent);font-size:.68rem;font-weight:800;letter-spacing:.12em}.round-detail-header strong{overflow:hidden;font-size:1.1rem;text-overflow:ellipsis;text-transform:uppercase;white-space:nowrap}.round-detail-header strong.mine{color:var(--accent)}.round-detail-header small{color:var(--muted);font-size:.7rem;text-transform:uppercase}.round-detail-header>b{font:900 1.5rem 'Arial Narrow',Impact,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}
  .round-detail-economy{display:grid;gap:5px;color:var(--muted);font-size:.7rem;font-weight:700;line-height:1.35;text-transform:uppercase}.round-detail-economy .mine{color:var(--text)}
  .round-detail-tags{display:flex;flex-wrap:wrap;gap:5px}.round-detail-tags i{padding:4px 7px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--line));color:var(--accent);font-size:.68rem;font-style:normal;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.round-detail-tags i.timeout{border-color:color-mix(in srgb,var(--accent-2) 55%,var(--line));color:var(--accent-2)}
  .round-detail-kills{display:grid;gap:7px}.round-detail-kills>span{color:var(--accent);font-size:.68rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.round-detail-kills ol{display:grid;gap:4px;margin:0;padding:0;list-style:none}.round-detail-kills li{display:flex;flex-wrap:wrap;align-items:center;gap:7px;min-height:28px;font-size:.75rem}.round-detail-kills b{font-weight:800}.round-detail-kills b.mine{color:var(--accent)}.round-detail-kills em{display:inline-flex;align-items:center;font-style:normal;opacity:.85}.round-detail-kills em :global(svg){width:30px;height:13px}.round-detail-kills .flag{display:inline-flex;width:14px;height:14px;color:var(--text);opacity:.85}.round-detail-kills .flag :global(svg){width:100%;height:100%}.round-detail-kills .flag.hs{color:var(--danger);opacity:1}.round-detail-kills .assist{display:inline-flex;align-items:center;gap:3px;color:var(--muted);font-size:.7rem}.round-detail-kills .assist .flag{width:12px;height:12px;opacity:.7}.round-detail-kills .victim{color:var(--muted)}.round-detail-kills small{margin-left:auto;color:var(--muted);font-size:.68rem;font-variant-numeric:tabular-nums}.round-detail-kills p{margin:0;color:var(--muted);font-size:.75rem}
</style>
