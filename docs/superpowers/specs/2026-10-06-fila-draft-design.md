# Fila Draft: snake draft com pool compartilhado

## Objetivo

Um modo de fila sem o time da coleção. Quando a sala fecha, o servidor sorteia um pool de cartas para a sala e os participantes escolhem em turnos alternados (1..N, N..1), cinco cada; a carta escolhida some para os outros. Depois cada um escolhe estilo, star e um coach entre três sorteados, e o Major roda contra os outros humanos com bots completando o campo de 16. Vale coins cheios e pontos de temporada, como a fila competitiva.

## Decisões do dono (2026-10-06)

- Pool compartilhado com escolha alternada, não pacotes individuais.
- Raridades do pool por cotas (1 GOAT, 2 Legends, 3 Superstars, 4 Elites, 2 Raras por participante) e 2 cartas por função para cada um; a ideia inicial de odds de pacote Ouro foi descartada por deixar os times fracos.
- Coins cheios e pontos de temporada; mistura aceita com o ranking da coleção.
- Mínimo dois humanos: a sala nunca começa sozinha contra bots.
- 30 segundos por escolha; quem não escolhe recebe a melhor carta que ainda cabe.
- Escolhe star além de estilo e coach.
- Na entrada, "Fila Draft" fica abaixo de "Buscar partida", no lugar do antigo "Jogar Draft"; "Criar sala / Entrar na sala" seguem embaixo.

## Desenho

- **Ideia central**: ao fechar o draft o servidor sintetiza `participant.prepared` (`userId`, `lineup`, `style`, `starPlayerId`, `coachId`, `mapPreferences`). Tudo o que vem depois já se pendura em `prepared`: poder pela cadeia da coleção com coach, `emitRunCompleted`, `recordMajor`, awards, missões, caixa do Major. A síntese roda a cada comando para o poder mostrado no lobby ser o mesmo que joga.
- **Fila**: duas instâncias de `createQueue` em `server/queue.ts` (`kind: 'collection' | 'draft'`), janelas iguais (3+ fecham em 10 s, exatamente 2 em 30 s), `DRAFT_QUEUE_MAX = 6`. Entrar numa fila sai da outra. `POST /queue/join { kind }`, `GET /queue/status` com `kind`, `POST /queue/leave` sai das duas.
- **Sala**: `RoomState.snake` com `pool`, `taken`, `order`, `turn`, `turnDeadlineAt`, `seats` (oferta de coach, rerolls, coach, star). `RoomConfig.mode` segue `premier` (funções livres). A sala da fila draft não inicia com um conectado: após a janela, com menos de dois marca `queueAbandoned` e o cliente volta à fila.
- **Pool**: por cotas, não por odds (dono, 2026-10-06, depois de medir que o pacote Ouro dava um GOAT a cada vinte salas e times finais na casa dos 84): cada participante adiciona 12 cartas — 1 GOAT, 2 Legends, 3 Superstars, 4 Elites, 2 Raras — com uma versão por jogador (`baseId`) e pelo menos 2 cartas elegíveis por função (IGL, AWPer, entry, lurker, rifler, suporte) por participante. Sobram 7 por pessoa no fim. Medido com o motor real (auto-pick, 2 humanos, 40 salas): drafters a ~90,6 de poder em quadra, campeão 18%, final 32%, eliminado no suíço 29%; o alívio de festa (`partyFieldRelief`) já basta, sem ajuste próprio.
- **Comandos (protocolo 12)**: `snake-pick`, `pick-star`, `pick-coach`, `reroll-coach`; `set-style` e `submit-map-preferences` continuam. `draw-team`, `reroll-team`, `pick-player` e `pick-secret` são recusados na sala snake. Snapshot ganha `snake` (público, sem assentos), `queueAbandoned`, e `self` ganha `coachOffer`, `coachId`, `coachRerollsLeft`, `starPlayerId`.
- **Pós-picks**: ao fechar o snake abre a janela de confirmação de 45 s; quem não terminar recebe estilo equilibrado, star de maior overall elegível, coach de maior overall da oferta e mapas padrão.
- **Módulos**: `src/lib/game/online/snake-draft.ts` (puro: turnos, dedupe, escolha automática, visão pública), `server/snake-pool.ts` (sorteio do pool e da oferta de coach), `src/lib/components/online/SnakeBoard.svelte` (grade do pool e turno).

## Fora de escopo

- Separar o ranking por modo (coluna `kind` em `majors`), explicações por jogada, pool individual por jogador.

## Testes

- `tests/snakeDraft.test.ts`: turnos, dedupe, escolha automática, visão pública, comandos no protocolo 12.
- `tests/onlineSnakeDraft.test.ts`: ciclo completo da sala snake no servidor, erros de turno e de carta tomada, star e coach, confirmação automática, run completa com entradas competitivas, revanche.
- `tests/onlineQueue.test.ts`: fila draft fecha só com dois ou mais; sala com um conectado não inicia e marca abandono.
- `tests/onlineSession.test.ts`: `kind` no join e no status.

## Deploy

Protocolo 12: servidor primeiro (`PREVIOUS_PROTOCOL_VERSION = 11` mantém o front atual), depois o front. Rollback na ordem inversa.
