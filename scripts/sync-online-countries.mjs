// scripts/sync-online-countries.mjs
// O online não pode importar identities.game.json (guarda do catálogo), mas a coleção mostra a bandeira do jogador.
// Este script copia só o mapa baseId → país para um módulo dentro do limite do online. Uso: npm run sync:countries
import { readFileSync, writeFileSync } from 'node:fs';

/** @param {{ players?: Record<string, { country?: string | null }> }} identities */
export function buildCountriesModule(identities) {
  const entries = Object.entries(identities.players ?? {})
    .filter(([, value]) => typeof value?.country === 'string' && /^[a-z]{2}(-[a-z]{2,3})?$/.test(value.country))
    .sort(([left], [right]) => left.localeCompare(right));
  const body = entries.map(([baseId, value]) => `  ${JSON.stringify(baseId)}: ${JSON.stringify(value.country)}`).join(',\n');
  return `// GERADO por scripts/sync-online-countries.mjs a partir de identities.game.json. Não editar à mão.\n/** País (código flag-icons) por baseId de jogador, para as telas da coleção. */\nexport const PLAYER_COUNTRIES: Readonly<Record<string, string>> = {\n${body}\n};\n\nexport const playerCountryOf = (player: { baseId?: string | null; id: string }): string | null =>\n  PLAYER_COUNTRIES[player.baseId ?? player.id.replace(/-\\d{4}$/, '')] ?? null;\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const identities = JSON.parse(readFileSync('src/lib/data/cs/identities.game.json', 'utf8'));
  writeFileSync('src/lib/game/online/collection-countries.ts', buildCountriesModule(identities));
  console.log('collection-countries.ts atualizado');
}
