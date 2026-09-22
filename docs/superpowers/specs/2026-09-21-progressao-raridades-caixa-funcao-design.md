# Progressão de raridades e Caixa Função

## Objetivo

Fazer GOAT e Legend voltarem a ser conquistas de longo prazo, manter caixas comuns úteis e impedir que a maioria das lineups atinja o teto 99 em poucos dias.

## Economia aprovada

- Dois pacotes Básicos por dia.
- Prata: 2.000 coins; Ouro: 7.500; Era: 10.000.
- Diamante, com Legend garantido: 50.000 coins.
- Ícone, com GOAT garantido: 100.000 coins.
- Odds de GOAT por carta: Básico 0,02%, Prata 0,2%, Ouro 0,5%.
- Promoções deixam de vender raridade alta com 60% de desconto; Legend pode ser comprada no máximo uma vez por semana.
- Upgrader: teto de 25% para alvo Legend e 10% para alvo GOAT.
- Recompensas repetíveis caem aproximadamente 30%, preservando coleção e saldo existentes.

## Caixa Função

A nova caixa custa 1.500 coins. Antes de comprar, o jogador escolhe IGL, AWPer, Entry, Lurker, Support ou Rifler. As três cartas sorteadas precisam ser elegíveis para a função escolhida. A caixa não contém Legend nem GOAT; suas odds favorecem Common e Rare. Coaches não aparecem nela.

O cliente envia `tier: "funcao"` e `role`; o servidor valida ambos e filtra o pool antes do sorteio determinístico. A seed e o histórico continuam seguindo o fluxo normal de pacotes.

## Poder

O 99 deve representar uma lineup excepcional e coesa. Esta entrega reduz a velocidade com que novas contas obtêm as cartas necessárias. A abertura da régua existente fica fora deste deploy porque exige recalibrar em conjunto as probabilidades de vitória e os vinte alvos de simulação; uma alteração direta fez nove alvos falharem.

## Validação

Testes puros cobrem odds, preços, filtro de função e limites do upgrader. Testes de API cobrem compra válida e rejeição de função ausente ou inválida. A suíte de economia verifica que vender duplicatas não recupera o preço do pacote. Builds do frontend e servidor precisam passar antes dos deploys.
