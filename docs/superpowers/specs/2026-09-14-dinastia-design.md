# Dinastia: modo de continuidade com coach, mercado, três estágios e Rating 3.0

## Problema

A campanha offline acaba na tela de resultado. "Mesmo time, novo Major" repete o Major com o mesmo elenco e sem consequência: não há prêmio, mudança de elenco nem histórico. Não existe coach, dinheiro nem valor de jogador. O dataset tem 1430 versões de jogador por ano (713 com a versão do ano seguinte presente) e 286 times com `tier`, mas o campo do Major é sorteado sem olhar tier e o Major começa sempre no Stage 3.

As estatísticas são sintéticas: ADR e impact derivam do rating 1.0 com ruído; as assistências existem no kill feed (`assistId`, `flashAssistId`) mas não aparecem; não há KAST, trocas nem Round Swing.

A referência de mercado (Road to Major, `roadtomajor.com.br`) tem coach, janela de transferências e temporada. O nosso diferencial é o dataset por ano e o motor de rounds com decisões ao vivo. Este documento desenha o modo **Dinastia**, que usa esse diferencial.

## Decisões

- **Quarto modo** `dynasty` ("Dinastia", "Dynasty", "Dinastía") na tela de fila, ao lado de Normal, Ranked e PRO. Atributos visíveis como no Normal. Só ele tem coach, janela e três estágios. Normal, Ranked e PRO não mudam de comportamento nem de balanceamento.
- **Coaches reais**, com dataset novo produzido no studio a partir da Liquipedia.
- **Dinheiro em dólar, inteiro**, sem centavos. Toda fórmula arredonda a 5.000 antes de guardar.
- **Mercado**: 10 ofertas sorteadas por seed mais 1 alvo livre do catálogo com ágio.
- **Evolução**: versão do ano seguinte quando existe; senão deriva pelo rating no Major e pelo coach.
- **Major em três estágios suíços** com campos por tier, entrada definida pelo Major anterior.
- **Save local único**, sem login. O histórico da dinastia fica no mesmo save do navegador.
- **Rating 3.0 aproximado, Round Swing, assistências e dano de utilitário** entram como entrega D e valem para todos os modos offline.

## Modo e fluxo (`src/routes/+page.svelte`, `src/lib/game/store.ts`, `src/lib/game/i18n.ts`, `src/lib/game/teamViews.ts`, `src/lib/game/maps.ts`)

`GameMode` ganha `'dynasty'`. O `store` inclui o modo no conjunto válido, cria `dynasty` no `defaultState` quando o modo é escolhido e normaliza saves antigos: sem o bloco `dynasty` carrega como hoje; modo desconhecido cai para `premier`. A tela de fila ganha o quarto card, com descrição em pt-BR, en e es. `teamViews` mostra atributos quando o modo é `premier` ou `dynasty`. A dificuldade dos mapas em `maps.ts` para `dynasty` é a do Normal.

Fluxo de um Major na Dinastia:

1. **Draft** igual ao Normal: cinco oportunidades, um jogador por time sorteado, estilo da organização.
2. **Coach** (entrega B): fase nova `coach-draft` depois da 5ª escolha. A roleta oferece 3 coaches sorteados com a seed `${seed}:coach:${usedTeamIds}`, só entre coaches não `placeholder` e de times ainda não usados no draft, com pelo menos um de overall 80 ou mais; 1 ressorteio troca os 3. O card mostra nome, time e ano, os quatro atributos, overall e raridade. Antes da entrega B o Dinastia joga sem coach.
3. **Seleção de mapas** como hoje.
4. **Major** em três estágios e playoffs (seção própria).
5. **Resultado**: o prêmio e os bônus entram no caixa uma única vez por Major (`prizeCreditedFor`). O botão "Mesmo time, novo Major" vira "Janela de transferências". Até a entrega C ele se chama "Próximo Major", mantém o elenco e só aplica status e estágio de entrada. "Tentar de novo" encerra a dinastia e pede confirmação, porque apaga o histórico.
6. **Stats** como hoje, com as colunas da entrega D.
7. **Janela** (entrega C), depois seleção de mapas com o pool editável e o próximo Major.

