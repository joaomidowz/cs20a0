# Sinergia temática da coleção — design

Data: 2026-09-20.
Esta spec cobre a sinergia de line por **time, país e ano** no modo coleção. Entrega em commits separados
(`feat: …`), sem push e sem deploy.

## Objetivo

Dar motivo para montar line temática — reunir um time histórico, uma line de um país, uma geração de um ano —
em vez de só empilhar as cartas mais caras.

### O problema que isso ataca

Hoje a coleção não tem sinergia nenhuma de identidade: país só desenha a bandeira, ano e time não entram em
conta alguma. A única afinidade existente é a do coach (`coachAffinity`, `src/lib/game/dynasty/coach.ts`).

Pior: `calculateUserTeamPower` trava em `MAX_TEAM_POWER` (106) **antes** da sinergia, e de overall ~92 para cima
todo time bate nesse teto. Medido em 2026-09-20:

| Line | Custo | Poder |
|---|---|---|
| 4 GOATs + 1 Lenda (FalleN, coldzera, s1mple, donk, jL) | 465.000 coins | 129,85 |
| 5 Lendas (Zeus, s1mple 96, rain, electroNic, tarik) | 146.000 coins | 128,79 |

Os 320.000 coins a mais compram 1 ponto. A sinergia temática é multiplicada **depois** do teto, então ela é hoje
a única forma de diferenciar times no topo. Ela não resolve o travamento — isso é trabalho à parte, ainda em
aberto — mas dá uma saída enquanto ele existir.

## Regra

Três linhas novas, cada uma limitada a **+2% de poder**, somando no máximo **+6%**.

### A escada

Premia fechar o tema: o último integrante vale mais que os anteriores juntos.

| Compartilham | Time e ano | País |
|---|---|---|
| 2 | +0,25% | +0,25% |
| 3 | +0,5% | +0,5% |
| 4 | +1% | +1% |
| 5 | +1,5% | **+2%** |
| 6 (com o coach) | +2% | — |

São duas escadas porque o coach não entra em país: a linha fecha com quem pode fechá-la. Em time e ano o
sexto integrante é o coach; em país é o quinto jogador. As duas chegam ao mesmo +2%.

Vale sempre o **maior grupo** da line: 3 brasileiros e 2 dinamarqueses contam como 3, nunca como 5.

### As três linhas

| Linha | Nível cheio | Nível metade |
|---|---|---|
| `theme_team` | mesmo time-ano (`teamId` igual, ex.: `sk-2017`) | mesma organização em outro ano (Astralis 2016 + Astralis 2019) |
| `theme_country` | mesmo país (`country` igual) | mesmo bloco da cena |
| `theme_year` | mesmo `year` | — |

Em time e país conta o **melhor dos dois níveis**, nunca a soma. O nível metade é o valor da escada dividido
por 2 (uma line de 5 do mesmo bloco vale +1%, não +2%).

O teto de +2% é por linha e o de +6% é no total; ambos são aplicados depois da soma.

### O coach

Entra como **6º integrante** em `theme_team` e `theme_year` — é ele quem fecha a escada em 6 e destrava o +2%.

Fica **fora** de `theme_country`: o coach tem `teamId` e `year` em 100% das cartas, mas país em só 41 de 307
(13%), e uma linha que depende de qual coach você tirou seria injusta. Em país a escada fecha em 5 = +2%.

O coach **mantém** `coachAffinity` por cima, inalterada. Uma line temática perfeita com o coach certo chega a
+7,5% (+6% de tema, +1,5% de afinidade). Decisão consciente: é o prêmio máximo do modo.

## Blocos da cena

Os 52 países do pool, sem sobra. Contagem por jogador distinto (`baseId`), depois do preenchimento dos 15
países faltantes descrito abaixo.

