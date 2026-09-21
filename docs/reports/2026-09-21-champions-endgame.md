# Major dos Campeões — desafio endgame recalibrado (2026-09-21)

O "Major dos Campeões" ganhou tabela de alívio própria (`SOLO_CHAMPIONS_RELIEF`), mais dura que a do Major normal,
calibrada contra a tabela cumulativa combinada com o dono. Colunas cumulativas — campeão conta como final, semi e
quartas. Médias de 300 Majors simulados por nível (o sorteio de cada torneio segue livre: estas são médias, não
roteiro).

## Tabela cumulativa — alvo × medido

| Nível | Campeão | Final | Semi | Quartas | Eliminado no suíço |
|---|---:|---:|---:|---:|---:|
| Iniciante (93) | 0 / **0** | 0 / **0** | 0 / **0** | 1 / **1** | 99 / **99** |
| Elite (96,9) | 6 / **5** | 12 / **10** | 22 / **24** | 40 / **48** | 60 / **52** |
| Superstar (97,6) | 13 / **10** | 24 / **23** | 43 / **43** | 66 / **71** | 34 / **29** |
| Auge (98,0) | 23 / **21** | 38 / **33** | 64 / **53** | 84 / **77** | 16 / **23** |
| Excepcional (98,6) | 33 / **39** | 55 / **52** | 82 / **69** | 94 / **90** | 6 / **10** |

Título, final e quartas a até ~8pp do alvo; a maior distância está nas **semis dos topos** (53/69 contra 64/82).
O motivo é estrutural, não de calibração: com o swing de mapa de ±2 níveis que produz a variação pedida (abaixo),
um favorito de ~2 níveis converte ~65–70% das quartas — para converter 8+ em 10 seria preciso cortar o swing pela
metade, matando viradas e OTs. O knob existe (`rounds.ts`, swing de mapa) e é do dono trocar consistência por
variação.

## Variação medida (todas as séries/mapas dos 5×300 Majors, 60 mil séries / 150 mil mapas)

- Séries 2-0: **49%** · séries 2-1: **48%** — nada de roteiro.
- Viradas (perder o 1º mapa e ganhar a série): **10%**.
- Mapas com overtime: **15%** · mapas apertados (≤2 rounds): **15%**.
- No campo em geral (Major normal, mismatches grandes): 13-0 em **0,8%** dos mapas (~1 a cada 125), 13-1 em 2,5%,
  atropelos de 9+ rounds em 17%. No Champions, entre campeões, o 13-0 praticamente não existe — campo parelho,
  como na vida.
- Campanhas 3-0, 3-1 e 3-2 avançam todas no suíço (perder até duas e seguir vivo) — as três aparecem em massa nas
  medições.
- A força que decide continua sendo elenco, mapa (veto/afinidade/lado), matchup, forma do dia (`getMatchDayPower`),
  química/consistência e momentum/economia dentro do mapa.

O Major normal não mudou nesta recalibração (auge medido em 56% de título, mesma média de antes).
