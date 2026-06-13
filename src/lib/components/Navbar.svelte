<script lang="ts">
  import type { Language, Theme } from '$lib/game/types';

  export let language: Language;
  export let theme: Theme;
  export let onLanguage: (language: Language) => void;
  export let onTheme: () => void;
</script>

<nav class="nav shell" aria-label="Navegação principal">
  <a class="brand" href="/">
    <span class="brand-mark">CS</span><span>20a0</span>
  </a>
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
