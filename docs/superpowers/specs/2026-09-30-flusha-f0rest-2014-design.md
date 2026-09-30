# Funções e atributos de flusha/f0rest 2014

## Escopo

- Alterar somente `flusha-2014` e `f0rest-2014`; outras temporadas permanecem com as regras atuais.
- `flusha-2014` deve poder ocupar `support` e `rifler`.
- `f0rest-2014` deve poder ocupar `rifler`, `awper` e `entry`.
- `f0rest-2014` mantém overall 99 e recebe firepower 99, AWP 89, support 85, consistency 99, experience 99, entry 99, clutch 90, IGL 30 e mental 99.
- Espelhar os dados no Studio e no catálogo principal do jogo.

## Desenho

O jogo continuará aplicando as regras globais existentes por identidade, mas uma tabela de exceções por ID será consultada primeiro. Assim, as cartas de 2014 recebem as funções solicitadas sem alterar flusha ou f0rest em outras temporadas. Os arquivos JSON continuam sendo a representação canônica exibida e editada pelo Studio.

## Verificação e publicação

Um teste de regressão verificará as funções das cartas de 2014 e provará que cartas de outros anos continuam com as regras anteriores. Após validações de tipos, testes e build, a mudança será enviada para `main`; como frontend e backend usam o mesmo catálogo do `cs20a0`, ambos devem ser validados após os deployments acionados pela branch.