Um cabeçalho fixo mostra, do draft ao resultado: número do Major, status (Challenger ou Legend), títulos, caixa e coach. Com 2 títulos ou mais a dinastia recebe um nome de era ("Era <nome da organização>") e o card compartilhável (`runCard.ts`, `shareImage.ts`) mostra a linhagem: elenco e colocação de cada Major.

## Estado (`src/lib/game/types.ts`)

```ts
interface DynastyState {
  majorNumber: number;                 // 1 no primeiro Major
  cash: number;                        // dólar inteiro
  coachId: string | null;
  status: 'challenger' | 'legend';
  entryStage: 'stage1' | 'stage2' | 'stage3';
  titles: number;
  history: DynastyMajorSummary[];      // um por Major concluído
  playerOverrides: Record<string, PlayerOverride>; // chave: playerId atual no elenco
  window: WindowState | null;
  prizeCreditedFor: number;            // último majorNumber já creditado
}
interface DynastyMajorSummary {
  majorNumber: number; seed: string; entryStage: DynastyState['entryStage'];
  placement: string; prize: number; awardsBonus: number;
  lineup: SelectedPlayer[]; coachId: string | null; movesMade: number;
  stats: PlayerRunStats[];             // os 5 do elenco, como na tela de stats
}
interface PlayerOverride {
  drift: Partial<Record<'firepower' | 'clutch' | 'entry' | 'awp' | 'support' | 'consistency' | 'mental' | 'overall', number>>;
  driftTotal: number;                  // soma assinada dos deltas de overall desde a versão atual
  versionsSince: string[];             // ids das versões anteriores nesta dinastia
}
```

`resolveDynastyPlayer(player, override)` devolve o `Player` com a deriva aplicada, teto 99 e piso 1. Tudo que lê o elenco na Dinastia (força do time, cards, HUD, stats) passa por essa função. O dataset nunca é alterado. Quando o jogador vira a versão do ano seguinte, `selectedPlayers[i].playerId` passa a ser o id da versão nova e a deriva zera.

O histórico guarda resumos e as stats dos 5 jogadores, nunca séries. Um Major acrescenta menos de 4 KB ao save.

## Torneio de três estágios (`src/lib/game/online/tournament-engine.ts`, `campaign-major.ts`, `simulation.ts`, `majorOverview.ts`, `majorAwards.ts`, `runStats.ts`, `runCard.ts`)

O motor já tem `entryStage: 'stage3' | 'playoffs'` e roda um suíço de 16 com 5 rodadas, 8 classificados e 8 eliminados. Ele passa a aceitar `'stage1' | 'stage2'` e uma lista de campos por estágio:

- **Stage 1**: 16 times. Pool: `underdog` e `dangerous-underdog` (181 times hoje).
- **Stage 2**: os 8 classificados do Stage 1 mais 8 times novos. Pool: `playoff-team` e `contender` (68).
- **Stage 3**: os 8 classificados do Stage 2 mais 8 lendas. Pool: `finalist`, `champion`, `S` e `S+` (37).
- **Playoffs**: quartas, semi e final, como hoje.

Os três estágios rodam sempre, mesmo quando a organização do usuário entra no Stage 2 ou 3. O usuário ocupa uma das vagas do grupo que entra no seu estágio. Se um pool não tem times suficientes, completa com o pool vizinho mais forte. Os times são sorteados com `${seed}:dynasty-field:${stage}`, sem repetir o mesmo `id` dentro do Major.

**Gigantes que caem.** Em cada estágio, uma das vagas novas é preenchida por um time do pool do estágio seguinte com probabilidade 50%, e uma segunda com 20%, ambas sorteadas pela mesma seed do campo. A queda é de um degrau só: um time do pool do Stage 3 pode aparecer no Stage 2, e um do pool do Stage 2 no Stage 1, nunca do Stage 3 direto no Stage 1. Quem se classifica avança de estágio em estágio, então um time do Stage 1 pode chegar ao Stage 3 e aos playoffs.

Entrada da organização do usuário:

