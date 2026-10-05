# Filtro de país e buff de país/era

**Data:** 2026-10-05 · **Pedido do dono:** mais chances de montar times fortes e 99,9; filtros de nacionalidade; "5 CIS um pouco mais; 3-4 franceses e 2 br; times com 2, 2 e 1 também deveriam receber; só uma melhoradinha de pontos".

## Função 1 — Filtro de país (frontend)

- Aba de cartas: quinto select ("País"), opções só dos países que o jogador possui, nome via `countryName`/`Intl.DisplayNames`. Coaches somem com o filtro ativo (não têm país).
- Picker de titulares: filtros de país **e** ano, zerados ao abrir vaga (`openSlot`).
- Dados de `playerCountryOf` (`collection-countries.ts`, 100% das 1.555 cartas); chave `filterCountry` nos três idiomas.

## Função 2 — Buff de país/era (`collection-theme.ts`, compartilhado com o servidor)

| Alavanca | Antes | Depois |
|---|---|---|
| `THEME_LADDER_PLAYERS` | {2:0,5, 3:2,5, 4:5,5, 5:9} | {2:0,5, 3:2,5, **4:6, 5:10,5**} |
| Bloco de cena | 50% da escada | **60%** (`THEME_BLOC_RATIO`) |
| Grupos secundários | não pontuavam | **50% da escada deles** (`THEME_SECONDARY_RATIO`): 3 fr + 2 br = 2,5 + 0,25; 2+2+1 = 0,5 + 0,25 |
| Era (ano frouxo) | não existia | baldes 2013–15 · 16–17 · 18–19 · 20–21 · 22–23 · 24–26, a 50% da escada do ano (`eraOf`) |

Decisões: a leitura de bloco soma os grupos exatos de fora do bloco como secundários (sem contar ninguém duas vezes); **a era frouxa NÃO satisfaz a química** (o balde 2024–26 tem ~550 cartas — "mesma era" é bônus, não vínculo; o −2 de cinco estranhos continua mordendo). Rótulo "Mesma era" (`syn_theme_year_era`) com o balde legível.

## Re-baseline e o pino novo (medidos)

O catálogo em produção (hash `92003799c82e38a1`) divergia dos congelados desde 2026-09-30. Com ele remedido:

- Campeões: **SK 2016 (116,70) > Luminosity 2016 (116,30) > Vitality 2025 (115,87)** > Astralis 2019 (115,60) > Astralis 2018 (115,29) — a era brasileira lidera, ordem travada no teste.
- **A line mais forte do jogo não é um time completo**: o top-5 cru do Brasil (coldzera, FalleN, TACO, fnx da Luminosity 2016 + fer 2017) mede **117,61** — núcleo de 4 + país cheio + ano cabem inteiros no teto temático de 30, enquanto o campeão completo é capado. Isso já valia em produção antes do buff (~117,2) e ninguém via: o teste novo das seleções fecha esse ponto cego.
- `PLAYER_SOFT_TOP_COURT` re-pregado em **117,6**: o híbrido BR é o único 99,9 da tela; o melhor campeão completo lê ~99,79.
- Seleções por papéis (pós-buff, pino novo): dk 99,37 · ru 99,33 · br 99,63 · fr 99,01 · se 99,57 — todas sobem, nenhuma crava.
- 5 CIS misto (3 ru + 2 ua): 4,5 → 6,3 de sinergia (+0,45 de régua). Astralis/SK continuam capadas em 30 (buff não muda o top-4 dos campeões).

## Verificação

`npm run validate` verde (2270 testes, inclusive as 32 metas estocásticas sem re-centrar com o buff). Guardas novas: `tests/collectionTheme.test.ts` (secundários, bloco a 60%, eras e química) e `tests/powerCeiling.test.ts` (seleções por papéis entre 99,0 e 99,8; top-5 crus nunca acima do pino; o híbrido BR É o pino).

## Deploy

Mesmo commit no Railway (`railway up --ci --service cs13a0-online-server`, primeiro) e na Vercel (push na `main`, logo depois). Sem bump de protocolo (11). Rollback na ordem inversa.

## Correção do mesmo dia — meio-termo BR (dono)

O dono notou que Vitality/Astralis saíram do 99,9. Causa: TACO 2016 (86→96) e fnx 2016 (90→96) entraram
escondidos no commit `34f0d9f` ("restore bonus for elite double AWP"), inflando SK (116,70), Luminosity (116,30)
e o híbrido BR (117,61) — que tomou o pino e comprimiu o resto. Decisão do dono: **BR forte sem passar a
Vitality**. Calibrado no laboratório: **TACO 93 · fnx 95** → Vitality 115,94 volta a ser o pino (99,9), Astralis
2019 115,60 lê 99,9, SK 115,44 vira o 3º do jogo, Astralis 2018 115,29 e Luminosity 115,05 leem 99,8; híbrido BR
115,03 e seleções 99,15–99,76. `PLAYER_SOFT_TOP_COURT` de volta a 115,9; guarda nova: nenhum top-5 cru passa do
pino. Hash do catálogo: `a2f116196f0b4081`. Atenção: se o Studio ainda tiver TACO/fnx em 96, um `data:pull`
futuro desfaz isso — corrigir lá também.
