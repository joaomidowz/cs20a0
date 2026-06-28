import type { Language } from './types';

const pt = {
  play: 'Jogar',
  headline: 'Monte uma line impossível e sobreviva ao Major.',
  subheadline: 'Sorteie times lendários, escolha apenas um jogador por elenco e tente vencer dinastias como SK 2016, Astralis 2018, NaVi 2021, Vitality 2025 e outras.',
  curated: 'Base curada com 286 elencos time-ano, 1.430 versões de jogadores e 11 anos de Majors entre 2016 e 2026. Desafio atual: uma escolha por time sorteado, cinco picks, Stage 3, playoffs e final MD5.',
  chooseMode: 'Escolha sua fila',
  premier: 'Normal',
  premierDesc: 'Veja overall, atributos, título e raridade durante todo o draft. Ideal para a primeira run.',
  faceit: 'Ranked',
  faceitDesc: 'No Ranked você escolhe no feeling. Os números aparecem depois.',
  chooseStyle: 'Estilo da organização',
  aggressive: 'Agressivo',
  balanced: 'Equilibrado',
  tactical: 'Tático',
  aggressiveDesc: 'Mais firepower e entry, menos consistência.',
  balancedDesc: 'Consistência e mental sem grandes riscos.',
  tacticalDesc: 'IGL, suporte e mental em primeiro plano.',
  rollTeam: 'Rolar time',
  teamReroll: 'Reroll de time',
  rerollTeam: 'Trocar time',
  teamRerolled: 'Time trocado',
  noRerollTeams: 'Sem outro time disponível',
  opportunity: 'Oportunidade',
  pickOne: 'Escolha apenas um jogador deste elenco.',
  choosePlayer: 'Escolher jogador',
  addAs: 'Adicionar como',
  close: 'Fechar',
  orgHud: 'HUD da organização',
  complete: 'Line confirmada',
  estimatedPower: 'Power estimado',
  startMajor: 'Começar Major',
  majorSetup: 'Configuração do Major',
  manual: 'Manual',
  automatic: 'Automático',
  configurationSaved: 'Configuração salva',
  simulationMode: 'Modo de simulação',
  speed: 'Velocidade',
  normal: 'Normal',
  fast: 'Rápido',
  ultra: 'Ultra',
  insta: 'Insta',
  enterMajor: 'Entrar no Stage 3',
  startSeries: 'Iniciar série',
  nextMatch: 'Próxima partida',
  skipMap: 'Pular mapa atual',
  round: 'Round',
  seriesChance: 'Chance aproximada',
  stage3: 'Stage 3',
  playoffs: 'Playoffs',
  quarterfinal: 'Quartas de final',
  semifinal: 'Semifinal',
  result: 'Resultado da run',
  champion: 'CAMPEÃO DO MAJOR',
  eliminated: 'RUN ENCERRADA',
  campaign: 'Campanha',
  placement: 'Colocação',
  seriesWon: 'Séries vencidas',
  seriesLost: 'Séries perdidas',
  mapsWon: 'Mapas vencidos',
  mapsLost: 'Mapas perdidos',
  maps: 'Mapas',
  record: 'Campanha',
  mapsPlayed: 'Mapas jogados',
  roundsWon: 'Rounds vencidos',
  roundsLost: 'Rounds perdidos',
  tryAgain: 'Tentar novamente',
  seeStats: 'Ver estatísticas',
  copySeed: 'Copiar seed',
  copyRunLink: 'Copiar link da run',
  downloadRunImage: 'Baixar imagem da run',
  shareImage: 'Compartilhar imagem',
  imageDownloaded: 'Imagem da run baixada',
  imageDownloadFailed: 'Não foi possível gerar a imagem. O link continua disponível.',
  shareRun: 'Compartilhar run',
  newSeed: 'Nova seed',
  playSameSeed: 'Jogar mesma seed',
  copied: 'Link copiado',
  stats: 'Estatísticas da run',
  runMvp: 'MVP da Run',
  worstRating: 'Pior rating',
  belowExpected: 'Abaixo do esperado',
  backResult: 'Voltar ao resultado',
  composition: 'Leitura da composição',
  noAwper: 'Sem AWPer principal',
  noIgl: 'Sem IGL',
  manyRiflers: 'Muitos riflers',
  aggressiveLine: 'Line agressiva',
  tacticalLine: 'Line tática',
  revealed: 'Atributos revelados',
  hiddenStats: 'Atributos ocultos no Ranked',
  allMatches: 'Partidas da run',
  emptyTitle: 'Sua próxima era começa aqui.'
  ,modeIntro: 'Escolha quanto de informação você quer levar para a mesa.'
  ,noRepeat: 'Nenhum time pode aparecer duas vezes na mesma run.'
  ,majorRules: 'Stage 3: 3 vitórias classifica, 3 derrotas elimina. Toda série é MD3; a final é MD5.'
  ,autoDesc: 'O Major avança sozinho.'
  ,manualDesc: 'Controle série por série.'
  ,waitingResult: 'Aguardando primeiro resultado...'
  ,statsSeed: 'Dados fictícios, coerentes e reproduzíveis pela seed.'
  ,map: 'Mapa'
  ,final: 'FINAL'
  ,waiting: 'AGUARDANDO'
  ,pending: 'A disputar'
  ,inProgress: 'Em andamento'
  ,mapInProgress: 'Mapa em progresso'
  ,veryAggressive: 'muito agressivo'
  ,greatClutch: 'ótimo clutch'
  ,mainAwper: 'AWPer principal'
  ,tacticalProfile: 'perfil tático'
  ,consistentPlayer: 'jogador consistente'
  ,versatileProfile: 'perfil versátil'
  ,chooseStyleBeforeRoll: 'Escolha o estilo da sua organização antes de abrir a primeira oportunidade.'
  ,useAs: 'Usar como'
  ,howUsePlayer: 'Como deseja usar este jogador?'
  ,roleOccupied: 'Support já ocupado'
  ,samePlayerPicked: 'Mesmo jogador já escolhido'
  ,rifleLimitReached: 'Limite de rifles'
  ,lineHasAwper: 'AWPer já ocupado'
  ,lineHasIgl: 'IGL já ocupado'
  ,lineHasEntry: 'Entry já ocupado'
  ,lineHasLurker: 'Lurker já ocupado'
  ,orgComposition: 'Composição da organização'
  ,assignedRole: 'Função atribuída'
  ,invalidRole: 'Função indisponível'
  ,optional: 'opcional'
  ,noSupport: 'Sem support principal'
  ,compositionReady: 'Composição pronta para o servidor'
  ,featureDraftTitle: 'DRAFT CURADO'
  ,featureDraftDesc: 'Uma escolha por time. Cinco chances.'
  ,featureSeedTitle: 'SEED REAL'
  ,featureSeedDesc: 'Mesmo caminho, mesmas consequências.'
  ,featureRulesTitle: 'MR12 + OT'
  ,featureRulesDesc: 'Stage 3, playoffs e final MD5.'
  ,metaDescription: 'Draft de Counter-Strike com 286 elencos time-ano, 1.430 versões de jogadores e Major simulado por seed.'
  ,supportNudgeTitle: 'Curtiu o cs13a0?'
  ,supportNudgeMessage: 'Esse projeto é independente e mantido com tempo livre. Se quiser ajudar a manter domínio, melhorias e novas eras, apoie no Ko-fi.'
  ,supportOnKofi: 'Apoiar no Ko-fi'
  ,notNow: 'Agora não'
  ,footerDescription: 'Projeto independente de simulação e entretenimento competitivo.'
  ,sendFeedback: 'Enviar feedback'
  ,contact: 'Contato'
  ,independentProject: 'Projeto independente'
  ,curatedGameplayStats: 'Ratings e estatísticas são curados/adaptados para gameplay.'
  ,footerDisclaimer: 'cs13a0 é um projeto independente. Não é afiliado à Valve, HLTV, times, organizações ou jogadores. Ratings e estatísticas são curados/adaptados para gameplay.'
  ,about: 'Sobre'
  ,privacy: 'Privacidade'
  ,terms: 'Termos'
  ,aboutTitle: 'Sobre o cs13a0'
  ,aboutIntro: 'O cs13a0 é um simulador independente de draft e Major inspirado nas eras competitivas de Counter-Strike. A ideia é simples: você monta uma organização escolhendo jogadores de diferentes times e anos, define a identidade da sua line e tenta vencer uma simulação de Major contra equipes históricas e atuais.'
  ,aboutBorn: 'O projeto nasceu como uma experiência feita por fã, por amor ao CS e à história competitiva do jogo. A proposta não é criar um ranking oficial, mas uma experiência divertida, rejogável e com identidade própria.'
  ,aboutData: 'Os overalls, posições, títulos e estatísticas são curados e adaptados para gameplay. Alguns jogadores podem receber ajustes manuais para representar melhor impacto histórico, função, importância para a cena ou equilíbrio do jogo.'
  ,aboutBase: 'A base inicial é limitada e curada para manter o jogo leve, rápido e balanceável. Novos times, jogadores e eras podem ser adicionados com o tempo.'
  ,aboutFeedback: 'Feedbacks são bem-vindos. Se você encontrou um erro, quer sugerir um time ou jogador, ou tem uma ideia de melhoria, entre em contato.'
  ,aboutSupport: 'Se curtiu o projeto e quer ajudar a manter domínio, melhorias e novas eras, considere apoiar no Ko-fi.'
  ,playNow: 'Jogar agora'
  ,privacyTitle: 'Política de Privacidade'
  ,privacyNoAccount: 'O cs13a0 não exige cadastro. Você pode jogar diretamente no navegador, sem criar conta.'
  ,privacyLocalStorage: 'O jogo usa localStorage para salvar preferências locais, como idioma, tema claro/escuro, velocidade da simulação, modo manual/automático e dados da última run. O localStorage fica no seu navegador e não é enviado a servidores.'
  ,privacyFeedback: 'Se você enviar feedback pelo formulário ou e-mail, podem ser coletados: nome ou nickname (se informado), e-mail (se informado), jogador, time ou ano citado, sugestão, mensagem e seed da run (se enviada). O e-mail será usado apenas para responder ou entender melhor o feedback.'
  ,privacyKoFi: 'O projeto usa Ko-fi para apoio voluntário. Ao clicar no link do Ko-fi, você sai do cs13a0 e acessa uma plataforma externa, regida pela própria política de privacidade do Ko-fi.'
  ,privacyOnline: 'Futuramente, se houver modo online, poderão ser salvos temporariamente: código da sala, nickname, nome da organização, picks, resultados, seed da sala e posição final. Esses dados serão temporários e usados apenas para manter a sala funcionando.'
  ,privacyNoSell: 'Não vendemos dados pessoais. Não coletamos senhas. Não pedimos dados sensíveis.'
  ,privacyUpdates: 'Esta política pode ser atualizada conforme novas funcionalidades forem adicionadas.'
  ,privacyContact: 'Dúvidas sobre privacidade? Entre em contato:'
  ,termsTitle: 'Termos de Uso'
  ,termsIndependent: 'O cs13a0 é um projeto independente, criado por fãs, para entretenimento e simulação. Não é afiliado, patrocinado ou aprovado por Valve, HLTV, times, organizações ou jogadores.'
  ,termsTrademarks: 'Counter-Strike e marcas relacionadas pertencem aos seus respectivos proprietários.'
  ,termsGameplay: 'Ratings, overalls, posições e estatísticas são adaptados para gameplay. O usuário não deve interpretar os dados como ranking oficial.'
  ,termsConduct: 'O usuário não deve usar o site para assédio, spam ou abuso de formulário.'
  ,termsChanges: 'O projeto pode alterar jogadores, ratings, regras e modos a qualquer momento.'
  ,termsKoFi: 'O apoio via Ko-fi é voluntário e não compra vantagem dentro do jogo.'
  ,termsAvailability: 'O site pode ficar indisponível temporariamente por manutenção. Se houver modo online no futuro, salas podem expirar e dados temporários podem ser apagados.'
  ,termsContact: 'Dúvidas sobre os termos? Entre em contato:'
  ,contactTitle: 'Contato'
  ,contactIntro: 'Quer entrar em contato? Use o e-mail abaixo para sugerir correções, reportar bugs, propor melhorias ou falar sobre parcerias.'
  ,contactEmail: 'E-mail principal'
  ,contactSendEmail: 'Enviar e-mail'
  ,contactSuggestions: 'Você pode entrar em contato para: sugerir correção de jogador, sugerir novo time, reportar bug, sugerir melhoria visual, sugerir balanceamento ou falar sobre parcerias e divulgação.'
  ,footerNav: 'Navegação'
  ,placementChampion: 'Campeão'
  ,placementRunnerUp: 'Vice-campeão'
  ,placement3to4: '3º–4º'
  ,placement5to8: '5º–8º'
  ,roleAwper: 'AWPer'
  ,roleIgl: 'Capitão'
  ,roleSupport: 'Suporte'
  ,roleRifler: 'Rifler'
  ,yourOrg: 'Sua Org'
  ,titleGoatCs: 'GOAT do CS'
  ,titleGoatCsgo: 'GOAT do CS:GO'
  ,titleGoatCsgoPeak: 'GOAT do CS:GO Peak'
  ,badge55Teams: '286 TIMES'
  ,badge275Players: '1.430 JOGADORES'
  ,badgeYears: '2016–2026'
  ,badgeSharedSeed: 'SEED COMPARTILHÁVEL'
} as const;

