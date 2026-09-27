# Teto macio de poder, elenco no topo e IGL-Suporte

## Objetivo

Fazer a diferença entre lines aparecer na tela e valer em quadra. Hoje o servidor corta o poder de todo time de jogador em 99 antes da partida: as cinco vagas do dono (104 a 106 na régua), a line russa (103) e cinco GOATs com star (99,5) entram em quadra com 99 idêntico e jogam igual. Chegar a 99,9 passa a exigir a melhor line montável do jogo; o resto se espalha abaixo.

## Contexto medido (2026-09-26, laboratório `tests/helpers/balanceLab.ts`)

| Line | Overall médio | Régua | Tela (antes) |
|---|---|---|---|
| 5 GOATs, papéis certos, sem tema | 98,4 | 97,3 | 97,3 |
| 5 GOATs + star + plano | 98,4 | 99,5 | 99,0 |
| Vagas do dono (5) | 95,8 a 97,6 | 104,0 a 105,4 | 99,0 |
| Line russa (IGL 84, sem support) | 92,2 | 102,9 | 99,0 |
| SK 2016 completa (coach, star, plano) | 92,8 | 110,5 | 99,0 |
| Vitality 2025 completa | 95,8 | 108,8 | 99,0 |

Dois defeitos: o corte seco apaga de 3 a 7 níveis de montagem, e acima do joelho da curva (`COURT_SLOPE` 0,05) o elenco quase não pesa, então a SK 2016 com um TACO 86 supera a Vitality 2025 com cinco cartas 93+.

## Comportamento aprovado (dono, 2026-09-27)

### Teto macio no lugar do corte

- `withPlayerBand` deixa de cortar em 99. Até `PLAYER_SOFT_KNEE` (97,5) o nível é o da régua; acima, cada nível vale `(99,9 − 97,5) / (PLAYER_SOFT_TOP_COURT − 97,5)`; o teto é `PLAYER_CEILING_COURT` (99,9).
- `PLAYER_SOFT_TOP_COURT` (115,7) é o nível na régua da melhor line montável, medido com a Vitality 2025 completa e as quatro cartas ajustadas pelo dono (abaixo). É constante de escala, pregada de propósito; `tests/powerCeiling.test.ts` re-mede.
- Sem piso: o piso de 85 (`PLAYER_GAP_FROM_TOP`) sai. Iniciante entra em ~83, cinco elites em ~84. O degrau de entrada dos bots (`noneFiller`) desce de 84 para 82 para quem começa continuar brigando nele (mediu 33% contra o bot sem história; era >40 com o piso).
- A tela do montador e o número que joga são o mesmo, com uma casa decimal (`courtRating`, já existente).

### Elenco conta no topo

- Linha de sinergia `elite_roster`: cada ponto de overall acima de 92, em cada carta, vale 0,3 nível, teto 8 níveis. Só conta com IGL na line, para cinco GOATs sem capitão seguirem em ~92.

### Estrutura custa nível

- AWP duplo deixa de pagar +1% e passa a custar 1 nível (dois AWPers bons) ou 1,5 (fracos). "Não é B.O., mas é um debuffzinho."
- Sem suporte custa 1,5 nível (era 0,8).

### IGL-Suporte

- Nova vaga híbrida `igl-support`, irmã do `awper-igl`: preenche IGL e suporte com metade de cada bônus (`igl_support_hybrid`, `support_hybrid`). Elegível quando a carta pode ser IGL e suporte. Não pode ser star.

### Bots

- Banda da dinastia sobe de 98,2 para 98,5, para o topo do jogador (99,9) seguir favorito por um nível e pouco, não por dois.

### Ordem do topo nasce das cartas, sem lista curada

O dono recusou tiers de dinastia à mão. A ordem pedida (Vitality 2025 > Astralis 2019 > Astralis 2018 > SK 2016 > Luminosity 2016) sai das cartas e da montagem, com quatro ajustes de overall a fazer no Studio:

| Carta | Hoje | Proposta |
|---|---|---|
| flameZ 2025 | 95 | 97 |
| mezii 2025 | 93 | 95 |
| dupreeh 2019 | 91 | 96 |
| device 2019 | 97 | 98 |

Enquanto os ajustes não entram, a Astralis 2018 lidera (115,3 na régua, 99,8 em quadra). `tests/powerCeiling.test.ts` aceita as duas fases.

## Resultado esperado em quadra (medido, regras novas)

| Line | Antes | Depois |
|---|---|---|
| Vitality 2025 completa (com as cartas ajustadas) | 99,0 | 99,9 |
| Astralis 2019 / 2018 completas | 99,0 | 99,9 / 99,8 |
| SK 2016 / Luminosity 2016 | 99,0 | 99,7 / 99,6 |
| Seleções por país (5 melhores) | 99,0 | 99,1 a 99,8 |
| Vagas do dono | 99,0 | 99,1 a 99,5 |
| Line russa (sem support) | 99,0 | 98,7 |
| 5 GOATs sem pensar | 98,6 | 98,5 |
| Campeões azarões (Gambit 2017, Cloud9 2018) | 99,0 | 97,9 / 98,2 |
| 5 GOATs sem IGL | 93,2 | ~92 |
| Iniciante / 5 elites | 85,0 / 85,0 | 82,9 / 84,1 |

## Fora de escopo

- Seleções de todos os tempos como tema curado (spec própria).
- Missões de "chegar longe" no Major dos Campeões.
- Curadoria de função IGL-suporte no Studio (a vaga só aparece para cartas que o dataset já marca como IGL e suporte).
- Migração das lines salvas com função que a carta não aceita (quatro no banco em 2026-09-26).

## Testes

- `tests/powerCeiling.test.ts` (novo): curva, espalhamento das lines de referência, ordem do topo.
- `tests/powerRating.test.ts`: melhor line entre 99 e 99,9.
- `tests/balanceTargets.test.ts`: iniciante ≥30% no degrau de entrada; demais alvos remedidos.
- `tests/soloDifficulty.test.ts`: tabela cumulativa remedida com a dinastia em 98,5.
- `tests/botField.test.ts`: degrau de entrada sem a constante do piso.
- `tests/planBalance.test.ts`: contrato dos planos com 600 séries (os planos deixaram de empatar em 99 exato; a tabela mediu 46–54).
