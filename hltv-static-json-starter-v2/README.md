# HLTV Static JSON Starter v2

Base estática para um simulador/draft estilo roguelike de CS: 11 anos, top 5 por ano, 55 times e 275 player-year rows.

## O que melhorou na v2

- `years.input.json` já vem com 2016–2026; 2026 usa o snapshot parcial de 8 de junho.
- `teams.seed.json` já vem com 55 times e 5 jogadores por time.
- `player-overrides.json` aceita tanto IDs por era (`ropz-2025`) quanto IDs-base (`ropz`) aplicados a todas as eras.
- `player-ids.manual.json` tenta preencher `hltvPlayerId` para gerar `statsUrl` por jogador/ano.
- `player-overrides.json` sobrescreve cartas lendárias: coldzera, FalleN, fer, fnx, s1mple, ZywOo, donk, m0NESY, NiKo, device, gla1ve etc.
- O cálculo de `overall` agora é por função. Rifler não é mais penalizado por ter `awp` e `igl` baixos.
- `collect:ranking` não quebra mais o processo quando recebe HTTP 403; ele só avisa e deixa o fallback do seed funcionar.
- `validate:data` deriva as contagens esperadas da configuração anual.

## Instalação

```bash
npm install
npm run build:data
```

Saída esperada:

```txt
[ok] data/raw/teams.raw.json (30 teams)
[ok] data/raw/players.input.json (275 player-year rows)
[ok] generated 55 teams and 275 player-year rows
[ok] validation passed: 55 teams, 275 player-year rows
```

Os arquivos finais ficam em:

```txt
src/lib/data/cs/players.game.json
src/lib/data/cs/teams.game.json
```

No Svelte/SvelteKit:

```ts
import players from '$lib/data/cs/players.game.json';
import teams from '$lib/data/cs/teams.game.json';
```

## Arquivos principais

```txt
data/input/years.input.json          anos 2016–2026
data/input/teams.seed.json           top 5 por ano com rosters curados
data/input/player-ids.manual.json    ids HLTV para gerar statsUrl
data/input/player-overrides.json     buffs/nerfs manuais e títulos
scripts/generate-game-data.ts        fórmula de overall por função
```

## Sobre 2023

2023 foi ano misto entre CS:GO e CS2. Por isso o projeto usa `game: "MIXED"` e não força `csVersion` na URL anual de stats. Para anos 2016–2022, usa CSGO; para 2024–2025, usa CS2.

## Sobre coleta HLTV

Os scripts de coleta são opcionais e locais. A base funciona só com seeds/overrides.

```bash
npm run collect:ranking
npm run collect:player-pages
```

Se o site retornar 403/captcha/bloqueio, o script apenas pula. Não tente burlar proteção, captcha ou controle de acesso. Para jogo público/comercial, use curadoria própria/licença/fonte autorizada.

## Como editar uma carta

Edite `data/input/player-overrides.json`. Exemplo:

```json
{
  "coldzera-2016": {
    "title": "Brazilian GOAT",
    "rarity": "goat",
    "overall": 98,
    "traits": ["brazilianGoat", "clutchGod", "majorAura"]
  }
}
```

O perfil visual também pode ser ajustado por carta sem alterar a fórmula:

```json
{
  "ropz-2023": {
    "playstyle": "tactical"
  }
}
```

Valores aceitos: `aggressive`, `balanced` e `tactical`. Sem override, o app mantém o cálculo automático pelos atributos.

Depois rode:

```bash
npm run build:data
```

## Escala sugerida

```txt
80–84 = bom jogador tier 1
85–89 = elite de time top
90–94 = estrela / top 20
95–97 = superstar histórico
98–99 = temporada lendária / GOAT
100 = modo especial ou carta única
```