| Major anterior | Entrada | Status |
|---|---|---|
| Primeiro Major da dinastia | Stage 1 | Challenger |
| Eliminado no Stage 1 ou 2 | Stage 1 | Challenger |
| Eliminado no Stage 3 | Stage 2 | Challenger |
| Playoffs ou melhor | Stage 3 | Legend |

`SeriesResult.phase` ganha `'stage1' | 'stage2'`. Colocações novas: `placementStage1` e `placementStage2`. `MajorRun` ganha `stages?: Partial<Record<'stage1' | 'stage2' | 'stage3', Stage3Result>>` e `entryStage?`; `stage3` continua preenchido para os saves e modos atuais. `majorOverview` mostra a classificação por estágio com um seletor; o card mostra o estágio de entrada e o caminho.

Para Normal, Ranked, PRO, Sandbox e online nada muda: `entryStage: 'stage3'` com o campo atual. Um teste dourado fixa a seed de uma run Normal e compara os resultados de todas as séries antes e depois da mudança, para garantir que a generalização não alterou o consumo do RNG.

## Premiação (`src/lib/game/dynasty/prizes.ts`)

| Saída | Prêmio (US$) |
|---|---|
| Campeão | 500.000 |
| Vice | 170.000 |
| 3º-4º | 80.000 |
| 5º-8º | 45.000 |
| Eliminado no Stage 3 | 20.000 |
| Eliminado no Stage 2 | 10.000 |
| Eliminado no Stage 1 | 5.000 |

Bônus dos jogadores do usuário: MVP do Major 50.000; cada outro prêmio individual em `MajorAwards` 15.000. O caixa começa em zero.

## Coach (`src/lib/game/dynasty/coach.ts`, `src/lib/data/cs/coaches.game.json`)

```ts
interface Coach {
  id: string; name: string; teamId: string; year: number; game: string;
  tactics: number; discipline: number; aggression: number; development: number; // 40–99
  overall: number; rarity: string; source: unknown;
}
```

Efeitos no motor, todos em pontos de plugue existentes:

- **Tática**: multiplicador de força do time em `calculateUserTeamPower` recebe `1 + (tactics − 70) / 2000` (−1% a +1,45%).
- **Disciplina**: `mental` do time recebe `(discipline − 70) × 0,25` (teto 99); o bônus do timeout em `rounds.ts` é multiplicado por `1 + (discipline − 70) / 200`.
- **Agressão**: `sideBias` do lado T recebe `(aggression − 70) / 1000`.
- **Desenvolvimento**: só na janela, na deriva.
- **Afinidade**: 2 jogadores ou mais do mesmo `teamId` do coach dão +1,5% de força; do mesmo nome de organização em outro ano, +0,75%.

Valor do coach: `20.000 × 1,08^(overall − 60)`, arredondado a 5.000, piso 20.000.

## Valor de mercado do jogador (`src/lib/game/dynasty/value.ts`)

- Base: `50.000 × 1,09^(clamp(overall, 60, 99) − 60)`.
- Raridade: common 1,00; rare 1,05; elite 1,12; legend 1,20; superstar 1,30; goat 1,45.
- Função (`role`): awper 1,15; igl 1,10; demais 1,00.
- Títulos: +8% por badge `major-champion`, até +16%.
- Arredondado a 5.000; piso 30.000; teto 2.500.000.

O valor é calculado sobre o jogador resolvido (com deriva). Referências: overall 70 vale 118 mil; 80, 280 mil; 90, 663 mil; 99, 1,44 milhão, antes dos multiplicadores.

## Janela de transferências (`src/lib/game/dynasty/window.ts`, `src/lib/components/DynastyWindow.svelte`, fase `window`)

Seed da janela: `${seed}:window:${majorNumber}`. O `WindowState` é gravado no save, então recarregar reproduz a mesma janela.

