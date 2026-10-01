# Major mobile compacto — design

## Objetivo

Fazer a partida de um Major caber na primeira dobra de um celular de 375 × 812 px: contexto da fase, configuração aplicável, placar atual, rounds e os três mapas precisam aparecer sem rolagem horizontal da página. O detalhe de kills continua disponível sob demanda.

## Escopo aprovado

- Aplicar a adaptação ao viewer compartilhado por online, offline, Dinastia e Sandbox.
- Preservar a composição desktop e todas as regras de simulação.
- Na fila online, remover os controles de avanço e velocidade que não podem ser alterados; manter apenas o estado da fila, a engrenagem e a votação final quando elegível.
- Nos modos editáveis, usar uma barra compacta, com no máximo duas linhas no Sandbox.
- Abrir detalhes de round em bottom sheet no celular; no desktop, manter o detalhe inline.
- Deixar coleção, loja e cards de draft fora deste trabalho.

## Composição mobile

O cabeçalho grande vira uma faixa compacta com fase, nome do time e campanha. A barra de controle não repete rótulos acima de cada grupo. O card da série mantém os nomes dos times, o placar do mapa, uma régua horizontal de rounds e uma faixa de três mapas.

O feed de kills continua montado para que seus temporizadores e `onRoundResolved` avancem normalmente, mas no celular aparece apenas como uma ação de resumo do round atual. Essa ação e cada marcador da régua abrem o mesmo bottom sheet.

Os mapas usam três colunas em MD3, com nome legível, placar e estado. Metadados de baixa prioridade são ocultados no celular em vez de reduzidos para fontes abaixo de 11 px. A lista nunca volta para uma coluna única abaixo de 400 px.

## Detalhe do round

O sheet mostra round, placar, vencedor, economia, lados, tags e kills. Ele fecha por botão, backdrop e Escape, prende o foco enquanto aberto, bloqueia o scroll do corpo e devolve o foco ao controle acionador. Safe area inferior é respeitada. Em desktop o mesmo conteúdo permanece inline para não alterar o fluxo existente.

## Responsividade e acessibilidade

- Breakpoint do viewer: `max-width: 679px`.
- Sem overflow horizontal global em 320, 375 e 430 px.
- Controles primários e sheet usam alvos de pelo menos 44 px; a régua de rounds pode rolar horizontalmente.
- O sheet usa `role="dialog"`, `aria-modal="true"`, título associado e anúncio adequado do round.
- Movimento reduzido remove entradas do sheet e rolagem animada sem eliminar estados.

## Critérios de aceite

1. Em 375 × 812, com o início do conteúdo da partida no topo, cabeçalho, controles, placar, régua e três mapas aparecem na mesma dobra.
2. Uma sala originada de fila não renderiza segmentos de avanço ou velocidade.
3. Abrir e fechar um round não desloca o restante da partida no celular.
4. O desktop continua com controles completos, feed inline e detalhe inline.
5. `svelte-check`, testes, build e detector do Impeccable passam sem regressões novas.

