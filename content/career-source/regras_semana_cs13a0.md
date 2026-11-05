# Sistema de semana – CS13A0 (proposta de design)

## Conteúdo
- `semana_cs13a0_expandida.csv`: 257 atividades (63 originais preservadas + 194 novas).
- `semana_cs13a0_dilemas.csv`: 24 dilemas contextuais, cada um com três decisões (72 linhas, uma por alternativa).
- Arquivos JSON correspondentes para integração.
- As atividades são **ações individuais**; os dilemas são **escolhas mutuamente exclusivas**.

## Mecânica semanal recomendada
1. Oferecer 4–7 atividades elegíveis para escolha, diferentes conforme tier, calendário, país e acontecimentos recentes; permitir de 1 a 3 atividades na semana conforme compromisso oficial, não 257 botões.
2. Todas as ações custam blocos de agenda (`tempo`). Exemplo: PUG (1), terapia (1), scrim (2), viagem internacional (3). Estes custos não constam ainda como campo numérico no CSV e devem ser calibrados.
3. Evitar que o jogador fique sempre treinando: rendimento marginal da mesma categoria: 100%, 65%, 35% após repetições nas últimas quatro semanas; fadiga e risco crescem por excesso de carga.
4. Gatilhos de `so_aparece_se` são texto legível para design, **não expressões executáveis**; implementar validadores no motor antes de apresentar. Personagens com `X player`, coach ou contato exigem um elenco real do jogo: o motor deve selecionar jogador compatível, acessível, não ocupado e com função/país consistente. Não inventar nicks.
5. Riscos são chances-base sugeridas e devem sofrer modificadores contextuais; não apresentar as probabilidades como fatos médicos. Para viagens e eventos familiares, a consequência pode depender do agendamento e não apenas de uma rolagem aleatória.
6. Definir cooldown por ID, nunca limpar no ano novo. O mesmo tipo de compromisso pode reaparecer com outras pessoas e textos, mas eventos narrativos singulares precisam de estados persistentes.

## Mental: exigência maior, sem punir automaticamente quem mora fora
Separar **mental** (resiliência sob pressão), **moral** (bem-estar/motivação), **cansaço** (desgaste), **adaptação** (familiaridade com país/idioma/time), **saudade** (tensão por distância) e **pressão externa** (crítica, expectativa). Os quatro últimos são variáveis recomendadas novas, **ainda não existentes** nas linhas legadas do CSV.

- Mental abaixo de 35/100: maior chance de reação negativa a entrevistas, falhas em clutch e atrito no elenco; abaixo de 20 por várias semanas pode ativar evento de crise de confiança, **sem automatizar diagnóstico ou punição médica**.
- Fadiga acima de 70/100: reduz ganho de treino; acima de 85/100: recomenda recuperação e sinaliza risco de sobrecarga, sem simular probabilidade real de doença.
- Quem muda de país recebe um período inicial de adaptação de aproximadamente 8–20 semanas. Idioma, convivência, suporte e contato com a família ajudam; o jogador pode se adaptar muito bem, não deve sofrer perda mental obrigatória por ser brasileiro em time europeu.
- `saudade` aumenta mais se distância, calendário e isolamento se acumularem; contato online reduz pouco, uma visita planejada reduz mais, mas viagens custam tempo e fadiga. Não forçar a opção de voltar a ser sempre superior ou sempre inferior.
- Em semana de Major, o custo de agenda e o impacto da pressão crescem para alguns perfis; jogadores experientes e bem preparados podem absorver a pressão ou até render melhor.

## Decisões entre casa e organização
- Propor um dilema de grande impacto apenas quando existir conflito real: férias, Natal, contrato, mudança de continente, bootcamp opcional, emergência familiar ou calendário apertado.
- Exemplo: voltar ao Brasil durante pausa pode dar `mental +5`, `moral +8` e `cansaço +8`; ficar e treinar pode dar `consistency +3`, `relação com o time +3` e `moral -4`. O efeito real depende do nível de adaptação, condição física e vontade do personagem.
- Grandes escolhas podem gerar flags persistentes: `visita_familia_planejada`, `acordo_folgas_org`, `comunicacao_aberta_com_coach`, `mudanca_moradia`, `promessa_patrocinio`, `tensao_igl`. Essas flags são recomendações, não colunas já implementadas.
- Mudar de residência ou país deve ocorrer por evento/contrato e atualização de estado; a atividade sozinha não deve teleportar o personagem.

## Notas de integração
- Mantive as 10 colunas de `semana.csv` e adicionei metadados nas últimas colunas. Os 63 registros originais não tiveram seus textos e efeitos alterados.
- `risco_chance` dos novos eventos é um ponto de partida ilustrativo; verificar compatibilidade do parser de percentuais atual.
- As frases `frase_depois` dos novos eventos estão funcionais como texto genérico, mas a próxima revisão narrativa pode torná-las individuais.
- O motor deverá validar limite de atributos, moeda/salário, custos e cooldown, além de respeitar atividades conjuntas de equipes em viagem.
