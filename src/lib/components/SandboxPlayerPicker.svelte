<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import { players, teamById } from '$lib/game/data';
  import { getEligibleSlotRoles, getRoleLabel } from '$lib/game/roleRules';
  import { chooseSandboxSlotRole, previewSandboxLineupPower } from '$lib/game/sandbox/lineup';
  import type { LineupSlotRole, OrgStyle, Player, SelectedPlayer } from '$lib/game/types';

  export let open = false;
  export let slotIndex = 0;
  export let currentRole: LineupSlotRole | null = null;
  export let picks: SelectedPlayer[] = [];
  export let style: OrgStyle = 'balanced';
  export let organizationId = '';
  export let onPick: (player: Player, role: LineupSlotRole) => void = () => {};
  export let onClose: () => void = () => {};

  const roles: LineupSlotRole[] = ['igl', 'awper', 'entry', 'lurker', 'support', 'rifler'];
  const sortOptions = [
    { value: 'overall', label: 'Overall' },
    { value: 'year', label: 'Época' },
    { value: 'name', label: 'Nome' }
  ];
  const RESULT_LIMIT = 60;

  let search = '';
  let roleFilter: LineupSlotRole | '' = '';
  let yearFilter: number | null = null;
  let sort: 'overall' | 'year' | 'name' = 'overall';
  let searchInput: HTMLInputElement | null = null;
  let wasOpen = false;

  const originYear = (player: Player) => (player.teamId ? teamById.get(player.teamId)?.year : null) ?? player.year ?? null;
  const years = [...new Set(players.map(originYear).filter((year): year is number => typeof year === 'number'))].sort((a, b) => a - b);

  $: currentPower = previewSandboxLineupPower(picks, style, organizationId).power;
  $: selectedIds = new Set(picks.map((pick) => pick.playerId));
  $: query = search.trim().toLowerCase();
  $: filtered = players
    .filter((player) => !roleFilter || getEligibleSlotRoles(player).includes(roleFilter))
    .filter((player) => yearFilter === null || originYear(player) === yearFilter)
    .filter((player) => {
      if (!query) return true;
      const team = player.teamId ? teamById.get(player.teamId) : null;
      return `${player.nickname ?? ''} ${team?.name ?? ''} ${originYear(player) ?? ''} ${player.role ?? ''}`.toLowerCase().includes(query);
    })
    .sort((left, right) =>
      sort === 'name'
        ? (left.nickname ?? '').localeCompare(right.nickname ?? '') || (originYear(right) ?? 0) - (originYear(left) ?? 0)
        : sort === 'year'
          ? (originYear(right) ?? 0) - (originYear(left) ?? 0) || (right.overall ?? 0) - (left.overall ?? 0)
          : (right.overall ?? 0) - (left.overall ?? 0) || left.id.localeCompare(right.id)
    );
  $: results = filtered.slice(0, RESULT_LIMIT).map((player) => {
    const role = chooseSandboxSlotRole(player, currentRole);
    const nextPicks = picks.length > slotIndex
      ? picks.map((pick, index) => index === slotIndex ? { playerId: player.id, selectedSlotRole: role } : pick)
      : [...picks, { playerId: player.id, selectedSlotRole: role }];
    const delta = Math.round((previewSandboxLineupPower(nextPicks, style, organizationId).power - currentPower) * 10) / 10;
    return { player, role, delta, eligible: getEligibleSlotRoles(player), year: originYear(player), team: player.teamId ? teamById.get(player.teamId) : null };
  });

  $: if (open !== wasOpen) {
    wasOpen = open;
    if (typeof document !== 'undefined') document.body.classList.toggle('modal-open', open);
    if (open) void tick().then(() => searchInput?.focus());
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }

  const formatDelta = (delta: number) => (delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1));

  onDestroy(() => {
    if (typeof document !== 'undefined') document.body.classList.remove('modal-open');
  });
</script>

<svelte:window on:keydown={open ? handleKeydown : undefined} />

