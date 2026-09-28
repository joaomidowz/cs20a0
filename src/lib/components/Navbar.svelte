<script lang="ts">
  import type { Language, Theme } from '$lib/game/types';
  import changelog from '$lib/data/changelog.json';

  export let language: Language;
  export let theme: Theme;
  export let onLanguage: (language: Language) => void;
  export let onTheme: () => void;
  export let onHome: () => void;
</script>

<nav class="nav shell" aria-label="Navegação principal">
  <a class="brand" href="/" on:click|preventDefault={onHome}>
    <picture class="brand-picture">
      <source media="(max-width: 679px)" srcset="/brand/cs13a0-mark.png" />
      <img class="brand-image" src="/brand/cs13a0-wordmark.png" alt="cs13a0" />
    </picture>
  </a>
  <!-- A versao sai do historico (`scripts/build-changelog.mjs`): dez mudancas no codigo valem um decimo. -->
  <a class="version" href="/changelog" title="Ver o que mudou">v{changelog.version}</a>
  <div class="nav-actions">
    <label class="sr-only" for="language">Idioma</label>
    <select id="language" value={language} on:change={(event) => onLanguage((event.currentTarget as HTMLSelectElement).value as Language)}>
      <option value="pt-BR">PT-BR</option>
      <option value="es">ES</option>
      <option value="en">EN</option>
    </select>
    <button class="icon-button" type="button" on:click={onTheme} aria-label="Alternar tema">
      {theme === 'dark' ? 'LIGHT' : 'DARK'}
    </button>
  </div>
</nav>

<style>
  .brand-picture { display: block; width: 142px; line-height: 0; }
  .brand-image { display: block; width: 100%; height: auto; }
  @media (max-width: 679px) { .brand-picture { width: 40px; } }
</style>