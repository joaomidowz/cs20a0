# Log do rebalanceio online/solo — 2026-09-21

Medido no motor real (MD3 pela cadeia do servidor / Majors inteiros pela montagem de `beginTournament`), antes no
commit `1af3d5d` e depois com a escada de pedigree fino. Metas combinadas com o dono: iniciante azarão claro do
campeão (8–20%), auge com 45–60% de título no Major normal, fracos fracos de verdade, campeões ocasionais e
hierarquia merecida em cada degrau.

## A escada

| | Antes (5 bandas) | Depois (9 pedigrees) |
|---|---|---|
| Sem história | none 85,1–89,9 (méd 86,3) | filler 84,9 · potencial 89,3 |
| Top 8 | 88,9–92,9 (90,8) | 91,0 |
| Semifinalista | 91,7–94,5 (93,1) | 93,3 |
| Vice | 93,8–95,4 (94,5) | underdog 94,0 · merecedor 95,2 |
| Campeão | 95,9–96,5 (96,4) | underdog 96,0 · forte 97,2 · dinastia 98,2 |
| Zebra | +0,5 (teto 94) | +1,0 (teto 94,5) |
| Piso do jogador | 96,8 (acima dos campeões) | 93 (abaixo de vices e campeões) |
| Alívio solo | 0,5 → 2,5 desde 96,78 | 0 desde 91 → 1,1 no 99 |

Classificação completa dos 286 time-anos: `docs/reports/2026-09-21-taxonomia-pedigree.md`.

## Quem levanta o troféu (300 Majors competitivos, 16 bots, sem alívio)

| Categoria | % do campo | % dos títulos antes | % dos títulos depois |
|---|---|---|---|
| Campeões (banda única antes) | 12,8% | **84%** | — |
| Dinastia | 1,8% | — | **18,0%** |
| Campeão forte | 8,4% | — | **57,7%** |
| Campeão underdog | 2,6% | — | **9,7%** |
| Vice merecedor | 3,4% | 9% (finalist) | **7,7%** |
| Vice underdog | 2,2% | (incluído) | **1,3%** |
| Semifinalista | 10,0% | 5,3% | **5,0%** |
| Top 8 | 12,3% | 1,3% | **0,7%** |
| None potencial | 9,7% | 0,3% (none) | **0%** |
| None filler | 49,7% | (incluído) | **0%** |

O gradiente é monotônico: cada degrau acima vale mais por vaga (dinastia 10× seu share, forte 6,9×, underdog 3,7×,
vice merecedor 2,3×). Gambit/Cloud9/Outsiders levam ~1 major em 10 — os campeões ocasionais — e finais têm donos
variados (47% forte, 11% dinastia, 10% underdog, 10% vice merecedor, 11,5% semifinalista).

## Confrontos-chave (300 BO3, seeds dos testes)

| Confronto | Antes | Depois |
|---|---|---|
| Iniciante × degrau de entrada | 99% | 97% |
| Iniciante × campeão | 43–51% (coin flip) | **12–15%** (azarão claro) |
| Melhor line × campeão | 66% | 69% (a parede é o Major, não a série) |
| 4×99 sem IGL × campeão | 51% | 40% |
| Times competitivos (controle 25–75%) | ok | ok |

## Solo contra bots — Major normal (campo sorteado, 200 runs)

| Lineup | Nível | Título antes | Título depois | Suíça antes | Suíça depois |
|---|---|---|---|---|---|
| Iniciante | 93 | **36%** | **1%** | 0% | 8% |
| Elites | 96,9 | — | 39% | — | 0% |
| Superstars montados | 97,6 | **60%** | 50% | 0% | 0% |
| GOATs preguiçosos | 98,0 | **71%** | 61% | 0% | 0% |
| GOATs montados (auge) | 98,6 | **83%** | **56–61%** | 0% | 1% |

## Solo contra bots — Major dos Campeões (80 runs): a parede que não cede

| Lineup | Título | Final | Suíça |
|---|---|---|---|
| Iniciante | 0% | 0% | 99% |
| Elites | 6% | 15% | 48% |
| Superstars montados | 13% | 35% | 20% |
| GOATs preguiçosos | 28% | 48% | 18% |
| GOATs montados (auge) | **33%** | 49% | 6% |

O Major normal é a parede que cede (auge 45–60%); o Major dos Campeões é a parede de verdade: nem o auge passa de
1 em 3, e quem está começando não leva — cai na suíça em quase toda run.

## Validação

- `npm test`: 2176 testes, 0 falhas (88 arquivos; `soloDifficulty` e `balanceTargets` recalibrados para as faixas
  novas combinadas com o dono).
- `npm run check`: verde.
- Pendente: distribuição das lineups REAIS dos players (`.env` aponta para um Postgres local 127.0.0.1:5435 que
  estava fora do ar; o script de leitura está pronto para rodar quando o banco subir).
