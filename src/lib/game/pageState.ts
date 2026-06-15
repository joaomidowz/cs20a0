import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import type { Language, Theme } from '$lib/game/types';

const langKey = 'cs13a0:language';
const themeKey = 'cs13a0:theme';

function loadLanguage(): Language {
  if (!browser) return 'pt-BR';
  const stored = localStorage.getItem(langKey);
  if (stored === 'pt-BR' || stored === 'es' || stored === 'en') return stored;
  return 'pt-BR';
}

function loadTheme(): Theme {
  if (!browser) return 'dark';
  const stored = localStorage.getItem(themeKey);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

export const language = writable<Language>(loadLanguage());
export const theme = writable<Theme>(loadTheme());

if (browser) {
  language.subscribe((value) => {
    localStorage.setItem(langKey, value);
    document.documentElement.lang = value;
  });
  theme.subscribe((value) => {
    localStorage.setItem(themeKey, value);
    document.documentElement.dataset.theme = value;
  });
}
