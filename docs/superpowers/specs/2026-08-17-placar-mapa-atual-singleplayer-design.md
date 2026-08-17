# Placar do mapa atual no singleplayer

## Objetivo

Restaurar no modo singleplayer o placar de rounds do mapa atual desde o início da partida, começando em `0 : 0` e acompanhando cada round revelado. O visual deve manter o mesmo comportamento no multiplayer.

## Comportamento

- Ao iniciar uma série, a linha do mapa atual exibe imediatamente `0 : 0`, inclusive antes do primeiro round ser revelado.
- A cada round, o placar usa o resultado parcial já visível, como `1 : 0` ou `1 : 1`.
- O estado em andamento mostra `AO VIVO` em português, `LIVE` em inglês e `EN VIVO` em espanhol.
- Ao terminar o mapa, o placar parcial é substituído pelo resultado final já existente.
- Antes de a série começar, o mapa permanece com o estado pendente atual.

## Implementação

O componente compartilhado `SeriesViewer` continuará sendo a única fonte do visual. Quando o mapa atual estiver em andamento e ainda não houver round visível, ele usará zero para os dois lados; depois passará a usar o último round visível. O texto de transmissão ao vivo será recebido pelas `labels`, com traduções fornecidas pelas páginas singleplayer e multiplayer.

Não haverá alteração na simulação, no protocolo online, no servidor de salas nem nos resultados das partidas.

## Validação

- Cobrir o estado inicial `0 : 0`, a atualização após rounds e a preservação do placar final.
- Rodar `npm run check`, `npm test` e `npm run build`.
- Fazer uma verificação visual do fluxo singleplayer e confirmar que o multiplayer mantém o mesmo visual.
- Publicar em produção somente depois das validações locais.
