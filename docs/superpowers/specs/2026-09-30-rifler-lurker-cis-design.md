# Rifler/Lurker para cinco jogadores

## Escopo aprovado

Atualizar todas as 23 cartas existentes destas identidades:

- Perfecto: 6 cartas
- FL1T: 6 cartas
- Ax1Le: 4 cartas
- HObbit: 6 cartas
- SANJI: 1 carta

`lollipop21k` não possui carta e não será criado.

## Estado final

Cada carta terá:

```json
"role": "rifler",
"eligibleSlotRoles": [
  "rifler",
  "lurker"
]
```

Os mesmos valores serão aplicados ao catálogo do Studio e ao catálogo do jogo. A regra de funções do runtime terá overrides pelas cinco identidades para impedir que heurísticas antigas — especialmente o override de Perfecto como support — sobrescrevam os dados.

## Verificação e publicação

- Testar que todas as cartas das cinco identidades retornam apenas `rifler` e `lurker`.
- Testar que nenhum outro jogador foi alterado pela transformação de dados.
- Validar JSON, `svelte-check`, testes direcionados, build do frontend e build/testes do backend.
- Publicar as mains do Studio e do jogo.
- Confirmar Vercel em produção e fazer deploy coordenado do Railway a partir do mesmo commit do jogo.
