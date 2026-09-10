# Auditoria do protocolo online 9 — 10/09/2026

O ganho de tráfego foi confirmado: 99,44–99,55% nos seis comparativos. A garantia de não perder nenhum round do kill feed ainda falha quando o congestionamento atravessa uma troca de mapa ou série. Nenhum código de produção foi alterado nesta auditoria.

## Versões e método

- Código revisado: `0e91f85`, incorporado durante a auditoria no merge `4d1330f`. As duas árvores são idênticas (`git diff 0e91f85 4d1330f` vazio).
- Referência anterior: `f198242`, protocolo 8, extraída em `/tmp`, sem modificar o checkout.
- Node local: v24.18.0. Medidas locais, sem acesso ao Railway ou tráfego externo.
- Seis comparativos: dois torneios Stage 3/ultra para cada tamanho de sala (4, 8 e 16 humanos).
- Em cada torneio, o serializador anterior recebeu uma cópia superficial do MESMO estado autoritativo usado pelo protocolo novo. O cache antigo ficou isolado. Isso compara a representação e o custo de serializar, não executa um segundo servidor antigo em rede.
- O harness transmite depois dos ticks que mudam a sala e depois de cada decisão aceita, como o servidor. Humanos respondem automaticamente usando o estado do gerente; não são navegadores executando animações.
- A identidade dos participantes usa UUIDs reais. Mesmo com seed de sala fixada, repetições podem ter partidas e tamanhos diferentes. A comparação antes/depois dentro de uma execução usa exatamente os mesmos participantes e resultados.
- Bytes de JSON UTF-8, em unidades decimais (KB=1.000, MB=1.000.000, GB=1.000.000.000). Não incluem framing WebSocket, TLS/TCP, lobby/draft e acks/erros.
- Tempos são `performance.now()` ao montar/serializar mensagens, não CPU faturada nem latência de internet. No novo, também incluem contabilização de feed e avanço dos cursores do harness; a referência não inclui o snapshot redundante que o servidor antigo montava para o ack.

## Comparação por torneio — saída total da sala

| Humanos | Antes | Depois | Redução | Depois por jogador |
|---|---:|---:|---:|---:|
| 4 | 3,95–5,58 GB | 22,0–26,3 MB | 99,44–99,53% | 5,4–6,8 MB |
| 8 | 12,10–13,22 GB | 62,1–67,3 MB | 99,49% | 7,4–8,6 MB |
| 16 | 40,68–41,64 GB | 188,0–189,3 MB | 99,53–99,55% | 11,5–12,2 MB |

| Humanos | Maior mensagem antes | Maior mensagem depois | Montagem/serialização antes | Depois |
|---|---:|---:|---:|---:|
| 4 | 2,87–3,15 MB | 125–132 KB | 10,15–14,80 s | 0,132–0,159 s |
| 8 | 3,06–3,13 MB | 135–136 KB | 31,30–34,19 s | 0,280–0,294 s |
| 16 | 3,38–3,43 MB | 153–154 KB | 104,27–105,63 s | 0,649 s |

O caminho de montagem/serialização ficou aproximadamente 77–163 vezes mais rápido. Isso não significa que o jogo inteiro, a rede ou os cliques ficaram tantas vezes mais rápidos. Os valores anteriores relatados pelo autor (por exemplo, 36 MB por sala) são compatíveis com variações do cenário, mas não são tetos fixos. Dados exatos: `comparison.jsonl`.

## Testes executados e repetidos

1. Suíte original: **34 arquivos, 262 testes aprovados**. O checkout possui 262, não os 267 mencionados no resumo recebido. Uma primeira tentativa sem permissão de abrir portas locais falhou por `EPERM`; a repetição fora dessa restrição passou.
2. Matriz nova: **16 casos**, executados duas vezes. Em cada passagem, **13 aprovados e 3 falhas**.
   - Dois torneios completos por tamanho: 4, 8 e 16 jogadores.
   - 4, 8 e 16 jogadores com congestionamento alternado em ticks de 100 ms: sem lacunas no feed.
   - 4, 8 e 16 jogadores com um cliente congestionado desde o round 5 até mudar o mapa/série: falham por feed incompleto.
   - Quatro jogadores em velocidade normal e fast, além dos cenários ultra: aprovados.
   - Reconexão do gerente e novo cursor em torneios de 4 e 16 jogadores: aprovados; o harness conserva o feed já observado antes da reconexão.
3. Comparativo antigo/novo: **6 casos adicionais**, todos aprovados.
4. WebSockets TCP reais em localhost: **6 casos**, duas repetições com 4, 8 e 16 clientes. Entrada, início ao vivo, 20 mudanças de velocidade por caso, confirmação de configuração para todos, resync apenas ao solicitante e reconexão com token: aprovados.
5. Carga simultânea: **4 casos**, 1×4, 1×16, 4×16 e 10×16 participantes, cada um por 1.000 ciclos de 100 ms simulados: aprovados. Confere versões entregues e exercita simulação, decisões automáticas e serialização. Usa um broadcast consolidado por sala/tick, sem sockets e sem simulação de largura de banda; portanto não é um teste completo de capacidade de 160 navegadores.
6. Suíte final com os arquivos novos, em um worker para evitar concorrência entre medições: **37 arquivos, 288 testes: 285 aprovados e 3 falhas**. As falhas são os testes novos de congestionamento atravessando mapa. Os 262 originais continuaram passando.
7. `npm run check`: zero erros e zero avisos. Builds do frontend e servidor concluídos.

