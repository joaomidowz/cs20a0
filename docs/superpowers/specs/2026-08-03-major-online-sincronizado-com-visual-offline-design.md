# Major online sincronizado com visual offline

## Objetivo

Substituir a experiência visual online paralela pelo mesmo fluxo do modo solo. O servidor será o relógio autoritativo de cada round de Counter-Strike, garantindo que dois participantes no mesmo confronto vejam o mesmo mapa, round e placar.

## Sincronização

- Todos os confrontos da rodada do torneio começam juntos e avançam em paralelo.
- O servidor mantém rodada do torneio, série, mapa, round visível, placar de mapas e estado da execução.
- Normal usa 2400 ms por round, Fast 1200 ms e Ultra 200 ms.
- No automático, a próxima rodada do torneio começa após 900 ms.
- No manual, somente o host inicia a próxima rodada; os rounds da série continuam automáticos.
- Mudar a velocidade reagenda o tick seguinte.
- Não existe avanço ou skip individual.
- Reconectados saltam diretamente ao cursor atual.

O snapshot nunca transmite resultados futuros, rounds ocultos ou vencedor de uma série ainda não concluída. Partidas de terceiros expõem somente placar de mapas e status.

## Experiência visual

O lobby continua específico do online. Depois dele:

- Normal, Ranked e PRO reutilizam `PlayerCard`, `DraftHud`, modais e etapas do solo.
- O draft acrescenta apenas conexão, deadline e progresso dos participantes.
- `SeriesViewer` preserva markup e CSS; no solo usa timers locais e no online renderiza o cursor do servidor.
- A tela Major reutiliza topbar, controles, campanha, timeline e resultado do solo.
- `Minha partida` mostra a série própria round a round.
- `Visão do Major` mostra tabela W-L/Buchholz e placares de mapas no Stage 3; nos playoffs, mostra a bracket ao vivo.
- Após eliminação, o participante assiste automaticamente ao confronto de outro humano ativo com melhor seed; se não houver, ao confronto ativo de melhor seed.
- A Home mantém `Jogar online` abaixo de `Jogar`.

## Paridade final de frontend

- A tag `MULTIPLAYER` identifica entrada, lobby, draft, Major e relatório final sem criar uma linguagem visual paralela.
- `PlayerDetailSheet` e `OrganizationRosterModal` são compartilhados pelos modos solo e online; regras, atributos, posições disponíveis e motivos de bloqueio vêm do mesmo domínio puro.
- Depois do draft, nomes de organizações nas partidas, timeline, tabela e bracket abrem a ficha completa da escalação humana ou histórica.
- O snapshot público expõe escalações somente depois do draft. O relatório e as estatísticas finais de cada participante permanecem privados em `selfResult`.
- Cada participante pode baixar apenas o próprio card final, com organização, campanha, lineup, MVP e a tag `MULTIPLAYER`.
- Essas adições são de apresentação e contrato público; seed, RNG, pareamentos, poder, resultados e ritmo de simulação não são alterados.

## Regras de controle

- O host controla automático/manual e velocidade.
- Trocar para automático durante espera agenda a próxima rodada.
- Trocar para manual durante uma série não interrompe o confronto atual; afeta a próxima rodada do torneio.
- Se o host desconectar, o participante conectado mais antigo assume os controles.
- Revanche é proibida dentro do suíço, mas pode ocorrer entre Stage 3 e playoffs.

## Aceitação

- Dois clientes no mesmo confronto recebem o mesmo cursor em todos os snapshots.
- Ultra revela rounds a cada 200 ms, sem concluir instantaneamente uma série inteira.
- Resultados futuros não aparecem no payload.
- Stage 3 apresenta tabela e confrontos; playoffs apresentam bracket atualizada mapa a mapa.
- Partidas próprias preservam detalhes de rounds; partidas gerais não.
- Draft, Major e resultado têm paridade visual com o modo solo em desktop e mobile.
- Cards bloqueados e seletores de posição reproduzem os mesmos estados e explicações do modo solo.
- Todos os times exibidos após o draft abrem a mesma ficha de organização e elenco.
- O card final individual pode ser baixado sem expor estatísticas privadas de outro participante.
- Validação inclui WebSocket com 2 e 16 clientes, carga com 10 salas de 16, reconexão, migração de host, build Docker e navegador multi-contexto.

O deploy publica primeiro o servidor Railway e depois o frontend Vercel; a flag `PUBLIC_ONLINE_ENABLED` continua sendo o rollback imediato do frontend.
