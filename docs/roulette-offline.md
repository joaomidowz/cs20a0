# Roleta offline

Normal, Ranked e PRO usam uma faixa horizontal de 2,8 segundos antes da escolha manual de jogador. O PRO mantém todas as ofertas anônimas. A animação usa a Web Animations API; sua aleatoriedade decorativa não consome o RNG do jogo. O resultado e o contador de ressorteios são persistidos antes do giro. Pular, recarregar ou concluir não realiza um novo sorteio.

O componente é montado apenas durante o giro e cancela animação, timer e listener ao sair. Movimento reduzido apresenta o resultado imediatamente. Jogadores entram em 180 ms, escalonados em 60 ms, e continuam visíveis mesmo sem animação.

## Imagens futuras

Esta versão usa iniciais, nomes e anos. Não há downloads, hotlinks, imagens geradas ou alterações no dataset.

Em uma etapa futura, avaliar kits de imprensa das organizações para logos, materiais oficiais dos mapas ou capturas próprias e retratos autorizados. Essas são possibilidades a investigar, não fontes verificadas ou aprovadas. Antes da integração, registrar origem, permissão de uso, créditos e correspondência entre organização, era e versão do mapa. Preferir arquivos otimizados hospedados com o projeto, mantendo iniciais como fallback. O PRO deverá continuar usando a oferta anônima mesmo quando houver imagens.

## Verificação

- Svelte check sem erros ou avisos; build de produção concluído; 291 testes existentes aprovados.
- Navegador: cinco escolhas nos três modos, seed comparada com o algoritmo existente, clique duplo, ressorteio, pular e conclusão natural.
- PRO sem identidade nas ofertas; movimento reduzido revela imediatamente; recarga preserva resultado salvo.
- Revisão visual em desktop escuro e celular de 375 px claro, sem overflow horizontal na roleta e sem erros de execução no navegador.
