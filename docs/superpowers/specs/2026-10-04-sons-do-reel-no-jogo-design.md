# Sons do reel no jogo

**Data:** 2026-10-04 · **Escopo:** frontend apenas.

## Origem

Os efeitos do reel de marketing não são samples: foram sintetizados do zero pelo
`cs13a0/mobile/_projeto_edicao/audio_v5.py` (NumPy/SciPy). Em vez de recortar o AAC do
vídeo (com música e locução por cima), as **receitas** foram portadas para
`src/lib/game/sfxEngine.ts`: mesmos osciladores, filtros (SVF/biquad), envelopes e seeds.
Cada cue é renderizado uma vez em `Float32Array`, vira `AudioBuffer` e é tocado pelo
`offlineAudio.ts` — nenhum arquivo de áudio é baixado (filosofia que o motor já tinha).

## Mapa cue → som do reel

| Cue | Som |
|---|---|
| `tick` | Tick de roleta/case (seno 3,4 kHz + ruído) — o som que acelera/desacelera no reel |
| `land` | Boom curto dos cortes de mapa |
| `charge` | Riser de tensão (antes de lenda/GOAT abrir) |
| `betWin` | Boom + moeda + sparkle (o acerto de 75% do reel) |
| `betLoss` | Pancada surda + **sad trombone** (o 12,3% que falhou) |
| `coinGain` / `coinSpend` | Moeda de partials (a de gasto é mais grave e curta) |
| `cardLegend` / `cardGoat` | **Vine boom** + chuva de sparkles (o drop do 99) |
| `cardSuperstar` | Boom médio + sparkles |
| `champion` | Vine boom + **multidão** + **airhorn** + sparkles (a virada do reel) |
| `comeback` | Bleeps subindo (os "rounds voltando") |
| `matchFound` / `attention` | Bleeps de alerta |
| `roomStart` | Whoosh + boom pequeno |
| `uiClick` | Click do "Buscar partida"/"Comprar" |
| melódicos (`pick`, `lineup`, `ace`, `mapWon`, `seriesWon`…) | Mesmas notas de antes, mas com o **pluck** do arpejo do reel (serra + passa-baixa) em vez de osciladores crus |

Extra: send de reverb curto (ConvolverNode, IR gerado) com dose por cue (`wet`); ticks
ficam secos para não embolar a roleta.

## O que não mudou

API (`playGameSound`, `unlockOfflineAudio`, toggle, localStorage), trava de repetição por
cue, trava global de 55 ms, teto de polifonia, `document.hidden`, nenhum call site.

## Afinável depois de ouvir

Ganhos por cue (`cues` em `offlineAudio.ts`), trombone no `betLoss` (frequência de aposta
é alta; se cansar, trocar por variação mais seca), airhorn no `champion`, master 0.19.

## Testes

`tests/sfxEngine.test.ts`: todos os cues renderizam finitos/normalizados, tick curto,
determinismo, IR válido. `npm run check`, build e server:build verdes; as 6 falhas de
vitest em balance/catalog/powerCeiling/soloDifficulty já existiam na `main` limpa (conferido
com stash) e não têm relação.