Os testes de regressão que demonstram a falha foram deixados ativos e vermelhos. Não foram omitidos nem convertidos em falhas esperadas para tornar a suíte verde.

## Comandos em sockets reais

120 alterações de velocidade ao todo, 20 por caso. Tempo do envio até o ack no cliente, somente localhost:

| Clientes | p95, duas execuções |
|---|---:|
| 4 | 0,34–0,41 ms |
| 8 | 0,65–1,12 ms |
| 16 | 1,00–1,48 ms |

Esses números mostram que o comando não ficou bloqueado nesse cenário local. Não medem Slow 3G, cliques/renderização no navegador, latência geográfica ou um servidor Railway sob carga. Não houve comparação de RTT com sockets do protocolo antigo. Dados: `sockets.jsonl`.

## Carga simultânea local

| Salas × humanos | p95 por ciclo | p99 | Máximo |
|---|---:|---:|---:|
| 1 × 4 | 0,79 ms | 1,45 ms | 3,05 ms |
| 1 × 16 | 0,73 ms | 0,97 ms | 4,20 ms |
| 4 × 16 | 2,58 ms | 4,35 ms | 5,47 ms |
| 10 × 16 | 6,37 ms | 7,63 ms | 9,94 ms |

São cenários diferentes, com aquecimento/JIT e resultados de partidas diferentes, e não uma curva linear de capacidade. O ciclo inclui consultas extras para a automação do harness, além do tick e broadcast consolidado. Todos ficaram abaixo de 100 ms nesta máquina. Dados: `concurrent.jsonl`.

## Falha reproduzida: feed pendente desaparece ao trocar mapa

**Prioridade alta para a promessa de preservar todos os eventos.** Em `server/room-manager.ts:247`, `sanitizeLiveSeries` inclui detalhes somente de `activeMap`. O cursor de `server/broadcast.ts` identifica um único mapa. Quando a conexão passa vários ticks congestionada, o gerente continua simulando. Ao mudar o mapa/série, o próximo envio não inclui os detalhes pendentes do mapa anterior. O histórico sanitizado também não contém esses detalhes; pedir um snapshot não os recupera.

Reprodução automatizada: entregar normalmente até antes do round 5 do primeiro mapa do participante 0; reportar `bufferedAmount` acima de 64 KiB até o mapa/série mudar; liberar; completar o torneio; comparar os rounds do feed recebidos com os rounds presentes no resultado final.

- Primeira matriz: faltaram 11, 20 e 11 rounds, nas salas de 4, 8 e 16 humanos.
- Segunda matriz: faltaram 15, 19 e 15 rounds, respectivamente. Exemplos da segunda: rounds 5–19 na sala de quatro e rounds 5–23 na de oito.
- O placar e o histórico de resultados finais continuaram disponíveis. O defeito é a recuperação dos eventos detalhados; pode eliminar animações/kill feed desses rounds para o cliente atrasado.
- O teste antigo que alterna um tick congestionado e um livre não atravessa uma janela longa e, por isso, passa.

Correção recomendada: preservar a posição e os eventos pendentes por série/mapa, com entrega ou recuperação explícita dos mapas anteriores quando a conexão voltar. Separar os eventos recuperados da apresentação do mapa ativo. Definir retenção limitada e recuperação sob demanda para evitar reintroduzir o histórico completo em cada live. Reexecutar os três testes vermelhos após a correção.

## Limites adicionais da revisão

- `server/app.ts:113` retorna sucesso logo após `socket.send`; o cursor avança quando o envio foi enfileirado, não quando o navegador confirmou aplicação. O nome/comentário de entrega não deve ser interpretado como recibo do cliente.
- `bufferedAmount` não mede a fila de animações do browser. Os testes de congestionamento usam a lógica injetável de buffer, não um enlace real Slow 3G.
- Snapshots continuam fora do descarte por backpressure. Mudanças frequentes de configuração ou participantes ainda podem gerar fila; não foi encontrada falha adicional comprovada nesse caminho.
- Não houve execução visual de quatro/16 abas, verificação de animações, deploy, push, PR ou alteração em recursos de produção.
- Não há base para prometer queda de 99,5% da fatura total: mediu-se apenas o tráfego desta parte do multiplayer, não bancos, imagens, outros projetos ou taxas da plataforma.

## Reprodução

Da raiz `cs20a0`:

```sh
ONLINE_AUDIT_REPORT=/tmp/online-matrix.jsonl npm test -- tests/onlineExtendedTraffic.test.ts
ONLINE_SOCKET_REPORT=/tmp/online-sockets.jsonl npm test -- tests/onlineExtendedSocket.test.ts
ONLINE_LOAD_REPORT=/tmp/online-load.jsonl npm test -- tests/onlineConcurrentAudit.test.ts
npm test -- --maxWorkers=1
```

Para repetir o comparativo, extrair `server`, `src/lib` e `package.json` de `f198242` para um diretório temporário, disponibilizar nele as dependências locais e empacotar `server/room-manager.ts` com esbuild (`--bundle --platform=node --format=cjs`). O arquivo utilizado nesta execução foi `/tmp/cs13a0-baseline-manager.cjs`:

```sh
ONLINE_AUDIT_BASELINE=/tmp/cs13a0-baseline-manager.cjs ONLINE_AUDIT_REPORT=/tmp/online-comparison.jsonl npm test -- tests/onlineExtendedTraffic.test.ts -t repeat
```

Os JSONL desta pasta preservam as medições exatas, e `test-summary.json` registra totais e falhas. Os três novos arquivos de teste são artefatos da auditoria; o comportamento do produto foi preservado.
