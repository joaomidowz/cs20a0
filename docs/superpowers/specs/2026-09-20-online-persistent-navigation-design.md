# Navegação persistente do Online

## Objetivo

Permitir navegar entre Jogar, Time, Loja e Conta usando a navegação interna do SvelteKit sem abandonar a fila, perder a conexão com a sala ou recarregar a página inteira. A mudança não altera aparência, textos ou disposição visual.

## Escopo

- Preservar fila, heartbeat, encontro de partida, WebSocket, snapshot e reconexão durante navegações dentro de `/online`.
- Manter apenas uma instância de polling e uma conexão WebSocket por aba do navegador.
- Continuar desmontando o conteúdo visual das páginas inativas para limitar memória e trabalho de renderização.
- Preservar as URLs atuais e o comportamento visual atual de `OnlineNav`, `WalletBar` e das páginas.
- Manter fila, sala, resultados e demais estado competitivo autoritativos no servidor.
- Não persistir snapshots competitivos no `localStorage`; somente os tokens e preferências já autorizados continuam persistidos.
- Não alterar regras de fila, simulação, coleção, economia ou servidor.

## Arquitetura escolhida

O estado de execução do Online será extraído da página `/online` para um controlador client-side único, com stores Svelte de leitura e comandos explícitos. Um componente de runtime montado no shell persistente de `/online` mantém polling, timers globais, notificações e conexão enquanto o usuário troca de rota.

As páginas continuam responsáveis apenas por sua interface. `/online` apresenta e comanda a sessão; Time, Loja e Conta permanecem independentes e não recebem atualizações rodada a rodada. Isso evita remontar a conexão sem manter simultaneamente as telas pesadas em memória.

Não será usada uma única página com todas as abas escondidas por CSS: essa opção preservaria estado local, mas manteria coleção, loja e jogo montados, aumentando memória e atualizações reativas desnecessárias. Também não será usado somente `localStorage`, pois ele não mantém heartbeat ou WebSocket e poderia transformar estado competitivo local em fonte de verdade.

## Componentes e responsabilidades

### Controlador da fila

- Possui o estado `idle`, `waiting` ou `matched`.
- Mantém um único polling de status a cada dois segundos.
- Continua o heartbeat durante navegação interna.
- Abandona a fila apenas em cancelamento explícito, logout, fechamento/reload real ou política de inatividade já existente.
- Ao encontrar partida, guarda código e ticket somente em memória e inicia a conexão da sala.

### Controlador da sala

- Possui uma única instância de `OnlineRoomClient`.
- Mantém snapshot, live update, conexão e dados transitórios necessários para renderizar `/online` novamente.
- Continua conectado durante navegação interna.
- Para a conexão no fechamento real da aplicação, logout ou saída explícita da sala.
- Usa o token de retomada já existente para recuperar a sala após reload.

### Shell persistente do Online

- Vive acima das páginas filhas de `/online`.
- Inicializa e encerra o runtime uma vez.
- Mantém o shell visual existente sem alterações perceptíveis.
- Não faz as páginas inativas permanecerem montadas.

### Página Jogar

- Consome o estado persistente em vez de possuir a vida útil da fila e do socket.
- Preserva a interface atual e seus comandos.
- Ao retornar de Time, Loja ou Conta, renderiza imediatamente o snapshot mantido e continua a sincronização normal.

## Fluxos

### Fila e navegação

1. O usuário entra na fila em Jogar.
2. O runtime inicia o heartbeat.
3. O usuário abre Time ou Loja pela navegação existente.
4. A página Jogar é desmontada, mas o runtime continua montado.
5. Quando a partida é encontrada, o runtime recebe o ticket e conecta à sala.
6. Ao retornar a Jogar, a página usa o estado atual sem recriar fila ou conexão.

### Sala e navegação

1. A conexão WebSocket permanece no runtime durante navegação interna.
2. Snapshots e live updates atualizam apenas os stores específicos.
3. Páginas que não consomem esses stores não renderizam novamente.
4. Ao retornar a Jogar, a tela recebe o último snapshot e continua do ponto atual.

### Reload ou fechamento real

O evento `pagehide` conserva a semântica atual de encerramento da fila. Para sala já formada, a reconexão usa o resume token e as regras autoritativas do servidor. Navegação interna do SvelteKit não deve executar a saída da fila.

## Desempenho

- Uma instância de polling e uma de WebSocket, sem duplicação por rota.
- Stores divididos por responsabilidade para impedir que carteira, loja ou coleção reajam a cada rodada.
- Nenhuma tela pesada escondida em segundo plano.
- Timers iniciados e limpos de maneira idempotente.
- Dados de coleção continuam carregados sob demanda pela página correspondente.
- Nenhuma dependência nova.

## Erros e recuperação

- Falhas transitórias de polling mantêm a política atual de tentativas.
- Reinício do servidor mantém a tentativa de reentrada silenciosa já existente.
- Expiração de sala limpa o estado transitório e retorna Jogar ao estado de entrada.
- Um ticket encontrado permanece em memória até ser consumido pela conexão.
- O runtime deve ser seguro contra montagem duplicada durante desenvolvimento e navegação.

## Compatibilidade com edição do Time

A proteção existente contra descartar alterações não salvas permanece inalterada. Esta entrega não mantém o formulário não salvo montado em segundo plano e não modifica `CollectionWorkspace.svelte`, evitando conflito com o trabalho paralelo atual.

## Validação

- Testes unitários do ciclo de vida do runtime: início único, navegação interna sem saída, cancelamento explícito e limpeza final.
- Testes do controlador de fila para polling único e transição `waiting -> matched`.
- Testes de reconexão e preservação do snapshot ao desmontar/remontar a apresentação.
- `npm run check`.
- Testes focados do Online e, ao final, `npm run validate` se as alterações paralelas estiverem em estado compatível.
- Verificação em navegador: entrar na fila, navegar por Time/Loja/Conta, confirmar heartbeat e retornar a Jogar sem reload; repetir durante sala ativa e conferir ausência de erros no console.

## Fora de escopo

- Alterações visuais ou novos indicadores.
- Persistência de formulário não salvo entre páginas.
- Mudanças no matchmaking ou nos tempos da fila.
- Mudanças de protocolo ou backend.
- Deploy.