1. **Relatório de evolução**: para cada jogador, se virou a versão seguinte, derivou ou ficou estável, com overall antes e depois.
2. **Caixa e limite**: campeão faz até 1 troca; os demais até 2. Troca é 1 saída e 1 entrada. O elenco termina sempre com 5.
3. **Propostas**: 2 propostas por jogadores distintos do elenco, a `valor × fator` sorteado entre 0,85 e 1,10. Vender sem proposta paga 70% do valor.
4. **Mercado**: 10 ofertas com preço `valor × fator` entre 0,90 e 1,15. Candidatos: jogadores cujo `baseId` não está no elenco. Quatro das dez cobrem a função mais fraca do elenco (a posição cujo titular tem o menor overall resolvido); as demais ficam na faixa da média de overall do elenco mais ou menos 8. Mais 1 alvo livre: qualquer jogador com `baseId` fora do elenco, a `valor × 1,25`.
5. **Coach**: manter é grátis; trocar por um de 3 coaches sorteados custa o valor dele.
6. **Confirmar**: o caixa nunca fica negativo; a compra exige caixa após as vendas. O jogador que entra precisa ser elegível para a posição vaga (`roleRules`), ou o usuário reatribui as posições dos 5 na própria janela antes de confirmar. Ao confirmar: aplica evolução e trocas, grava `history`, recalcula `entryStage` e `status`, sorteia nova seed, incrementa `majorNumber` e vai para `map-selection`.

## Evolução (`src/lib/game/dynasty/evolution.ts`)

Roda no início da janela, com o rating de cada jogador no Major (entrega D; até ela, o rating 1.0 atual).

- Se existe jogador com o mesmo `baseId` e `year + 1`, o jogador vira essa versão e a deriva zera. Se a versão nova não é elegível para a posição atual, a janela exige reatribuição.
- Senão, deriva: `delta = clamp(round((rating − 1,00) × 12), −4, +4)`; coach com desenvolvimento 85 ou mais soma 1; 60 ou menos subtrai 1. Veterano (experience 94 ou mais): teto +1 e piso −5.
- O delta se aplica a firepower, clutch, entry, awp, support, consistency, mental e overall, com teto 99. Experience sobe 1 por Major (teto 99). Igl não muda.
- `driftTotal` fica entre −12 e +12 dentro da mesma versão; o excedente é descartado.

## Rating 3.0, Round Swing e stats (entrega D; `src/lib/game/rating.ts`, `runStats.ts`, `majorAwards.ts`, tela de stats)

Tudo sai do kill feed por round (`RoundDetail.kills`: ordem, segundo, lado, arma, headshot, assistência e flash), sem mudar o resultado dos rounds.

Por jogador e série: kills, deaths, assistências, flash assists, opening kill e opening death (primeira kill do round), morte trocada (o assassino morre em até 5 s), KAST (% de rounds com kill, assistência, sobrevivência ou troca), multi-kills 2K a 5K, clutches (já existem), dano e Round Swing.

- **Dano**: cada kill vale 100 menos o dano já recebido pela vítima; a assistência de dano recebe entre 30 e 70 desse total, sorteado por seed. **Dano de utilitário**: por round e por lado, 0 a 2 eventos sorteados por seed, de 8 a 45 de dano, creditados com peso dobrado para support e igl e proporcional ao atributo `support`; não são letais e não alteram o round. ADR = dano total / rounds. A tela mostra o dano de utilitário em coluna própria.
- **Round Swing**: tabela de probabilidade de vencer o round por vivos (5v5 50%, 5v4 71%, 5v3 87%, 5v2 96%, 5v1 99%, 4v4 50%, 4v3 70%, 4v2 88%, 4v1 97%, 3v3 50%, 3v2 72%, 3v1 92%, 2v2 50%, 2v1 78%, 1v1 50%; o lado com vantagem recebe a probabilidade maior), ajustada pelo `MAP_SIDE_BIAS` existente. Cada kill move a probabilidade; a variação é creditada ao autor (100%, ou 70% com 30% ao assistente) e debitada da vítima. O swing do jogador é a soma por round dividida pelos rounds, em pontos percentuais.
- **Rating 3.0 aproximado**: `raw = 0,0073·KAST + 0,3591·KPR − 0,5329·DPR + 0,2372·impact + 0,0032·ADR + 0,03·swing`, com `impact = 2,13·KPR + 0,42·APR − 0,41`. O rating final é `raw` dividido pela média de `raw` de todos os jogadores do Major com ao menos um mapa, para que a média do campo seja 1,00. É uma aproximação inspirada na fórmula pública do 2.0 mais o swing; a HLTV não publica os pesos do 3.0, e o texto de ajuda da tela diz isso.
- MVP do Major: `rating3 + bônus de colocação atual + swing / 100`.
- Colunas da tela de stats: Rating 3.0, Swing, K, D, A, KAST, ADR, dano de utilitário, duelos de abertura (V-D), trocas, 3K/4K/ACE, clutches. `runRating` passa a ser o rating 3.0; a evolução da Dinastia usa esse valor.
- Cobre offline e Sandbox. O online usa a mesma função no servidor em etapa posterior, porque o protocolo ao vivo não envia o kill feed das séries alheias.

