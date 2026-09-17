# Bandeiras

Os SVGs desta pasta vêm do pacote [flag-icons](https://github.com/lipis/flag-icons) (licença MIT, ver `LICENSE` ao lado), versão fixada no `package.json`.

Não edite à mão: `npm run sync:flags` copia de `node_modules/flag-icons/flags/4x3/` apenas os códigos usados em `src/lib/data/cs/identities.game.json` (mais os passados em `--extra=br,dk`), remove os que sobraram e atualiza a `LICENSE`. Com as identidades vazias, a pasta contém só este arquivo e a licença.

Os componentes carregam cada bandeira por `/flags/<código>.svg` (`src/lib/components/CountryFlag.svelte`).
