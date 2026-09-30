# Hotfix dos cards de coach no frontend

## Problema

Os cards de coach quebram em três contextos: promo compacta, grade mobile da coleção/lineup e cards estreitos no desktop. A prop `compact` renderiza conteúdo compacto, mas a classe CSS correspondente não é aplicada ao elemento raiz. Além disso, a grade mobile aplica o modo denso somente aos jogadores; os coaches mantêm o card desktop completo e seus botões dentro de colunas estreitas.

## Solução aprovada

- Aplicar `class:compact` no elemento raiz de `CoachCard`.
- Espelhar as proteções de largura, truncamento e quebra de botões já usadas por `CollectionCard`.
- Na coleção mobile, renderizar coaches com `dense` e abrir `CoachCardSheet` ao toque.
- Manter as ações de colocar/tirar do time e vender dentro da ficha do coach, como já acontece com jogadores.
- Preservar o visual, a hierarquia, as raridades, os stats e o comportamento desktop existentes.

## Verificação

- Criar testes de componente/regressão para a classe compacta e o fluxo de ficha do coach.
- Rodar `svelte-check`, testes direcionados e build.
- Verificar visualmente promo, lineup/coleção mobile e coleção desktop em uma passada limitada.
- Publicar diretamente em `main` após as validações.