type TranslationKey = keyof typeof pt;

const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  'pt-BR': pt,
  es: {
    ...pt,
    play: 'Jugar', headline: 'Monta una alineación imposible y sobrevive al Major.', subheadline: 'Sortea equipos legendarios, elige solo un jugador por plantilla e intenta vencer dinastías históricas.', curated: 'Base curada con 286 plantillas equipo-año, 1.430 versiones de jugadores y 11 años de Majors entre 2016 y 2026. Desafío actual: una elección por equipo sorteado, cinco picks, Stage 3, playoffs y final MD5.', chooseMode: 'Elige tu cola', premierDesc: 'Mira el overall y los atributos durante el draft. Ideal para la primera partida.', faceitDesc: 'En Faceit eliges por intuición. Los números aparecen después.', chooseStyle: 'Estilo de la organización', aggressive: 'Agresivo', balanced: 'Equilibrado', tactical: 'Táctico', aggressiveDesc: 'Más potencia y entry, menos consistencia.', balancedDesc: 'Consistencia y mental sin grandes riesgos.', tacticalDesc: 'IGL, apoyo y mental en primer plano.', rollTeam: 'Sortear equipo', teamReroll: 'Reroll de equipo', rerollTeam: 'Cambiar equipo', teamRerolled: 'Equipo cambiado', noRerollTeams: 'No hay otro equipo disponible', opportunity: 'Oportunidad', pickOne: 'Elige solo un jugador de esta plantilla.', choosePlayer: 'Elegir jugador', close: 'Cerrar', orgHud: 'HUD de la organización', complete: 'Alineación confirmada', estimatedPower: 'Poder estimado', startMajor: 'Comenzar Major', majorSetup: 'Configuración del Major', manual: 'Manual', automatic: 'Automático', simulationMode: 'Modo de simulación', speed: 'Velocidad', normal: 'Normal', fast: 'Rápido', ultra: 'Ultra', insta: 'Insta', enterMajor: 'Entrar al Stage 3', startSeries: 'Iniciar serie', nextMatch: 'Siguiente partida', skipMap: 'Saltar mapa actual', round: 'Ronda', seriesChance: 'Probabilidad aproximada', result: 'Resultado de la partida', champion: 'CAMPEÓN DEL MAJOR', eliminated: 'PARTIDA FINALIZADA', campaign: 'Campaña', placement: 'Posición', seriesWon: 'Series ganadas', seriesLost: 'Series perdidas', mapsWon: 'Mapas ganados', mapsLost: 'Mapas perdidos', tryAgain: 'Intentar de nuevo', seeStats: 'Ver estadísticas', copySeed: 'Copiar seed', shareRun: 'Compartir partida', newSeed: 'Nueva seed', copied: 'Enlace copiado', stats: 'Estadísticas de la partida', runMvp: 'MVP de la partida', backResult: 'Volver al resultado', composition: 'Lectura de composición', noAwper: 'Sin AWPer principal', noIgl: 'Sin IGL', manyRiflers: 'Demasiados riflers', aggressiveLine: 'Alineación agresiva', tacticalLine: 'Alineación táctica', revealed: 'Atributos revelados', hiddenStats: 'Atributos ocultos en Faceit', allMatches: 'Partidas de la run', emptyTitle: 'Tu próxima era empieza aquí.', modeIntro: 'Elige cuánta información quieres llevar a la mesa.', noRepeat: 'Un equipo no puede aparecer dos veces en la misma partida.', majorRules: 'Stage 3: 3 victorias clasifican y 3 derrotas eliminan. Todas las series son MD3; la final es MD5.', autoDesc: 'El Major avanza solo.', manualDesc: 'Controla cada serie.', waitingResult: 'Esperando el primer resultado...', statsSeed: 'Datos ficticios, coherentes y reproducibles por la seed.', map: 'Mapa', final: 'FINAL', waiting: 'ESPERANDO', veryAggressive: 'muy agresivo', greatClutch: 'gran clutch', mainAwper: 'AWPer principal', tacticalProfile: 'perfil táctico', consistentPlayer: 'jugador consistente', versatileProfile: 'perfil versátil', chooseStyleBeforeRoll: 'Elige el estilo de tu organización antes de abrir la primera oportunidad.', useAs: 'Usar como', howUsePlayer: '¿Cómo quieres usar este jugador?', roleOccupied: 'Función ocupada', samePlayerPicked: 'El mismo jugador ya fue elegido', rifleLimitReached: 'Límite de rifles alcanzado', lineHasAwper: 'Tu equipo ya tiene un AWPer', lineHasIgl: 'Tu equipo ya tiene un IGL', lineHasEntry: 'Tu equipo ya tiene un entry/opener', lineHasLurker: 'Tu equipo ya tiene un lurker/closer', orgComposition: 'Composición de la organización', assignedRole: 'Función asignada', invalidRole: 'Elige una función válida para este jugador.', optional: 'opcional', noSupport: 'Sin support principal'
  },
  en: {
    ...pt,
    play: 'Play', headline: 'Build an impossible lineup and survive the Major.', subheadline: 'Roll legendary teams, choose one player from each roster, and try to beat historic dynasties.', curated: 'Curated pool with 286 team-year rosters, 1,430 player versions, and 11 Major years from 2016 through 2026. Current challenge: one pick per rolled team, five picks, Stage 3, playoffs, and a BO5 final.', chooseMode: 'Choose your queue', premierDesc: 'See overall, attributes, title, and rarity throughout the draft. Best for a first run.', faceitDesc: 'In Faceit you pick by feel. The numbers appear later.', chooseStyle: 'Organization style', aggressive: 'Aggressive', balanced: 'Balanced', tactical: 'Tactical', aggressiveDesc: 'More firepower and entry, less consistency.', balancedDesc: 'Consistency and mental with no major risks.', tacticalDesc: 'IGL, support, and mental come first.', rollTeam: 'Roll team', teamReroll: 'Team reroll', rerollTeam: 'Reroll team', teamRerolled: 'Team rerolled', noRerollTeams: 'No other team available', opportunity: 'Opportunity', pickOne: 'Choose only one player from this roster.', choosePlayer: 'Choose player', close: 'Close', orgHud: 'Organization HUD', complete: 'Lineup confirmed', estimatedPower: 'Estimated power', startMajor: 'Start Major', majorSetup: 'Major setup', manual: 'Manual', automatic: 'Automatic', simulationMode: 'Simulation mode', speed: 'Speed', normal: 'Normal', fast: 'Fast', ultra: 'Ultra', insta: 'Insta', enterMajor: 'Enter Stage 3', startSeries: 'Start series', nextMatch: 'Next match', skipMap: 'Skip current map', round: 'Round', seriesChance: 'Approximate chance', result: 'Run result', champion: 'MAJOR CHAMPION', eliminated: 'RUN OVER', campaign: 'Campaign', placement: 'Placement', seriesWon: 'Series won', seriesLost: 'Series lost', mapsWon: 'Maps won', mapsLost: 'Maps lost', tryAgain: 'Try again', seeStats: 'View statistics', copySeed: 'Copy seed', shareRun: 'Share run', newSeed: 'New seed', copied: 'Link copied', stats: 'Run statistics', runMvp: 'Run MVP', backResult: 'Back to result', composition: 'Composition readout', noAwper: 'No primary AWPer', noIgl: 'No IGL', manyRiflers: 'Too many riflers', aggressiveLine: 'Aggressive lineup', tacticalLine: 'Tactical lineup', revealed: 'Attributes revealed', hiddenStats: 'Attributes hidden in Faceit', allMatches: 'Run matches', emptyTitle: 'Your next era starts here.', modeIntro: 'Choose how much information you want at the table.', noRepeat: 'A team cannot appear twice in the same run.', majorRules: 'Stage 3: 3 wins qualify and 3 losses eliminate. Every series is BO3; the final is BO5.', autoDesc: 'The Major advances on its own.', manualDesc: 'Control each series.', waitingResult: 'Waiting for the first result...', statsSeed: 'Fictional, coherent data reproducible by seed.', map: 'Map', final: 'FINAL', waiting: 'WAITING', veryAggressive: 'very aggressive', greatClutch: 'great clutch player', mainAwper: 'primary AWPer', tacticalProfile: 'tactical profile', consistentPlayer: 'consistent player', versatileProfile: 'versatile profile', chooseStyleBeforeRoll: 'Choose your organization style before opening the first opportunity.', useAs: 'Use as', howUsePlayer: 'How do you want to use this player?', roleOccupied: 'Role occupied', samePlayerPicked: 'Same player already selected', rifleLimitReached: 'Rifle limit reached', lineHasAwper: 'Your lineup already has an AWPer', lineHasIgl: 'Your lineup already has an IGL', lineHasEntry: 'Your lineup already has an entry/opener', lineHasLurker: 'Your lineup already has a lurker/closer', orgComposition: 'Organization composition', assignedRole: 'Assigned role', invalidRole: 'Choose a valid role for this player.', optional: 'optional', noSupport: 'No primary support'
  }
};