| Bloco | Jogadores | Países |
|---|---|---|
| CIS | 108 | `ru` `ua` `kz` `by` `uz` `az` |
| Nórdicos | 94 | `dk` `se` `fi` `no` |
| Brasil/LatAm | 71 | `br` `ar` `uy` `cl` `gt` |
| Europa Ocidental | 67 | `fr` `de` `gb` `es` `pt` `nl` `be` `ch` |
| Europa Central/Leste | 67 | `pl` `cz` `sk` `hu` `ro` `bg` `lt` `lv` `ee` `xk` `mk` `ba` `rs` `me` |
| Ásia/Oceania | 65 | `cn` `mn` `au` `nz` `in` `id` `hk` `my` `tw` |
| América do Norte | 50 | `us` `ca` |
| MENA/África | 20 | `tr` `il` `jo` `za` |

Total: 542 de 542 jogadores.

O bloco existe para o caso de line russófona: donk (`ru`) e s1mple (`ua`) jogam juntos e hoje contariam como
países diferentes. A NAVI 2021 (3 `ru` + 2 `ua`) sai de +0,5% (país exato, 3 iguais) para +1% (bloco, 5 iguais).

## Dados

### Países faltantes

15 jogadores estavam sem país em `identities.game.json`, incluindo cartas que quebram temas conhecidos —
sem Magisk a Astralis 2018 nunca fecha os cinco dinamarqueses. Todos confirmados em 2026-09-20:

| baseId | Jogador | País |
|---|---|---|
| `magisk` | Magisk | `dk` |
| `adren` | AdreN (Dauren Kystaubayev) | `kz` |
| `zeus` | Zeus | `ua` |
| `scream` | ScreaM | `be` |
| `steel` | steel | `br` |
| `amanek` | amanek | `fr` |
| `fox` | fox | `pt` |
| `znajder` | znajder | `se` |
| `adren-liquid` | adreN (Dan Gustaferro) | `us` |
| `matys` | MATYS (Matúš Šimko) | `sk` |
| `lucky` | Lucky (Lucas Chastang) | `fr` |
| `fear` | fEAR | `ua` |
| `tiger` | Tiger (Junbing Zhen) | `cn` |
| `z4kr` | z4KR | `cn` |
| `sonic` | Sonic (Aran Grobler) | `za` |

`adren` e `adren-liquid` são **pessoas diferentes** com nome quase igual (cazaque e americano); cada uma tem a
sua entrada.

Nenhum código novo de país aparece: os 15 caem em blocos que já existem.

### Guarda do catálogo — nada a fazer

`tests/catalogGuards.test.ts` proíbe o online de importar `identities.game.json`, mas **o problema já está
resolvido no projeto**: `scripts/sync-online-countries.mjs` copia o mapa `baseId → país` para o módulo gerado
`src/lib/game/online/collection-countries.ts`, que exporta `playerCountryOf` e vive dentro do limite do online.
`CollectionCard.svelte` já o usa para a bandeira.

A sinergia consome esse mesmo módulo. **A guarda não muda**, `collection-pool.ts` não muda, e o design não
abre exceção nenhuma — some o único ponto que encostava numa proteção existente.

Preencher os 15 países é editar `identities.game.json` e rodar `npm run sync:countries`, que regenera o módulo.
`FROZEN_V1_FILES` não cobre `identities.game.json`, então nenhum hash congelado se mexe.

## Arquitetura

### `src/lib/game/online/collection-theme.ts` (novo)

A regra pura. Exporta:

- `SCENE_BLOCS` — o mapa país → bloco da tabela acima.
- `THEME_LADDER` — a escada.
- `THEME_LINE_CAP` (2) e `THEME_TOTAL_CAP` (6).
- `themeLines(input)` — recebe jogadores, coach e os lookups, devolve as linhas com a contagem e o rótulo do
  tema (`{ key, power, theme, count }`), para a tela mostrar "Mesmo time: SK 2017 · 5 cartas".

Módulo separado porque `collection-lineup.ts` já passa de 200 linhas e tem outra responsabilidade
(composição e star). A regra do tema é testável sozinha, sem motor de simulação.

### `src/lib/game/online/collection-countries.ts` (gerado, não editar à mão)

Regerado por `npm run sync:countries` depois de preencher os 15 países. Já exporta `playerCountryOf`, que é o
que a sinergia usa. Nenhuma mudança manual.

### `src/lib/game/online/collection-lineup.ts`

