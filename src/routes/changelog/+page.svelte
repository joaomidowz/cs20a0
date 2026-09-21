<script lang="ts">
  import PageLayout from '$lib/components/PageLayout.svelte';
  import { language, theme } from '$lib/game/pageState';
  import changelog from '$lib/data/changelog.json';

  /** As notas agrupadas por versão, da mais nova para a mais antiga. */
  const releases = changelog.entries.reduce<Array<{ version: string; date: string; notes: typeof changelog.entries }>>((list, entry) => {
    const current = list[list.length - 1];
    if (current && current.version === entry.version) current.notes.push(entry);
    else list.push({ version: entry.version, date: entry.date, notes: [entry] });
    return list;
  }, []);
</script>

<svelte:head>
  <title>Novidades · cs13a0</title>
  <meta name="description" content="Tudo o que mudou no cs13a0, versão por versão." />
</svelte:head>

<PageLayout
  language={$language}
  theme={$theme}
  onLanguage={(value) => $language = value}
  onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}
  onlineNavigation={false}
>
  <header class="changelog-head">
    <span class="eyebrow">NOVIDADES</span>
    <h1>O que mudou</h1>
    <p>O jogo está na versão <strong>{changelog.version}</strong>. Cada dez mudanças no código avançam um décimo.</p>
  </header>

  {#each releases as release (release.version + release.date)}
    <section class="release">
      <div class="release-head">
        <strong>v{release.version}</strong>
        <time datetime={release.date}>{release.date.split('-').reverse().join('/')}</time>
      </div>
      <ul>
        {#each release.notes as note (note.hash)}
          <li>
            <b>{note.title}</b>
            {#if note.summary}<span>{note.summary}</span>{/if}
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  <p class="foot">Mostrando as {changelog.entries.length} mudanças mais recentes de {changelog.total}.</p>
</PageLayout>

<style>
  .changelog-head { margin-bottom: 28px; }
  .changelog-head h1 { margin: 6px 0 8px; font-size: clamp(2rem, 6vw, 3rem); }
  .changelog-head p { margin: 0; color: var(--muted); }
  .changelog-head strong { color: var(--accent); }
  .release { margin-bottom: 26px; }
  .release-head { display: flex; align-items: baseline; gap: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
  .release-head strong { color: var(--accent); font: 900 1.35rem/1 'Arial Narrow', Impact, sans-serif; }
  .release-head time { color: var(--muted); font-size: .78rem; }
  ul { display: grid; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
  li { display: grid; gap: 3px; padding: 10px 12px; border-left: 2px solid var(--line); background: var(--surface-2); }
  li b { font-size: .95rem; }
  li span { color: var(--muted); font-size: .82rem; line-height: 1.5; }
  .foot { margin-top: 18px; color: var(--muted); font-size: .78rem; }
</style>