Object.assign(dictionaries.es, {
  quarterfinal: 'Cuartos de final',
  semifinal: 'Semifinal',
  playSameSeed: 'Jugar con la misma seed',
  premier: 'Normal',
  faceit: 'Ranked',
  faceitDesc: 'En Ranked eliges por intuición. Los números aparecen después.',
  hiddenStats: 'Atributos ocultos en Ranked',
  addAs: 'Añadir como',
  pending: 'Por disputar',
  inProgress: 'En curso',
  mapInProgress: 'Mapa en curso',
  downloadRunImage: 'Descargar imagen de la partida',
  shareImage: 'Compartir imagen',
  copyRunLink: 'Copiar enlace de la partida',
  worstRating: 'Peor rating',
  belowExpected: 'Por debajo de lo esperado',
  configurationSaved: 'Configuración guardada',
  automatic: 'Automático',
  manual: 'Manual',
  normal: 'Normal',
  fast: 'Rápido',
  ultra: 'Ultra',
  samePlayerPicked: 'El mismo jugador ya fue elegido',
  invalidRole: 'Función no disponible',
  rifleLimitReached: 'Límite de rifles',
  lineHasAwper: 'AWPer ya ocupado',
  lineHasIgl: 'IGL ya ocupado',
  roleOccupied: 'Support ya ocupado',
  lineHasEntry: 'Entry ya ocupado',
  lineHasLurker: 'Lurker ya ocupado',
  mapsPlayed: 'Mapas jugados',
  roundsWon: 'Rondas ganadas',
  roundsLost: 'Rondas perdidas',
  maps: 'Mapas',
  record: 'Récord',
  imageDownloaded: 'Imagen de la partida descargada',
  imageDownloadFailed: 'No se pudo generar la imagen. El enlace sigue disponible.',
  supportNudgeTitle: '¿Te gustó cs13a0?',
  supportNudgeMessage: 'Este proyecto es independiente y se mantiene en tiempo libre. Si quieres ayudar a mantener el dominio, mejoras y nuevas eras, apóyalo en Ko-fi.',
  supportOnKofi: 'Apoyar en Ko-fi',
  notNow: 'Ahora no',
  footerDescription: 'Proyecto independiente de simulación y entretenimiento competitivo.',
  sendFeedback: 'Enviar feedback',
  contact: 'Contacto',
  independentProject: 'Proyecto independiente',
  curatedGameplayStats: 'Ratings y estadísticas son curados/adaptados para gameplay.',
  footerDisclaimer: 'cs13a0 es un proyecto independiente. No está afiliado a Valve, HLTV, equipos, organizaciones ni jugadores. Los ratings y las estadísticas son curados/adaptados para gameplay.',
  compositionReady: 'Composición lista para el servidor',
  featureDraftTitle: 'DRAFT CURADO',
  featureDraftDesc: 'Una elección por equipo. Cinco oportunidades.',
  featureSeedTitle: 'SEED REAL',
  featureSeedDesc: 'Mismo camino, mismas consecuencias.',
  featureRulesTitle: 'MR12 + OT',
  featureRulesDesc: 'Stage 3, playoffs y final MD5.',
  metaDescription: 'Draft de Counter-Strike con 286 plantillas equipo-año, 1.430 versiones de jugadores y Major simulado por seed.'
});