## Dataset de coaches (studio `cs13a0-management`, branch `feat/coaches-dataset`, `data/workspace/coaches.game.json`)

**Um coach para cada um dos 286 times.** O vínculo é por `teamId`: o coach de `astralis-2018` é quem comandou aquele elenco naquele ano. A mesma pessoa em anos ou times diferentes compartilha o `baseId` (slug do nome).

Fonte: as páginas de Major na Liquipedia, lidas pelo cliente do studio (cache + rede com 2 s entre requisições). O extrator lê os dois formatos que a Liquipedia usa: o antigo `{{TeamCard|team=...|c=...}}` e o novo `{{Opponent|Time|players={{Persons|...{{Person|role=coach|nome}}}}}}`, que a página do IEM Cologne 2026 adotou. Resultado gerado em 2026-09-14 (`data/reports/coaches-report.json` no studio):

| Origem do coach | Times | `confidence` |
|---|---|---|
| Card do próprio ano, mesmo coach nos Majors do ano | 243 | `high` |
| Card do próprio ano, coach trocou entre os dois Majors (vale o do Major mais tardio, mais próximo do ranking de dezembro que definiu o elenco), ou correção com fonte | 21 | `medium` |
| Card da mesma organização em ano vizinho (±1) | 18 | `low`, `needsReview: true` (inclui os 5 times de 2020, ano sem Major) |
| Nenhum registro | 4 (`optic-2016`, `penta-2017`, `forze-2019`, `monte-2023`) | `placeholder`, `needsReview: true` |

`data/config/coach-overrides.json` corrige nome e origem quando houver fonte (ex.: a EG de 2019 herdou o elenco e o coach da NRG). Coach `placeholder` se chama "Comissão técnica" / "Coaching staff" / "Cuerpo técnico", nunca entra nas ofertas do draft e existe só para o time ter o campo preenchido.

```ts
interface Coach {
  id: string;            // `coach-${teamId}`
  baseId: string;        // slug do nome; 'staff' no placeholder
  name: string;
  teamId: string; year: number; game: string;
  tactics: number; discipline: number; aggression: number; development: number; // 40–99
  overall: number; rarity: string;
  confidence: 'high' | 'medium' | 'low' | 'placeholder';
  needsReview: boolean;
  source: { page: string | null; url: string | null; year: number | null; note: string };
}
```

Atributos derivados, reproduzíveis no studio:

- Tática: média de `teamStats.tactics` e `teamStats.mapPool` do time.
- Disciplina: média de `teamStats.mental` e `teamStats.consistency`.
- Agressão: média de `entry` e `firepower` do elenco daquele ano.
- Desenvolvimento: variação média do overall dos jogadores do elenco na versão do ano seguinte (mesmo `baseId`, `year + 1`), mapeada de −6..+6 para 50..99; sem dado, 70.
- Todos limitados a 40..99 e arredondados. Overall: média dos quatro. Raridade pelo `majorSummary` do time: `legend` com título, `elite` com final ou semi, `rare` com playoffs, `common` nos demais.
- Sem foto. Nenhum dado de pessoa além do nome público de coach.

O jogo recebe o arquivo pelo `data:pull` (caminho corrigido para o studio real) em `src/lib/data/cs/coaches.game.json`.

