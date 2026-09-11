# Swiss justo, veto MD5 oficial, pausa por modo com janela e times secretos

## Problemas

- **Humanos sempre se pegavam na rodada 1 do Stage 3 online.** Os seeds seguiam a ordem de entrada e o pareamento minimizava a distância de seed (1v2, 3v4…).
- **Seeding dos playoffs invertido.** Buchholz vinha antes das derrotas; como todo classificado tem três vitórias, um 3-2 (soma de cinco adversários) passava na frente de um 3-0.
- **Veto de MD5 com bans preliminares.** O pool tinha todos os mapas em comum (até 11) e o time A podia agir duas vezes seguidas.
- **Pausa tática plana.** +5% em qualquer fila e a qualquer momento.
- **Sem times secretos** para os amigos da Resenha.

## Swiss e seeding (`src/lib/game/online/tournament-engine.ts`)

- `standingOrder`: vitórias, **derrotas**, Buchholz, seed. A mesma cadeia em `getStandingsAfterRounds` e `computeStandings`. A chave (`1v8, 4v5, 2v7, 3v6`) não mudou: 3-0 melhor pega o 3-2 pior e os invictos só se encontram na final.
- `findPairings`: dentro de cada grupo de campanha, metade de cima contra metade de baixo (1v9, 2v10… na rodada 1; melhor Buchholz contra pior depois).
- `seedOrder` nas opções do motor e `drawHumanSeeds(seed, humanos, campo)`: o servidor sorteia os seeds dos humanos pela seed da sala (`createRoom` aceita uma seed explícita para testes). Solo, campanha e Sandbox seguem com o usuário no seed 1, que agora enfrenta o seed 9.

## Veto (`src/lib/game/map-veto.ts`)

`getVetoAvailableMaps` devolve exatamente 7 mapas: os mais familiares para a dupla quando há mais em comum, complemento unilateral quando há menos. `buildVetoPlan` alterna sempre por `plan.length`. MD5 = ban, ban, pick, pick, pick, pick e decider.

## Pausa tática (`src/lib/game/rounds.ts`)

- `TIMEOUT_BONUS_BY_MODE`: Normal e Ranked +3%, PRO +8%, Resenha e Resenha Máxima +10%.
- Janela de 2 a 4 derrotas seguidas na metade (`consecutiveLosses`, zera na vitória e no intervalo): dentro dela o bônus é cheio; antes ou depois vale um terço. O momentum do adversário zera em qualquer pausa. Bots pausam com quatro derrotas seguidas.
- `OnlineGameMode` passou para `types.ts` e chega ao `MapState` por `LiveSeriesConfig.mode` e `MapSimulationContext.mode`; o servidor envia o modo real da sala.
- `RoundDetail.timeoutTiming` e a decisão de pausa registram `window | early | late`. `TimeoutButton` só pulsa a borda em laranja na janela (mesmo texto e tamanho; a explicação fica na dica ao passar o mouse); feed e faixa de rounds mostram o rótulo do timing depois do round.

## Times secretos (`src/lib/game/online/secret-players.ts`, protocolo 8)

- Pool do Vargão Academy: Raf4Moon (rifler 98), Th4natos (AWPer 97), Midowz (lurker 98), Vargas (IGL/AWPer 99), MonesyPrime (entry 98), H1ro (AWPer 97), Caiozera (rifler 97), Gveds (lurker 98), Kavzera (AWPer 99), Andi (rifler 96), Potassio (rifler 98) e ntc (IGL 89 com mental 20). Time escondido PolexTV: Polex (AWPer), Caps (rifler), Paulinhho (entry), Nerdzito (suporte) e Breitan (lurker), todos 99. Clones de `topPlayersByRole` com id `secret-<slug>` e sobrescrita de overall/atributos, só em `playerById` (dados e hash intactos).
- `SECRET_ORGANIZATIONS`: Vargão Academy (`pick`, até 3 do próprio pool) e PolexTV (`team`, a line inteira já vem preenchida no início do draft; só falta escolher os mapas). Cada apelido por nome de jogador continua trazendo o próprio jogador.
- Só nas filas `fun` e `max_fun`: no `start` (e no rematch) o nome do jogador ou da organização pré-preenche uma vaga. A organização "Vargão Academy" (sem acento também) escolhe até três pelo painel "Time secreto" com o comando `pick-secret`.
- `self.secretPicksLeft` e `capabilities.secretPlayers` no snapshot; badge SECRET no card e no HUD. Cada apelido tem uma única posição (Vargas joga de IGL ou AWPer) e overall fixo: Vargas 99, Raf4Moon/Midowz/MonesyPrime/Gveds 98, Th4natos/H1ro/Caiozera 97.

## Calibração de estatísticas (`rounds.ts`, `majorAwards.ts`)

- Multi-kills por round: 3K em ~20% dos rounds, 4K em ~2,5%, ace um a cada ~500 rounds (`HOT_HAND`; estrelas 95+ mantêm a mão mais quente com `STAR_HOT_HAND`). Clutches 1v3+ só vingam numa fração dos sorteios (`CLUTCH_ACCEPTANCE`: 1v3 35%, 1v4 14%, 1v5 5%).
- Peso por função no feed (`ROLE_KILL_FACTOR`): entry e lurker acima de rifler; AWP com bônus menor; IGL e suporte abaixo.
- Rating HLTV 1.0 comprimido em 70% em torno de 1,00 (`RATING_SPREAD`): média 1,00, estrelas 1,10–1,20, MVP ~1,30, 1,40 só em campanhas geracionais.
- O último round de cada mapa toca o feed 60% mais devagar (`LAST_ROUND_FEED_FACTOR`) antes de o mapa fechar, no cliente e no ritmo do servidor.

## Economia e kill feed no estilo CS2 (`rounds.ts`, `killfeedIcons.ts`)

- Loss bonus 1.400 → 3.400 em degraus de 500, descendo um nível por vitória; TR que perde o pistol começa em 1.900; TR que perde por tempo sem plantar só recebe o bônus pelos jogadores que morreram; o dinheiro de plant só entra quando a bomba foi desarmada.
- Quem sobrevive segurando a AWP mantém a arma no round seguinte sem pagar (`awpHolderId`, `TeamEconomy.awpKept`), inclusive em eco e forçado; a posse é perdida ao morrer, no intervalo e no início de cada bloco de prorrogação.
- No forçado, o time dropa o único rifle para a estrela (maior peso de frag) em 60% dos rounds.
- Cada kill pode carregar `noscope` (só AWP), `blind`, `wallbang`, `smoke`, `airborne`, `assistId/Name` (36%, suportes e IGLs mais prováveis) e `flashAssistId/Name` (11%). `killfeedIcons.ts` desenha os glifos (headshot, sem mira, cego, varado, pela smoke, no ar, assistência, assistência de flash) usados por `RoundFeed` e pelo cartão de round da `RoundStrip`, com o nome de quem assistiu ao lado do autor.
