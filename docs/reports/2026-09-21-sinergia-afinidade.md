# Sinergia de afinidade — a régua honesta da coleção (2026-09-21)

Segundo capítulo do rebalanceio do dia (o primeiro foi `2026-09-21-taxonomia-pedigree.md` e o
`2026-09-21-champions-endgame.md`). O gatilho foi o próprio time do dono: base 86,7 lendo **97,4**
na tela — banda de dinastia — e um Major dos Campeões ganho com ele ("tá certo isso? wtf").

## O bug estrutural

A sinergia da coleção era **porcentagem do poder cru**, e a curva de níveis (`courtPower.ts`) tem um
joelho em 100: abaixo dele cada ponto cru vale 1 nível inteiro, acima vale um vigésimo. Consequências
medidas no motor real:

| time | base | ganho de sinergia (nível) |
|---|---|---|
| iniciante (comuns coerentes) | 76,9 | **+14,9** |
| time do dono (1 GOAT + mix) | 86,7 | **+10,7** |
| superstrellas montadas | 87,6 | **+9,9** |
| 5 GOATs montados | 96,7 | **+1,8** |

Montar bem valia 8× mais para time fraco; "montado" × "jogado fora" diferia 0,4 nível; e o builder
prometia **+4,9** (impactos marginais) entregando **+10,7** — a tela mentia.

## A régua nova (combinada com o dono)

1. **Sinergia vira afinidade + estrutura, em NÍVEIS** (`SYNERGY_POWER_TO_COURT = 0,25`): a moeda "%"
   das linhas entra na quadra como níveis, linear — a soma que a tela mostra é a soma que joga.
2. **Afinidade é a matéria-prima** (a pedida do dono): núcleo real (mesmo time-ano + coach) vale até
   **17% → +4,25 níveis** — o maior bônus do jogo; país completo +2,25; era/ano até +1,5; cap total
   30% (+7,5). Conceitos coerentes (cinco CIS, cinco BR) também pagam.
3. **Star por raridade, nunca IGL/suporte**: GOAT ×1,6 · superstar ×1,35 · legend ×1,15 · elite ×1,0 ·
   rare ×0,75 · comum ×0,5. Raridade sozinha não constrói nada — só estica o que a estrutura dá.
4. **Plano pesa menos**: 8–12% (+2 a +3 níveis), equilibrado 9–11, plano que o time não roda 3.
5. **Anti-pay-to-win (a segunda pedida do dono)**: sem IGL **-2,5** · sem AWPer **-1,5** · sem suporte
   **-0,8** · e **"cinco estranhos"** (nenhum vínculo de trio) **-2**. Cinco estrelas sem capitão e
   sem química não são um time — nem aqui.
6. **Banda do jogador 85–99**: piso 85 (era 93 — com a régua honesta, 93 achataria Iniciante e Elite
   no mesmo número) e teto **99**: o time perfeito existe e para exatamente onde a régua acaba.

## A régua medida (pós-penalidades)

| time | nível |
|---|---|
| iniciante (comuns, funções certas) | 85,0 |
| elites soltos / jogados fora | 85,0 · 91,6 |
| time do dono (1 GOAT star, par de ano) | **89,9** |
| superstrellas montadas (trio 2026, sem núcleo) | 95,2 |
| FURIA 2025 inteira + coach (núcleo real) | 96,4 |
| 5 GOATs preguiçosos (funções certas, sem química) | 98,6 |
| 5 GOATs montados / SK 2016-17 real / Astralis-era | **99,0** (teto) |
| 5 GOATs SEM IGL e sem suporte | **93,2** |

## As tabelas de alívio refeitas

- **Major normal (random)**: alívio SOBE com o nível (0,9 → 2,5). Parede real no auge (~45–60% título),
  farm do fim de coleção no excepcional (~72%).
- **Major dos Campeões**: alívio DESCE (4,3 → 0,25) — o campo encontra o desafiante ~2 níveis acima
  dele em cada fileira e joga quase à força real contra quem chegou ao topo. Fileiras medidas
  (título/final): iniciante **0/0** · elite ~**1/3** · superstar ~**11/28** · auge ~**15-20/27** ·
  excepcional ~**32/45**. A fileira "elite" do dono pede elenco coerente — o mix com 75/80 no time
  joga abaixo do número da fileira, de propósito.

## Detalhes que fecham junto

- `RAW_TOP` deixa de ser pino de conteúdo: é constante de escala (onde o 99 foi pregado). O pino das
  cartas (melhor base montável) é ~106 cru.
- Testes-alvo re-medidos; LABs novos: `furiaCore` (núcleo real de superstrellas = fileira auge) e
  `ownerMix` (o time do dono).
- Knobs documentados em `balance.ts`: `MISSING_*_COURT`, `NO_CHEMISTRY_COURT`, `THEME_*`,
  `STAR_RARITY_SCALE`, `SYNERGY_POWER_TO_COURT`, `PLAYER_CEILING_COURT`, `SOLO_*_RELIEF`.
