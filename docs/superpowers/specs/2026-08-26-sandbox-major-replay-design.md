# Sandbox Major Replay Design

## Objetivo

Criar uma rota local e independente em `/sandbox` para montar livremente o Time A, disputar um Major completo com adversarios sorteados e assistir automaticamente aos replays das partidas do Time A. O replay experimental sai da campanha offline principal, que continua usando selecao, veto, placares e bonus de mapas sem exibir a simulacao visual.

## Limites da entrega

- O Sandbox nao usa nem altera o save da campanha offline.
- O online, seu protocolo, servidor e deploy permanecem inalterados.
- Nao existe editor de smokes, trajetos, posicoes ou mapas nesta entrega.
- `tests/simulator.html` permanece como referencia intacta e fora do produto.
- Mirage reutiliza a apresentacao fiel extraida do HTML de referencia.
- Ancient, Anubis, Cache, Dust II, Inferno e Nuke usam o radar esquematico derivado de seus grafos atuais.

## Arquitetura

`src/routes/sandbox/+page.svelte` sera uma rota SvelteKit independente com estado local. Ela usa apenas o estado compartilhado de idioma e tema, sem adicionar fases ao `GameState` e sem escrever no armazenamento da campanha.

O dominio do Sandbox sera separado em funcoes puras para:

1. validar e construir o Time A;
2. criar deterministicamente um Major local a partir de um seed;
3. expor a partida atual, resultados de bots e progresso do Time A;
4. controlar a reproducao automatica de rounds e mapas.

As funcoes existentes de dados, regras de funcao, calculo de forca, sorteio e simulacao serao reutilizadas. O Sandbox nao duplica nem incorpora a pagina online e nao cria uma sala WebSocket.

`SeriesViewer.svelte` deixa de importar e renderizar `ReplayViewer`. Assim, a campanha offline mantem seus mapas, veto, placares e controles existentes, mas nao mostra canvas ou replay. O Sandbox monta `ReplayViewer` diretamente apenas nas partidas do Time A.

## Montagem do Time A

A tela inicial permite:

- buscar e escolher qualquer organizacao historica;
- escolher o estilo agressivo, equilibrado ou tatico;
- preencher cinco slots com quaisquer jogadores, inclusive de outras organizacoes e epocas;
- definir a funcao de cada jogador.

Escolher uma organizacao preenche inicialmente seus cinco jogadores historicos. Cada slot pode ser substituido sem alterar a identidade da organizacao.

O inicio exige:

- uma organizacao selecionada;
- exatamente cinco jogadores;
- jogadores distintos por identidade-base;
- funcoes aceitas pelas regras existentes de elenco.

Erros aparecem junto ao campo ou slot correspondente e nao apagam a montagem valida.

## Fluxo do Major

Ao confirmar a montagem, o Sandbox cria um Major local com a mesma estrutura de sorteio e progressao usada pelo modo online. O Time A e a organizacao montada; todos os demais participantes sao times historicos sorteados com seus elencos originais.

Partidas entre bots sao resolvidas imediatamente e aparecem apenas como resultados, como no online. Somente partidas do Time A exibem replay visual.

O fluxo respeita a preferencia existente de simulacao:

- automatico: a partida do Time A inicia sozinha;
- manual: a partida aguarda o comando existente de inicio;
- depois do inicio, todos os rounds e mapas da serie avancam automaticamente, sem um botao Play por mapa.

Ao final do Major, o usuario pode repetir o mesmo seed ou voltar ao montador.

## Replay e velocidades

O Sandbox adiciona a velocidade local `simular`, selecionada por padrao. Nela, cada round completo ocupa exatamente 10 segundos de reproducao visual, independentemente da duracao interna do round.

As demais velocidades continuam disponiveis:

- Normal: `4x`;
- Rapido: `8x`;
- Ultra: conclusao instantanea do round.

Trocar a velocidade afeta somente o espectador local. Nao altera o resultado oficial, seed, ordem de rounds, mapas, confrontos ou estatisticas do Major.

O replay mantem os comportamentos experimentais ja aprovados: diferencas entre estilos, funcoes de AWPer, lurker, entry e IGL, drops fisicos, coleta de armas e utilitarios e preservacao de AWP entre rounds. Esses comportamentos ficam exclusivamente no Sandbox.

## Offline: placar e mapas

A campanha offline continua exibindo selecao de mapas, veto, linhas de mapas e seus placares. O placar ao vivo da serie permanece alinhado no canto direito do cabecalho em desktop; o layout movel continua responsivo.

A afinidade por quantidade de jogadores contribuintes passa a ser:

| Contribuintes | Afinidade |
| ---: | :--- |
| 0 ou 1 | `EVEN` |
| 2 | `+` |
| 3 | `++` |
| 4 ou 5 | `+++` |

O bonus de forca aplicado nas partidas e:

| Modo | `EVEN` | `+` | `++` | `+++` |
| :--- | ---: | ---: | ---: | ---: |
| Premier | 0 | 0,5 | 1 | 1,5 |
| Faceit | 0 | 1,5 | 3 | 4,5 |
| Pro | 0 | 1,5 | 3 | 4,5 |

O novo nivel deve ser aceito pelo veto, apresentacao, tipos e testes sem mudar o restante da simulacao do Major.

## Tratamento de falhas

- Dados incompletos bloqueiam apenas o inicio e indicam o campo afetado.
- Um seed invalido ou ausente e substituido pelo gerador local ja existente.
- Um mapa sem replay compilado nao bloqueia o Major: o resultado continua valido e a interface informa que o replay nao esta disponivel.
- Desmontar a pagina cancela timers e reproducao pendente para impedir avancos duplicados.

## Contratos de teste

O desenvolvimento usa ciclos TDD nos seguintes limites publicos:

1. validacao e construcao do Time A;
2. criacao deterministica do Major Sandbox por seed;
3. progressao de partidas de bots e do Time A;
4. afinidades `EVEN`, `+`, `++` e `+++` e seus bonus numericos;
5. relogio `simular`, que termina cada round em 10 segundos;
6. integracao: o offline nao monta `ReplayViewer` e `/sandbox` monta o replay somente para partidas do Time A;
7. navegador real: montagem, inicio manual e automatico, troca de velocidade, progressao sem Play por mapa, placar offline a direita e responsividade desktop/mobile.

Os testes existentes de dominio, Svelte, build cliente e build servidor continuam como gates. Nenhum teste depende de editar ou executar o HTML de referencia como produto.