Object.assign(dictionaries.en, {
  quarterfinal: 'Quarterfinals',
  semifinal: 'Semifinal',
  playSameSeed: 'Play the same seed',
  premier: 'Normal',
  faceit: 'Ranked',
  faceitDesc: 'In Ranked you pick by feel. The numbers appear later.',
  hiddenStats: 'Attributes hidden in Ranked',
  addAs: 'Add as',
  pending: 'To play',
  inProgress: 'In progress',
  mapInProgress: 'Map in progress',
  downloadRunImage: 'Download run image',
  shareImage: 'Share image',
  copyRunLink: 'Copy run link',
  worstRating: 'Worst rating',
  belowExpected: 'Below expectations',
  configurationSaved: 'Settings saved',
  automatic: 'Automatic',
  manual: 'Manual',
  normal: 'Normal',
  fast: 'Fast',
  ultra: 'Ultra',
  samePlayerPicked: 'Same player already selected',
  invalidRole: 'Role unavailable',
  rifleLimitReached: 'Rifle limit',
  lineHasAwper: 'AWPer already occupied',
  lineHasIgl: 'IGL already occupied',
  roleOccupied: 'Support already occupied',
  lineHasEntry: 'Entry already occupied',
  lineHasLurker: 'Lurker already occupied',
  mapsPlayed: 'Maps played',
  roundsWon: 'Rounds won',
  roundsLost: 'Rounds lost',
  maps: 'Maps',
  record: 'Record',
  imageDownloaded: 'Run image downloaded',
  imageDownloadFailed: 'The image could not be generated. The link is still available.',
  supportNudgeTitle: 'Enjoying cs13a0?',
  supportNudgeMessage: 'This is an independent project built in spare time. If you want to help cover the domain, improvements, and new eras, support it on Ko-fi.',
  supportOnKofi: 'Support on Ko-fi',
  notNow: 'Not now',
  footerDescription: 'Independent competitive simulation and entertainment project.',
  sendFeedback: 'Send feedback',
  contact: 'Contact',
  independentProject: 'Independent project',
  curatedGameplayStats: 'Ratings and stats are curated/adapted for gameplay.',
  footerDisclaimer: 'cs13a0 is an independent project. It is not affiliated with Valve, HLTV, teams, organizations, or players. Ratings and stats are curated/adapted for gameplay.',
  compositionReady: 'Composition ready for the server',
  featureDraftTitle: 'CURATED DRAFT',
  featureDraftDesc: 'One pick per team. Five chances.',
  featureSeedTitle: 'REAL SEED',
  featureSeedDesc: 'Same path, same consequences.',
  featureRulesTitle: 'MR12 + OT',
  featureRulesDesc: 'Stage 3, playoffs, and a BO5 final.',
  metaDescription: 'Counter-Strike draft with 286 team-year rosters, 1,430 player versions, and a seeded Major simulation.',
  about: 'About',
  privacy: 'Privacy',
  terms: 'Terms',
  aboutTitle: 'About cs13a0',
  aboutIntro: 'cs13a0 is an independent draft and Major simulator inspired by Counter-Strike competitive eras. The idea is simple: you build an organization by picking players from different teams and years, define your lineup identity, and try to win a Major simulation against historic and current squads.',
  aboutBorn: 'The project was born as a fan-made experience, out of love for CS and the competitive history of the game. The goal is not to create an official ranking, but a fun, replayable experience with its own identity.',
  aboutData: 'Overalls, positions, titles, and stats are curated and adapted for gameplay. Some players may receive manual adjustments to better represent historical impact, role, importance to the scene, or game balance.',
  aboutBase: 'The initial pool is limited and curated to keep the game light, fast, and balanced. New teams, players, and eras can be added over time.',
  aboutFeedback: 'Feedback is welcome. If you found an error, want to suggest a team or player, or have an improvement idea, get in touch.',
  aboutSupport: 'If you enjoyed the project and want to help cover the domain, improvements, and new eras, consider supporting on Ko-fi.',
  playNow: 'Play now',
  privacyTitle: 'Privacy Policy',
  privacyNoAccount: 'cs13a0 does not require an account. You can play directly in the browser without signing up.',
  privacyLocalStorage: 'The game uses localStorage to save local preferences such as language, light/dark theme, simulation speed, manual/auto mode, and data from the last run. localStorage stays in your browser and is not sent to any servers.',
  privacyFeedback: 'If you send feedback via the form or email, the following may be collected: name or nickname (if provided), email (if provided), player, team, or year mentioned, suggestion, message, and run seed (if submitted). Your email will only be used to respond or better understand the feedback.',
  privacyKoFi: 'The project uses Ko-fi for voluntary support. When you click the Ko-fi link, you leave cs13a0 and access an external platform governed by Ko-fi\'s own privacy policy.',
  privacyOnline: 'In the future, if an online mode is introduced, the following may be temporarily saved: room code, nickname, organization name, picks, results, room seed, and final placement. This data will be temporary and used only to keep the room running.',
  privacyNoSell: 'We do not sell personal data. We do not collect passwords. We do not ask for sensitive information.',
  privacyUpdates: 'This policy may be updated as new features are added.',
  privacyContact: 'Questions about privacy? Get in touch:',
  termsTitle: 'Terms of Use',
  termsIndependent: 'cs13a0 is an independent project, created by fans, for entertainment and simulation. It is not affiliated with, sponsored by, or approved by Valve, HLTV, teams, organizations, or players.',
  termsTrademarks: 'Counter-Strike and related trademarks belong to their respective owners.',
  termsGameplay: 'Ratings, overalls, positions, and stats are adapted for gameplay. Users should not interpret the data as an official ranking.',
  termsConduct: 'Users must not use the site for harassment, spam, or form abuse.',
  termsChanges: 'The project may change players, ratings, rules, and modes at any time.',
  termsKoFi: 'Support via Ko-fi is voluntary and does not buy any in-game advantage.',
  termsAvailability: 'The site may be temporarily unavailable for maintenance. If an online mode is introduced in the future, rooms may expire and temporary data may be deleted.',
  termsContact: 'Questions about the terms? Get in touch:',
  contactTitle: 'Contact',
  contactIntro: 'Want to get in touch? Use the email below to suggest corrections, report bugs, propose improvements, or discuss partnerships.',
  contactEmail: 'Main email',
  contactSendEmail: 'Send email',
  contactSuggestions: 'You can contact us to: suggest a player correction, suggest a new team, report a bug, suggest a visual improvement, suggest balance changes, or discuss partnerships and promotion.',
  footerNav: 'Navigation',
  placementChampion: 'Champion',
  placementRunnerUp: 'Runner-up',
  placement3to4: '3rd–4th',
  placement5to8: '5th–8th',
  roleAwper: 'AWPer',
  roleIgl: 'Captain',
  roleSupport: 'Support',
  roleRifler: 'Rifler',
  yourOrg: 'Your Org',
  titleGoatCs: 'GOAT of CS',
  titleGoatCsgo: 'GOAT of CS:GO',
  titleGoatCsgoPeak: 'GOAT of CS:GO Peak',
  badge55Teams: '286 TEAMS',
  badge275Players: '1,430 PLAYERS',
  badgeYears: '2016–2026',
  badgeSharedSeed: 'SHAREABLE SEED'
});