## Validação do dataset (`tests/datasetIntegrity.test.ts` no jogo)

Um teste de integridade roda no gate e cobre jogadores, times e coaches: ids únicos; elenco de 5 jogadores existentes e com `baseId` distintos; `teamId` e ano do jogador batendo com o time; atributos inteiros em 1..99; raridade, tier e posições válidos; um coach por time com `teamId` existente, atributos em 40..99 e `confidence` válida; coaches `placeholder` sempre com `needsReview`. Achados da auditoria de 2026-09-14 que não são erro: 42 funções compostas (`awper-igl`, `lurker-support`), que `roleRules` já converte; 54 jogadores com duas versões no mesmo ano, porque 2016–2019 tiveram dois Majors por ano. Achado para revisão manual no studio: `bntet-2019` com overall 74 e IGL 30 com função IGL.

## Fora de escopo

Contratos e salários, aposentadoria, moral, olheiro, academia, temporada com splits, ranking online da dinastia, Hall da Fama, fotos, várias dinastias salvas ao mesmo tempo, contas e sincronização (plano separado em `docs/superpowers/plans/2026-09-14-offline-accounts-and-campaigns.md`).

Ideia registrada para depois: **níveis de dinastia**, comparando os títulos em 5 Majors com dinastias reais (Astralis, fnatic, Vitality). Precisa de uma tabela curada, porque o `majorSummary` do dataset só conta títulos entre 2016 e 2026 por time-ano e subestima as organizações.

## Validação

- Vitest, lógica sem componente, como o repositório faz:
  - `value`: cresce com o overall, multiplicadores, piso, teto e arredondamento; snapshot de 5 jogadores conhecidos.
  - `prizes`: tabela por saída e bônus.
  - `window`: limite por colocação, caixa nunca negativo, elenco sempre com 5, ágio do alvo, ofertas determinísticas por seed, reatribuição obrigatória.
  - `evolution`: versão seguinte quando existe, deriva com limites, veterano, `driftTotal`, dataset intocado.
  - `coach`: efeitos dentro das faixas e afinidade.
  - `tournament-engine`: três estágios com campos por tier, entrada por status, 8 e 8 por estágio, colocações e prêmios; a seed reproduz o Major inteiro; teste dourado da run Normal inalterada.
  - `rating`: KAST, trocas, swing zero-soma entre os dois times por round, média do campo igual a 1,00, ADR coerente com o dano.
  - `store`: save antigo carrega; modo desconhecido cai para Normal.
- `npm run validate` como gate único.
- Navegador: fila com 4 cards; Major do Stage 1 aos playoffs em modo automático e manual; recarga durante a janela reproduz as ofertas; Normal, Ranked e PRO com a mesma seed produzem o mesmo resultado antes e depois; celular de 375 px sem overflow.
- Rollback: reverter os commits. O store normaliza modo desconhecido para Normal e descarta `dynasty`, sem quebrar saves.

## Sequência de entregas

Cada uma com plano próprio em `docs/superpowers/plans/`:

1. **Dinastia A** (plano `docs/superpowers/plans/2026-09-14-dinastia-a-modo-e-tres-estagios.md`, implementada): modo novo, cabeçalho, Major de três estágios, colocações e premiação. Jogável com "Próximo Major" mantendo o elenco e aplicando status e entrada.
2. **Dinastia B** (plano `docs/superpowers/plans/2026-09-14-dinastia-b-coaches.md`, implementada): dataset de coaches no studio, `coach-draft`, efeitos no motor e afinidade. Depende da carga completa dos jogadores no studio.
3. **Dinastia C** (plano `docs/superpowers/plans/2026-09-14-dinastia-c-mercado-janela-evolucao.md`, implementada): valor de mercado, janela, evolução, histórico e card de linhagem.
4. **Rating 3.0, Round Swing e stats** (plano `docs/superpowers/plans/2026-09-14-dinastia-d-rating3-swing-stats.md`, implementada; prêmios da campanha offline calculados só com o campeão definido e análise de rounds memorizada, para o Major ao vivo não ficar lento): independente das anteriores; quando entrar, a evolução passa a usar o rating novo.