`synergyOf` chama `themeLines` e concatena o resultado. Como as linhas saem pelo caminho que já existe, o
montador, o preview, o servidor (`applyCollectionLineup` em `server/room-manager.ts`) e a partida pegam de graça.

`CollectionLineupInput` ganha `coachId?: string | null` — hoje o coach é aplicado depois, fora da sinergia, e o
tema precisa dele na contagem.

## Interface

Três linhas novas na lista de sinergia do montador, no mesmo formato das atuais, com o tema e a contagem:

- `syn_theme_team` — "Mesmo time: SK 2017 · 5 cartas" / "Mesma organização: Astralis · 3 cartas"
- `syn_theme_country` — "Mesmo país: Brasil · 5 cartas" / "Mesmo bloco: CIS · 5 cartas"
- `syn_theme_year` — "Mesmo ano: 2017 · 5 cartas"

Em pt, en e es (`src/lib/game/online/i18n.ts`), com o nome do país traduzido por `countryName`
(`src/lib/game/visuals/flags.ts`).

## Testes

`tests/collectionTheme.test.ts` (novo), puro:

- cada degrau da escada, nas três linhas;
- maior grupo vence (3 br + 2 dk conta 3);
- organização vale metade do time-ano, e conta o melhor dos dois, não a soma;
- bloco vale metade do país exato, e a NAVI 2021 (3 `ru` + 2 `ua`) dá +1%;
- teto de +2% por linha e +6% no total;
- coach entra em time e ano e fica fora de país;
- os 52 países cabem num bloco, e todo jogador do pool tem país (trava a regressão de dado faltando);
- line sem tema nenhum não gera linha alguma.

`tests/collectionRules.test.ts` ganha o caso de ponta a ponta: SK 2017 com tema supera a line de GOATs soltos.

`tests/catalogGuards.test.ts` continua passando com a exceção nova.

## Resultado esperado

Medido em 2026-09-20 com a regra projetada:

| Line | Time | Ano | País | Total | Poder | Custo |
|---|---|---|---|---|---|---|
| SK 2017 (coldzera, fer, FalleN, TACO, felps) | +2% | +2% | +2% | **+6%** | 135,15 | 260.900c |
| Astralis 2018 (device, dupreeh, gla1ve, Magisk, Xyp9x) | +2% | +2% | +2% | **+6%** | 135,15 | 271.200c |
| NAVI 2021 (s1mple, electronic, Perfecto, Boombl4, b1t) | +2% | +2% | +1% | +5% | 133,82 | 202.800c |
| Vitality 2025 (ZywOo, ropz, apEX, flameZ, mezii) | +2% | +2% | +0,25% | +4,25% | 133,30 | 347.000c |
| FaZe 2022 (broky, karrigan, rain, ropz, Twistzz) | +2% | +2% | +0,125% | +4,125% | 133,16 | 193.000c |
| GOATs soltos (FalleN, coldzera, s1mple, donk, jL) | +0,125% | +0,25% | +0,25% | +0,625% | 129,45 | 372.300c |

A NAVI 2021 é o caso do bloco: 3 `ru` + 2 `ua` dariam +0,5% por país exato e dão **+1%** pelo bloco CIS.
A Astralis 2018 só chega a +2% de país porque o `magisk` foi preenchido nesta entrega.

A line temática passa a bater a line de GOATs soltos custando menos — é a primeira vez que montar com critério
ganha de empilhar carta cara.

Risco de bônus acidental, em 20.000 lines aleatórias: 95% ficam em +0,25% ou menos na linha de país, 0,3%
chegam a +1% e nenhuma chega ao teto. Tema de verdade continua sendo coisa de quem montou de propósito.

## Fora de escopo

- **O travamento em 106** (`MAX_TEAM_POWER`) e o teto de 100 pedido pelo dono: decisão em aberto, mexe em
  `simulation.ts`, que Dinastia e sandbox também usam. Esta entrega não encosta nisso.
- **Sinergia de coach reformulada**: `coachAffinity` fica como está.
- **Bloco como linha própria**: bloco é o nível metade de país, não uma quarta linha.
- **Sinergia por função/estilo de jogo**: já existe em `synergyOf` e não muda aqui.
