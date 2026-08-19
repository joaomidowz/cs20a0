# Replay Canvas 2D offline — design

## Objetivo

Adicionar ao singleplayer um replay tático determinístico por mapa, renderizado em Canvas 2D a partir dos sete grafos fornecidos pelo usuário. A entrega não altera servidor, protocolo, Railway, Vercel ou a fonte oficial das estatísticas.

## Fonte de verdade dos mapas

As listas `*.topology.txt` fornecidas pelo usuário são fixtures imutáveis. Cada linha declara um nó nomeado, seu tipo, coordenada esquemática e suas adjacências. O compilador trata `A -> B` como aresta não direcionada e rejeita destino inexistente, duplicata, assimetria, self-loop ou grafo desconectado.

As imagens JPEG são referências de orientação e revisão visual. Elas não entram no runtime nem criam arestas. Uma camada separada de anotações visuais preserva a orientação mostrada nas sete imagens — inclusive T à direita no Cache e T à esquerda no Nuke — sem editar as fixtures ou sua topologia.

Cada nó pode carregar um `shape` opcional com vértices em coordenadas de mundo. Os polígonos das salas principais são anotações aditivas derivadas das imagens; quando ausentes, o gerador mantém o retângulo arredondado. A lista de vértices não participa da conectividade do grafo.

Todos os nós começam em `level: 0`, exceto a estratificação autoritativa de Nuke:

- `level: 0`: `ct_spawn`, `hut`, `heaven`, `a_site`, `ramp`, `garage`, `outside`, `silo`, `t_spawn`, `squeaky`;
- `level: -1`: `b_site`, `ramp_lower`, `double_doors`, `vents`, `secret`;
- transições verticais: `ramp <-> ramp_lower`, `a_site <-> vents`, `outside <-> secret`, `t_spawn <-> secret` e `ct_spawn <-> double_doors`.
- a correção do usuário acrescenta `outside <-> secret` à lista sem remover `t_spawn <-> secret`, totalizando 20 arestas em Nuke.

Nós auxiliares podem desviar linhas no radar, mas nunca representam uma nova adjacência entre callouts nomeados.

## Replay autoritativa offline

Cada mapa jogado recebe um `ReplayPlanV1` identificado por `seriesId + mapIndex`. No ciclo offline, o plano é criado localmente a partir do `SeriesResult` já determinístico; a futura ativação online poderá mover o mesmo produtor para o servidor sem mudar o formato.

O plano contém placar final, vencedor, organizações, lados por round, duração, rotas em callouts, loadouts e eventos discretos. O navegador expande o plano para `ReplayV1` a 4 Hz. Frames guardam posição e estado contínuo; tiro, dano, kill, granada, plant, defuse, explosão e fim do round permanecem eventos separados.

Cada round declara `tSplit` (`5-0`, `4-1`, `3-2` ou `2-1-2`), `ctSetup` com cinco jogadores distribuídos entre A/B/mid e `executeAtMs` com jitter determinístico. Jogadores recebem papel tático (`entry`, `trade`, `support`, `awp`, `lurk` ou fallback `rifler`); as rotas carregam atraso e dispersão de parada. Entry e trade compartilham a rota principal com separação temporal, lurk usa outra lane com 6–10s de atraso e AWP procura um nó `angle`. Sem AWP, riflers avançam; sem lurk, support herda a rotação tardia.

O viewer limita a reprodução aos rounds já revelados pelo `SeriesViewer`. O plano completo pode existir em memória no singleplayer, mas o HUD e o Canvas não mostram frames ou eventos futuros. Ao montar, o viewer entra no round mais recente. Depois disso, seguir a ponta significa enfileirar novos rounds: chegada de dado nunca interrompe o round ativo, e a promoção só ocorre depois que o frame contendo `round-end` foi desenhado. Scrub ou troca manual de round ativa o estado atrasado e oferece `Voltar ao vivo`.

A fila mantém a janela normal com até dois rounds pendentes. Com três ou mais, a janela dos próximos rounds é reduzida proporcionalmente até a janela rápida. Acima de seis pendentes, a promoção feita entre rounds descarta os intermediários e inicia o penúltimo round da fila, deixando o último pendente. O intervalo médio das últimas chegadas limita a janela adaptativamente para evitar acúmulo sem alterar a simulação.

## Autoridade e velocidades

`simMode` e `simSpeed` continuam controlando apenas o avanço da campanha offline. O viewer tem `ReplayPlaybackSpeed` local e não altera a simulação, o resultado ou qualquer comando WebSocket. O tempo lógico permanece no plano, mas cada round é comprimido individualmente: `normal` ocupa no máximo 8s reais, `fast` no máximo 3s e `ultra` desenha o estado final sem loop. A janela efetiva é `min(janela base, intervalo médio entre rounds recebidos)` e fica congelada enquanto o round está em reprodução. O fator é `duração lógica / janela efetiva`; a revelação do próximo round não espera o Canvas.

`prefers-reduced-motion` inicia o viewer em `ultra`. A animação pausa com a aba oculta.

## Canvas e DOM

O componente Svelte monta dois canvases:

- base: planta baixa preenchida compilada do grafo, com corredores largos, salas, contorno contínuo, níveis, sites, spawns e callouts;
- live: jogadores, visão, granadas, tiros, bomba e mortes.

Placar, cronômetro, feed, controles, scrub e tabela ficam no DOM. O núcleo TypeScript independente implementa clock, interpolação, transformação, pan/zoom, hit-testing e desenho. O DPR é limitado a 2.

## Estatísticas em sombra

`createRunStats` permanece oficial. O agregador de eventos produz estatísticas da replay e um relatório de reconciliação contendo valor legado, valor derivado, diferença, versão das regras e motivo conhecido.

O produtor emite múltiplos eventos de dano por vítima, incluindo dano não letal e contribuição de assistência. O agregador consome somente esses eventos, limita dano ao HP restante, ignora dano posterior à morte, ordena eventos simultâneos de forma estável, calcula dano de granada por vítima, evita dupla contagem, aplica assistência por dano com janela temporal e registra flash assist separadamente. Uma invariante de teste falha caso todos os danos não nulos de uma partida sejam múltiplos de 100.

Não haverá promoção para `events` neste ciclo offline.

## Critérios deste ciclo

- As três asserções topológicas passam nos sete mapas.
- O mesmo grafo e seed produz o mesmo hash de radar.
- A planta base não desenha círculos de nós nem linhas finas de aresta; círculos representam somente jogadores.
- Cache e Nuke respeitam a orientação das imagens sem mudar adjacências.
- Polígonos opcionais são desenhados quando existem e o fallback retangular continua coberto.
- O mesmo `ReplayPlanV1` produz serialização e hash idênticos em duas expansões.
- Replay, placar, vencedor e troca de lados não se contradizem.
- Interpolação, granadas, mortos, bomba, scrub, pan, zoom e hit-testing têm testes públicos.
- O singleplayer permite abrir apenas o mapa atual ou concluído.
- O viewer abre no round mais recente e cobre o fluxo atrasado → voltar ao vivo.
- Cada round lógico cabe em até 8s/3s reais, adapta-se ao ritmo de chegada e as rotas mantêm distribuição por split/setup/papel.
- Todo round iniciado desenha seu `round-end` antes de qualquer promoção automática da fila.
- O modo online e seu protocolo permanecem inalterados.
- `npm run check`, `npm test`, `npm run build` e `npm run server:build` passam localmente, sem deploy.
