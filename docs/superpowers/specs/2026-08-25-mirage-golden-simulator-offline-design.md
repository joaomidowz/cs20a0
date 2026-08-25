# Simulador Ouro de Mirage no Replay Offline

## Objetivo

Reproduzir no replay offline de Mirage o visual e a sensação de movimento do
`tests/simulator.html`: radar real como fundo, jogadores e visão sobre o mapa,
tiros, granadas, fumaças, fogo, bomba, kill feed, HUD lateral e linha do tempo.
O grafo continua sendo dado interno para planejamento, mas não será desenhado
como substituto do mapa.

## Escopo desta entrega

- Mirage usa exatamente a imagem, a grade de colisão e a linguagem visual do
  HTML ouro.
- O calibrador, os controles de marcação, o armazenamento de calibração e toda
  edição de posições ou utilitárias ficam fora do produto.
- Ancient, Anubis, Cache, Dust II, Inferno e Nuke continuam usando o viewer
  atual até existirem radares e grades equivalentes para cada um.
- A mudança permanece somente no singleplayer/offline. Não altera protocolo,
  servidor online, deploy ou relógio de sala.
- `tests/simulator.html` permanece intacto e não é incorporado como iframe.

## Fonte visual e de navegação

A imagem `MAP_IMG`, a grade `GRID_B64`, as dimensões de mundo, spawns, sites,
callouts, pontos táticos e parâmetros de desenho de Mirage serão extraídos do
HTML ouro para módulos TypeScript versionados. O Canvas do produto desenhará o
radar real primeiro e, por cima, os mesmos elementos visuais do protótipo.

O motor reaproveitará a grade de colisão e o pathfinding do protótipo para que
os jogadores ocupem e atravessem apenas áreas válidas do radar. O grafo atual
de Mirage será usado para decisões de alto nível, como escolher site, rota e
papel tático; ele não ficará visível.

## Integração com a simulação oficial

O resultado já produzido pela campanha continua autoritativo. Cada plano de
round recebe explicitamente a organização vencedora definida em `MapResult`.
O motor físico encena o round com esse objetivo e valida, ao terminá-lo, que o
vencedor visual é o mesmo vencedor oficial. A replay nunca recalcula o placar
da campanha e nunca altera as estatísticas oficiais.

A geração permanece determinística: mesma seed, série, mapa e estilos geram a
mesma economia, movimentação, utilitárias, mortes, recolhimentos e frames.

## Estilos de organização

O perfil pertence à organização e afeta seu comportamento nos dois lados.

### Tático

- Favorece defaults, execuções mais tardias e rounds mais longos.
- Usa mais sequências coordenadas de smoke, flash e molotov.
- No lado CT, aumenta protocolos sincronizados de domínio e batidas em grupo.
- Espera utilitárias e cobertura antes de liberar o entry pelo choke.

### Agressivo

- Favorece execuções antecipadas, rushes, disputas de meio e batidas CT.
- Aumenta flashes de entrada e de retomada, sem remover smokes.
- Reduz tempos de staging e aproxima rapidamente os jogadores responsáveis
  pelo trade.

### Equilibrado

- Mantém a mistura e a cadência-base do HTML ouro.
- Alterna execuções, defaults, splits, domínio de meio e agressões CT sem
  concentrar as probabilidades em um único comportamento.

O estilo muda escolhas e tempos, não concede teleporte, invulnerabilidade ou
vitória automática.

## Funções dos jogadores

- `entry`: lidera a entrada e é o primeiro do grupo a cruzar o choke; os
  companheiros aguardam e preservam distância de trade.
- `lurker`: joga separado do grupo principal, trabalha as costas e chega mais
  tarde à zona decisiva. No pós-plant ou retake, fecha rota de rotação.
- `awper`: prioriza comprar, receber, recolher e usar AWP; procura ângulos mais
  longos e evita ser tratado como rifler de entrada.
- `igl`: prioriza a economia coletiva. Compra e entrega armas ou melhorias
  necessárias aos companheiros antes de completar o próprio equipamento,
  aceitando jogar com arma inferior quando o dinheiro do time exigir.
- `support`, `trade` e `rifler`: preservam as responsabilidades já presentes no
  HTML ouro para utilitárias, segunda entrada e cobertura.

As funções escolhidas no draft (`selectedSlotRole`) são a fonte; um híbrido é
representado pela função escolhida pelo usuário naquela run.

## Economia, corpos e itens no chão

Armas e utilitárias restantes viram itens no chão quando um jogador morre. Um
jogador só pode recolher um item ao passar fisicamente sobre a posição da
morte, respeitando limite de arma e de granadas.

O recolhimento segue estas prioridades:

1. Trocar a arma atual por uma arma objetivamente melhor para a função.
2. Um AWPer recolhe uma AWP disponível.
3. Qualquer companheiro pode carregar uma AWP até o fim do round se o AWPer do
   time precisar recebê-la no round seguinte.
4. Recolher rifles melhores, como M4A1/FAMAS encontrados pelo lado T, quando a
   troca melhorar o equipamento atual.
5. Completar slots livres de smoke, flash, HE ou molotov encontrados no corpo.

Armas preservadas por sobreviventes passam ao round seguinte. Na freeze time,
o carregador entrega a AWP ao AWPer e o IGL coordena as compras e entregas antes
de adquirir o próprio equipamento.

## Reprodução

- Normal reproduz o relógio interno a `4x`.
- Rápido reproduz a `8x`.
- Ultra salta imediatamente para o estado final do round.
- Trocar a velocidade é local ao viewer e não muda seed, eventos, resultado ou
  avanço da campanha.

## Componentes e responsabilidades

- Um módulo de dados de Mirage guarda imagem, colisão e pontos canônicos.
- Um núcleo puro de simulação produz frames e eventos determinísticos.
- Um módulo de economia mantém dinheiro, armas, granadas, compras, drops,
  recolhimentos e entregas entre rounds.
- Um módulo tático escolhe playbooks a partir de mapa, lado, estilo e função.
- O componente Svelte reproduz os frames e replica a apresentação do HTML,
  sem conter regras de simulação.
- O viewer atual permanece como fallback explícito para os seis mapas ainda sem
  radar real.

## Falhas e garantias

- Dados visuais ou de colisão ausentes em Mirage são erro de desenvolvimento;
  o app não inventa uma geometria alternativa silenciosamente.
- Um plano cujo vencedor visual não coincide com o oficial é rejeitado em
  teste e não pode substituir o resultado da campanha.
- Rotas inválidas não podem atravessar células bloqueadas.
- Itens nunca são recolhidos à distância e não podem ultrapassar os limites de
  inventário.

## Validação

- Teste de checksum garante que imagem e colisão foram extraídas sem alteração.
- Testes determinísticos cobrem os três estilos e suas diferenças de cadência,
  rush, disputa de meio, smokes, flashes e protocolos CT.
- Testes cobrem entry à frente, lurker separado, AWPer com AWP, sacrifício
  econômico do IGL, drop, recolhimento, transporte e entrega no round seguinte.
- Todos os rounds gerados devem terminar com o vencedor oficial.
- Testes do clock comprovam `4x`, `8x` e Ultra instantâneo.
- Teste de integração comprova que apenas Mirage usa o simulador ouro.
- Verificação em Chromium compara visualmente o produto com o HTML em desktop e
  mobile e confirma ausência de erros no console.
- Gate final: `npm run check`, `npm test`, `npm run build` e
  `npm run server:build`.