{#if open}
  <div class="picker-backdrop" role="presentation" on:click={onClose}>
    <div class="player-picker" role="dialog" aria-modal="true" aria-labelledby="sandbox-picker-title" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation={handleKeydown}>
      <header>
        <div><span class="eyebrow">SANDBOX · SLOT {slotIndex + 1}{currentRole ? ` · ${getRoleLabel(currentRole).toUpperCase()}` : ''}</span><h2 id="sandbox-picker-title">Trocar jogador</h2></div>
        <div class="picker-power"><small>PODER ATUAL</small><b>{currentPower.toFixed(1)}</b></div>
        <button class="close" type="button" on:click={onClose} aria-label="Fechar">×</button>
      </header>

      <div class="picker-tools">
        <label class="picker-search"><span>Buscar jogador ou time</span><input bind:this={searchInput} bind:value={search} placeholder="s1mple, Astralis, 2018…" autocomplete="off" /></label>
        <div class="control-group"><span>Ordenar</span><SegmentedControl value={sort} options={sortOptions} label="Ordenação" onChange={(value) => sort = value as typeof sort} /></div>
      </div>

      <div class="picker-filters">
        <nav aria-label="Função">
          <button type="button" class:active={!roleFilter} on:click={() => roleFilter = ''}>Todas</button>
          {#each roles as role}<button type="button" class:active={roleFilter === role} on:click={() => roleFilter = roleFilter === role ? '' : role}>{getRoleLabel(role)}</button>{/each}
        </nav>
        <nav aria-label="Época">
          <button type="button" class:active={yearFilter === null} on:click={() => yearFilter = null}>Todas as épocas</button>
          {#each years as year}<button type="button" class:active={yearFilter === year} on:click={() => yearFilter = yearFilter === year ? null : year}>{year}</button>{/each}
        </nav>
      </div>

      <p class="picker-count"><span>{filtered.length} jogador{filtered.length === 1 ? '' : 'es'}</span>{#if filtered.length > RESULT_LIMIT}<small>mostrando os {RESULT_LIMIT} primeiros — refine a busca</small>{/if}</p>

      <div class="picker-results">
        {#each results as entry (entry.player.id)}
          <article class:in-lineup={selectedIds.has(entry.player.id)}>
            <div class="identity">
              <span class="avatar">{(entry.player.nickname ?? '?').slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{entry.player.nickname}</strong>
                <small>{entry.team?.name ?? '—'} · {entry.year ?? '—'}{entry.player.rarity ? ` · ${entry.player.rarity}` : ''}</small>
              </div>
              <div class="numbers">
                <b>{entry.player.overall ?? 70}</b>
                <i class:up={entry.delta > 0} class:down={entry.delta < 0} title="Variação de poder ao escalar na função sugerida">{formatDelta(entry.delta)}</i>
              </div>
            </div>
            <div class="role-actions">
              {#each roles as role}
                <button type="button" class:eligible={entry.eligible.includes(role)} class:suggested={entry.role === role} on:click={() => onPick(entry.player, role)} title={entry.eligible.includes(role) ? 'Função natural' : 'Fora da função natural'}>{getRoleLabel(role)}</button>
              {/each}
            </div>
            {#if selectedIds.has(entry.player.id)}<span class="in-lineup-tag">JÁ NA LINE</span>{/if}
          </article>
        {:else}<p class="empty">Nenhum jogador encontrado.</p>{/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .picker-backdrop{position:fixed;z-index:150;inset:0;display:grid;place-items:center;padding:18px;background:rgb(2 4 6 / 84%);backdrop-filter:blur(9px)}
  .player-picker{display:grid;grid-template-rows:auto auto auto auto minmax(0,1fr);width:min(980px,100%);max-height:90dvh;border:1px solid var(--accent);background:var(--surface);box-shadow:0 28px 90px rgb(0 0 0 / 60%);overflow:hidden;animation:sheetUp .22s ease-out}
  .player-picker>header{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid var(--line)}
  h2{margin:4px 0 0;font-size:clamp(1.7rem,5vw,2.8rem)}
  .picker-power{display:grid;justify-items:end;gap:2px}.picker-power small{color:var(--muted);font-size:.52rem;font-weight:900;letter-spacing:.12em}.picker-power b{color:var(--accent);font-size:1.7rem;line-height:1}
  .close{width:42px;height:42px;border:1px solid var(--line);color:var(--text);background:var(--surface-2);font-size:1.5rem;cursor:pointer}
  .picker-tools{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:10px;padding:12px 20px 8px}
  label{display:grid;gap:6px}label span{color:var(--muted);font-size:.58rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
  input{min-height:44px;padding:0 11px;border:1px solid var(--line);color:var(--text);background:var(--surface-2)}
  .picker-filters{display:grid;gap:6px;padding:4px 20px 10px}
  nav{display:flex;gap:5px;overflow-x:auto;scrollbar-width:thin;padding-bottom:2px}
  nav button{flex:0 0 auto;min-height:32px;padding:0 10px;border:1px solid var(--line);color:var(--muted);background:var(--surface-2);font-size:.62rem;font-weight:800;text-transform:uppercase;white-space:nowrap;cursor:pointer;transition:.15s ease}
  nav button.active{border-color:var(--accent);color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--surface))}
  .picker-count{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0;padding:6px 20px;border-block:1px solid var(--line);color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.picker-count small{font-weight:600;letter-spacing:0;text-transform:none}
  .picker-results{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 20px 20px;overflow-y:auto;overscroll-behavior:contain}
  .picker-results article{position:relative;padding:12px;border:1px solid var(--line);background:var(--surface-2);transition:border-color .15s ease}.picker-results article:hover{border-color:color-mix(in srgb,var(--accent) 55%,var(--line))}
  .picker-results article.in-lineup{border-style:dashed}
  .identity{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px}
  .avatar{display:grid;place-items:center;width:42px;height:42px;color:#0b0e09;background:var(--accent);font-weight:900}
  .identity strong,.identity small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity small{color:var(--muted);font-size:.62rem}
  .numbers{display:grid;justify-items:end;gap:2px}.numbers b{font-size:1.6rem;line-height:1}.numbers i{min-width:44px;padding:2px 6px;border:1px solid var(--line);color:var(--muted);font-size:.58rem;font-style:normal;font-weight:900;text-align:center}.numbers i.up{border-color:var(--accent);color:var(--accent)}.numbers i.down{border-color:var(--danger);color:var(--danger)}
  .role-actions{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;margin-top:10px}
  .role-actions button{min-height:34px;padding:0 4px;border:1px dashed var(--line);color:var(--muted);background:transparent;font-size:.56rem;font-weight:800;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;transition:.15s ease}
  .role-actions button.eligible{border-style:solid;border-color:color-mix(in srgb,var(--accent) 55%,var(--line));color:var(--text)}
  .role-actions button.suggested{border-color:var(--accent);color:#0b0e09;background:var(--accent)}
  .role-actions button:hover{border-color:var(--accent)}
  .in-lineup-tag{position:absolute;right:-1px;top:-1px;padding:3px 7px;background:var(--line);color:var(--text);font-size:.48rem;font-weight:900;letter-spacing:.08em}
  .empty{grid-column:1/-1;color:var(--muted);text-align:center}
  @media(max-width:679px){.picker-backdrop{place-items:end center;padding:0}.player-picker{max-height:94dvh;border-inline:0;border-bottom:0}.player-picker>header{grid-template-columns:minmax(0,1fr) auto;padding:12px}.picker-power{display:none}.picker-tools,.picker-results{grid-template-columns:1fr}.picker-tools,.picker-filters,.picker-count,.picker-results{padding-inline:12px}.role-actions{grid-template-columns:repeat(3,minmax(0,1fr))}.role-actions button{min-height:40px;font-size:.6rem}}
</style>
