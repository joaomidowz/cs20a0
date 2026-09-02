# Sandbox com visão online e progressão round a round

## Objetivo

Alinhar a tela do Major Sandbox à hierarquia visual do modo online sem reintroduzir radar, Canvas ou replay visual. O Sandbox continua local, permite qualquer composição de cinco jogadores e funções repetidas, e passa a revelar cada série round a round com velocidade configurável.

## Experiência

A tela do Major terá um cabeçalho compacto e duas visões: **Jogo atual** e **Todos os jogos**. A primeira concentra a série do usuário; a segunda apresenta os resultados já resolvidos do torneio. A faixa completa de veto deixa de aparecer.

Na série atual, somente os mapas decididos pelo veto são exibidos:

- MD1: um mapa;
- MD3: dois picks e um decider;
- MD5: quatro picks e um decider.

Mapas ainda não disputados permanecem visíveis como **A disputar**. Se uma MD3 terminar por 2–0, o terceiro mapa continua no conjunto e recebe o estado **Não disputado**.

## Progressão da série

O Sandbox usa os rounds já gerados deterministicamente para revelar o placar, sem recalcular o resultado. Ao iniciar uma série, a interface percorre os rounds do primeiro mapa e depois os mapas seguintes. O placar da série e o placar do mapa refletem somente o trecho já revelado.

As velocidades serão:

- Normal: 1.500 ms por round;
- Rápido: 650 ms por round;
- Ultra: 180 ms por round;
- Insta: revela e conclui a série imediatamente.

O usuário também pode pular o mapa atual. No modo automático, a série começa sozinha e o Major avança após sua conclusão. No modo manual, o usuário inicia cada série e avança depois de ver o resultado. A preferência de velocidade é salva no `localStorage` existente.

## Componentes e dados

Um componente específico de apresentação do Sandbox receberá o `SandboxMajorMatch` e emitirá a conclusão da animação. Ele reutilizará as regras de placar visível já usadas por `SeriesViewer`, mas mostrará somente picks e decider. Uma função pura montará os slots de mapas decididos, associando resultados existentes e preservando slots não disputados.

A rota `/sandbox` continuará responsável pela montagem do elenco e pelo avanço do Major. A animação não altera os resultados simulados, a seed, o veto ou o estado do torneio.

## Estados e segurança

Trocar de aba não reinicia uma série em andamento. Reiniciar o Sandbox cancela temporizadores. Controles ficam desabilitados quando não se aplicam. Séries sem rounds válidos podem ser concluídas sem bloquear o Major.

Nenhum componente, asset ou dependência de replay visual será incorporado à branch funcional.

## Validação

Testes de domínio cobrirão a extração exclusiva dos mapas decididos, incluindo terceiro mapa não disputado e ausência de bans. Testes de componente/rota cobrirão os controles de velocidade e a ausência de referências a radar, Canvas ou replay. O gate final inclui `npm run validate` e verificação no navegador em `/sandbox` nos modos automático e manual.