Object.assign(dictionaries.es, {
  about: 'Sobre',
  privacy: 'Privacidad',
  terms: 'Términos',
  aboutTitle: 'Sobre cs13a0',
  aboutIntro: 'cs13a0 es un simulador independiente de draft e Major inspirado en las eras competitivas de Counter-Strike. La idea es simple: armas una organización eligiendo jugadores de diferentes equipos y años, defines la identidad de tu alineación e intentas vencer una simulación de Major contra equipos históricos y actuales.',
  aboutBorn: 'El proyecto nació como una experiencia hecha por fans, por amor al CS y a la historia competitiva del juego. La propuesta no es crear un ranking oficial, sino una experiencia divertida, rejugable y con identidad propia.',
  aboutData: 'Los overalls, posiciones, títulos y estadísticas son curados y adaptados para gameplay. Algunos jugadores pueden recibir ajustes manuales para representar mejor el impacto histórico, la función, la importancia para la escena o el equilibrio del juego.',
  aboutBase: 'La base inicial es limitada y curada para mantener el juego ligero, rápido y balanceable. Nuevos equipos, jugadores y eras pueden ser añadidos con el tiempo.',
  aboutFeedback: 'Los feedbacks son bienvenidos. Si encontraste un error, quieres sugerir un equipo o jugador, o tienes una idea de mejoria, contáctanos.',
  aboutSupport: 'Si te gustó el proyecto y quieres ayudar a mantener el dominio, mejorias y nuevas eras, considera apoyar en Ko-fi.',
  playNow: 'Jugar ahora',
  privacyTitle: 'Política de Privacidad',
  privacyNoAccount: 'cs13a0 no requiere cuenta. Puedes jugar directamente en el navegador sin registrarte.',
  privacyLocalStorage: 'El juego usa localStorage para guardar preferencias locales como idioma, tema claro/oscuro, velocidad de simulación, modo manual/automático y datos de la última partida. El localStorage se queda en tu navegador y no se envía a servidores.',
  privacyFeedback: 'Si envías feedback por formulario o correo, pueden ser recopilados: nombre o nickname (si se proporciona), correo electrónico (si se proporciona), jugador, equipo o año mencionado, sugerencia, mensaje y seed de la partida (si se envía). El correo se usará solo para responder o entender mejor el feedback.',
  privacyKoFi: 'El proyecto usa Ko-fi para apoyo voluntario. Al hacer clic en el enlace de Ko-fi, sales de cs13a0 y accedes a una plataforma externa, regida por la propia política de privacidad de Ko-fi.',
  privacyOnline: 'En el futuro, si se introduce un modo online, podrían guardarse temporalmente: código de sala, nickname, nombre de la organización, picks, resultados, seed de sala y posición final. Estos datos serán temporales y se usarán solo para mantener la sala funcionando.',
  privacyNoSell: 'No vendemos datos personales. No recopilamos contraseñas. No pedimos datos sensibles.',
  privacyUpdates: 'Esta política puede ser actualizada conforme se añadan nuevas funcionalidades.',
  privacyContact: '¿Dudas sobre privacidad? Contáctanos:',
  termsTitle: 'Términos de Uso',
  termsIndependent: 'cs13a0 es un proyecto independiente, creado por fans, para entretenimiento y simulación. No está afiliado, patrocinado ni aprobado por Valve, HLTV, equipos, organizaciones ni jugadores.',
  termsTrademarks: 'Counter-Strike y marcas relacionadas pertenecen a sus respectivos propietarios.',
  termsGameplay: 'Los ratings, overalls, posiciones y estadísticas son adaptados para gameplay. El usuario no debe interpretar los datos como ranking oficial.',
  termsConduct: 'El usuario no debe usar el sitio para acoso, spam o abuso de formulario.',
  termsChanges: 'El proyecto puede alterar jugadores, ratings, reglas y modos en cualquier momento.',
  termsKoFi: 'El apoyo vía Ko-fi es voluntario y no compra ventaja dentro del juego.',
  termsAvailability: 'El sitio puede estar temporalmente no disponible por mantenimiento. Si se introduce un modo online en el futuro, las salas pueden expirar y los datos temporales pueden ser eliminados.',
  termsContact: '¿Dudas sobre los términos? Contáctanos:',
  contactTitle: 'Contacto',
  contactIntro: '¿Quieres ponerte en contacto? Usa el correo de abajo para sugerir correcciones, reportar bugs, proponer mejoras o hablar sobre colaboraciones.',
  contactEmail: 'Correo principal',
  contactSendEmail: 'Enviar correo',
  contactSuggestions: 'Puedes contactarnos para: sugerir corrección de jugador, sugerir nuevo equipo, reportar un bug, sugerir mejora visual, sugerir cambios de balance o hablar sobre colaboraciones y difusión.',
  footerNav: 'Navegación',
  placementChampion: 'Campeón',
  placementRunnerUp: 'Subcampeón',
  placement3to4: '3º–4º',
  placement5to8: '5º–8º',
  roleAwper: 'AWPer',
  roleIgl: 'Capitán',
  roleSupport: 'Soporte',
  roleRifler: 'Rifler',
  yourOrg: 'Tu Org',
  titleGoatCs: 'GOAT del CS',
  titleGoatCsgo: 'GOAT del CS:GO',
  titleGoatCsgoPeak: 'GOAT del CS:GO Peak',
  compositionReady: 'Composición lista para el servidor',
  featureDraftTitle: 'DRAFT CURADO',
  featureDraftDesc: 'Una elección por equipo. Cinco oportunidades.',
  featureSeedTitle: 'SEED REAL',
  featureSeedDesc: 'Mismo camino, mismas consecuencias.',
  featureRulesTitle: 'MR12 + OT',
  featureRulesDesc: 'Stage 3, playoffs y final MD5.',
  metaDescription: 'Draft de Counter-Strike con 286 plantillas equipo-año, 1.430 versiones de jugadores y Major simulado por seed.',
  badge55Teams: '286 EQUIPOS',
  badge275Players: '1.430 JUGADORES',
  badgeYears: '2016–2026',
  badgeSharedSeed: 'SEED COMPARTIBLE'
});

export const translate = (language: Language, key: TranslationKey) => dictionaries[language][key] ?? pt[key];
export type { TranslationKey };

const titleTranslationMap: Record<string, TranslationKey> = {
  'GOAT do CS': 'titleGoatCs',
  'GOAT do CS:GO': 'titleGoatCsgo',
  'GOAT do CS:GO Peak': 'titleGoatCsgoPeak'
};

export function translatePlacement(language: Language, placement: string): string {
  const key = placement as TranslationKey;
  if (key in dictionaries['pt-BR']) return translate(language, key);
  return placement;
}

export function translateTitle(language: Language, title: string): string {
  const mapped = titleTranslationMap[title];
  if (mapped) return translate(language, mapped);
  const key = title as TranslationKey;
  if (key in dictionaries['pt-BR']) return translate(language, key);
  return title;
}

export function translateTeamName(language: Language, name: string): string {
  const key = name as TranslationKey;
  if (key in dictionaries['pt-BR']) return translate(language, key);
  return name;
}
