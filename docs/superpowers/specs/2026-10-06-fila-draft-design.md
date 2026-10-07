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

## Segunda iteração (2026-10-07)

- **Pool por cotas, sem cartas fracas**: 2 GOATs, 3 Legends, 4 Superstars e 3 Elites por participante (12), 2 cartas por função. Medido com o motor real (auto-pick, 2 humanos, 40 salas): drafters a ~95 de poder em quadra; com o alívio de festa eram campeões em 34% das salas, por isso a sala snake joga **sem alívio** no campo de bots (campeão 23%, final 41%, eliminado no suíço 13%). A diferença entre drafters sai da sinergia.
- **Dicas de sinergia** (`src/lib/game/online/snake-hints.ts`): funções centrais que faltam (IGL, AWPer, suporte), temas em formação (mesmo time, país ou ano; 3 fecham química, era frouxa não conta) e, carta a carta do pool, o que cada uma acrescenta (selo na carta; brilho na vez do jogador).
- **Mobile**: navbar inferior escondida durante o snake (`PageLayout.hideOnlineNav`); deck fixo no rodapé com as cinco vagas (o que tem, o que falta) e os chips de sinergia (`SnakeDeckBar`); barra de turno sticky com relógio, "depois: X" e tique nos últimos segundos (`SnakeTurnBar`); a faixa participantes/prazo/status some durante os picks no celular.
- **Coaches compartilhados (protocolo 13)**: pool de `max(9, N+3)` coaches da sala (um terço fortes 85+, um terço médios 78–84, um terço comuns), uma pessoa por carta; `pick-coach` só com o snake fechado, o primeiro processado leva, o segundo recebe `COACH_TAKEN` e escolhe outro; trocar libera o anterior; quem sai devolve o coach; autocomplete em `snake.order` com coaches distintos. `reroll-coach` removido. Fronts 12 recebem `PROTOCOL_MISMATCH`.
- **Resultado completo**: o servidor marca `rewarded` em todo participante com conta e assento (coleção ou snake); o cliente busca prêmios, pontos, caixa e ranking da sala com `collection || rewarded`.
- **Chip de overall** na cor da raridade (número escuro) em CollectionCard, CoachCard, MiniCard e DynastyCoachCard; comum em cinza claro.

## Fora de escopo

- Separar o ranking por modo (coluna `kind` em `majors`), explicações por jogada, pool individual por jogador.

## Testes

- `tests/snakeDraft.test.ts`: turnos, dedupe, escolha automática, visão pública, comandos no protocolo 12.
- `tests/onlineSnakeDraft.test.ts`: ciclo completo da sala snake no servidor, erros de turno e de carta tomada, star e coach, confirmação automática, run completa com entradas competitivas, revanche.
- `tests/onlineQueue.test.ts`: fila draft fecha só com dois ou mais; sala com um conectado não inicia e marca abandono.
- `tests/onlineSession.test.ts`: `kind` no join e no status.

## Deploy

Protocolo 13 (2026-10-07): servidor primeiro, front logo depois; o servidor aceita só 13 (`PREVIOUS_PROTOCOL_VERSION = 13`) porque a etapa de coach mudou de contrato. Rollback na ordem inversa.
