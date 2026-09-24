# Velocidade manual contra bots e acordo de velocidade na final da fila

## Objetivo

Permitir que uma partida solo contra bots comece em modo manual ou automático, com velocidade escolhida pelo jogador, e permitir que a Grande Final de uma partida da Fila use velocidade Normal quando os dois finalistas humanos concordarem. Revisar os cartões de entrada para evitar conteúdo cortado em diferentes larguras de tela.

## Contexto atual

- O endpoint de partida solo cria uma sala com a mesma origem das partidas da Fila e usa a configuração automática/Ultra.
- A sala da Fila bloqueia alterações de velocidade e modo de simulação.
- Partidas por código já permitem modo manual/automático e velocidades Normal, Rápida e Ultra.
- Os controles manuais existentes esperam decisões do jogador e o comando de avançar rodada.
- A grade dos cartões da entrada muda para três colunas a partir de 680 px, o que pode comprimir os cartões em larguras intermediárias.

## Comportamento aprovado

### Partida solo contra bots

- Antes de iniciar, o jogador escolhe modo Manual ou Automático e velocidade Normal, Rápida ou Ultra.
- A partida começa com essas escolhas aplicadas no servidor.
- No modo Manual, o torneio aguarda o jogador iniciar cada rodada e responder às decisões já existentes no jogo.
- No modo Automático, o torneio avança sozinho na velocidade escolhida.
- As opções e os estados recebem traduções em português, inglês e espanhol.

### Grande Final da Fila

- A velocidade padrão continua em Ultra e o modo continua Automático.
- O controle de voto aparece apenas para os dois finalistas humanos que se enfrentam na Grande Final.
- A velocidade muda para Normal quando os dois finalistas confirmarem Normal.
- Se apenas um confirmar, ou se qualquer finalista for bot, a velocidade permanece em Ultra.
- O acordo afeta o restante da série da Grande Final; outras fases e partidas continuam em Ultra.
- A decisão é aplicada pelo servidor e enviada aos dois clientes no estado sincronizado da sala.

### Cartões e responsividade

- Preservar a hierarquia visual existente dos cartões de busca, solo contra bots e sala de amigos.
- Ajustar a grade conforme o espaço real disponível, sem comprimir os cartões em telas intermediárias.
- Conferir títulos, descrições, botões e controles sem cortes ou rolagem horizontal em telas de celular, tablet e desktop.

## Abordagem escolhida

Adicionar preferências à criação de partida solo e aplicar a configuração no servidor antes do primeiro avanço da simulação. Para a Fila, armazenar votos de velocidade Normal associados aos finalistas humanos da série final; somente o voto dos dois finalistas altera a velocidade autoritativa da sala. O servidor verifica fase, identidade dos finalistas e elegibilidade em cada voto.

As alternativas consideradas foram deixar cada cliente controlar sua própria velocidade, o que dessincronizaria a partida, ou dar controle exclusivo ao host, o que não exige o acordo dos dois jogadores. A votação server-side preserva um estado igual para ambos e segue a regra pedida.

## Fora de escopo

- Alterar velocidades de partidas nas fases anteriores da Fila.
- Permitir modo Manual em partidas competitivas da Fila.
- Modificar regras de pontuação, duração das séries, decisões de jogo ou o resultado da simulação.
- Redesenhar a identidade visual da página.

## Critérios de aceite

1. O jogador consegue iniciar uma partida contra bots em modo Manual ou Automático e escolher Normal, Rápida ou Ultra.
2. No modo Manual solo, nenhuma rodada avança sem a ação do jogador; as decisões existentes continuam disponíveis.
3. Uma partida competitiva da Fila continua em Ultra até que os dois finalistas humanos da Grande Final confirmem Normal.
4. Um voto único, um finalista bot, ou um jogador eliminado não muda a velocidade da Grande Final.
5. Os dois clientes exibem a mesma velocidade depois do acordo.
6. As duas áreas principais do screenshot cabem nas larguras testadas sem corte de conteúdo nem rolagem horizontal.
7. A interface de configuração tem rótulos em português, inglês e espanhol.

## Verificação prevista

- Testes de servidor para preferências solo, elegibilidade dos votos, consenso, finalistas bot e fases anteriores à final.
- Teste de interface para os controles de modo/velocidade e estado de espera pelo segundo voto.
- Verificação visual nos viewports 320, 375, 390, 768, 900, 1280 e 1440 px, incluindo o estado autenticado que mostra o cartão solo.
