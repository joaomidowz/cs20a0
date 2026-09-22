# Ajuste de caixas e revenda — plano de implementação

**Goal:** Aplicar os valores aprovados: venda a 40%, Ouro a 12.000 coins e Prata a 5.000 coins.

**Architecture:** Alterar as constantes compartilhadas de collection-rules.ts, consumidas pelo servidor e pelas prévias do cliente. Manter o valor nominal das cartas e o pagamento de duplicatas.

**Tech Stack:** TypeScript e Vitest.

## Restrições e verificação

- SELL_RATIO = 0.4, PACK_PRICES.ouro = 12000, PACK_PRICES.prata = 5000.
- Venda de jogadores e coaches usa o mesmo percentual, arredondado para baixo.
- Testar os sorteios reais de Ouro e Prata com sementes fixas e revenda de todas as cartas, exigindo retorno médio abaixo do custo com margem de 10%. Ganhos em caixas individuais continuam possíveis.
- Não alterar chances, demais preços, duplicatas ou valores nominais.

## Tarefa única: regras e regressão

- [x] Atualizar tests/collectionRules.test.ts para GOAT vendido a 44.000 e os preços aprovados.
- [x] Atualizar tests/collectionEconomy.test.ts para 40%, verificar venda de jogadores/coaches e simular 2.000 caixas de cada tipo com rollPackWithCoaches e sementes fixas.
- [x] Executar os dois testes antes da alteração e confirmar falha.
- [x] Em src/lib/game/online/collection-rules.ts, definir SELL_RATIO = 0.4, prata: 5000 e ouro: 12000.
- [x] Executar testes de economia, regras, coleção, promos e upgrader; executar npm run check e revisar git diff --check.

## Evidência inicial

Simulação de 10.000 caixas por tipo: com venda a 40%, Ouro retornou em média 7.594 coins e Prata 4.317. Os novos custos resultam em retorno aproximado de 63% e 86%, respectivamente. A venda remove a carta antes de creditar; a carteira é bloqueada na transação antes da cobrança. O problema identificado é de rentabilidade do ciclo de revenda.

## Validação concluída

42 testes passaram; 17 testes de API foram pulados por ausência de TEST_DATABASE_URL. Checagem Svelte/TypeScript sem erros ou avisos. Builds do cliente e servidor concluídos.
