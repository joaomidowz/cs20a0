import type { Language } from './types';

const pt = {
  play: 'Jogar',
  headline: 'Monte uma line impossível e sobreviva ao Major.',
  subheadline: 'Sorteie times lendários, escolha apenas um jogador por elenco e tente vencer dinastias como SK 2016, Astralis 2018, NaVi 2021, Vitality 2025 e outras.',
  curated: 'Base curada com o top 5 de cada ano, 55 times históricos/atuais e 275 versões de jogadores entre 2016 e 2026.',
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
} as const;

type TranslationKey = keyof typeof pt;

const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  'pt-BR': pt,
  es: {
    ...pt,
    play: 'Jugar', headline: 'Monta una alineación imposible y sobrevive al Major.', subheadline: 'Sortea equipos legendarios, elige solo un jugador por plantilla e intenta vencer dinastías históricas.', curated: 'Base curada con el top 5 de cada año, 55 equipos históricos/actuales y 275 versiones de jugadores entre 2016 y 2026.', chooseMode: 'Elige tu cola', premierDesc: 'Mira el overall y los atributos durante el draft. Ideal para la primera partida.', faceitDesc: 'En Faceit eliges por intuición. Los números aparecen después.', chooseStyle: 'Estilo de la organización', aggressive: 'Agresivo', balanced: 'Equilibrado', tactical: 'Táctico', aggressiveDesc: 'Más potencia y entry, menos consistencia.', balancedDesc: 'Consistencia y mental sin grandes riesgos.', tacticalDesc: 'IGL, apoyo y mental en primer plano.', rollTeam: 'Sortear equipo', opportunity: 'Oportunidad', pickOne: 'Elige solo un jugador de esta plantilla.', choosePlayer: 'Elegir jugador', close: 'Cerrar', orgHud: 'HUD de la organización', complete: 'Alineación confirmada', estimatedPower: 'Poder estimado', startMajor: 'Comenzar Major', majorSetup: 'Configuración del Major', manual: 'Manual', automatic: 'Automático', simulationMode: 'Modo de simulación', speed: 'Velocidad', normal: 'Normal', fast: 'Rápido', ultra: 'Ultra', insta: 'Insta', enterMajor: 'Entrar al Stage 3', startSeries: 'Iniciar serie', nextMatch: 'Siguiente partida', skipMap: 'Saltar mapa actual', round: 'Ronda', seriesChance: 'Probabilidad aproximada', result: 'Resultado de la partida', champion: 'CAMPEÓN DEL MAJOR', eliminated: 'PARTIDA FINALIZADA', campaign: 'Campaña', placement: 'Posición', seriesWon: 'Series ganadas', seriesLost: 'Series perdidas', mapsWon: 'Mapas ganados', mapsLost: 'Mapas perdidos', tryAgain: 'Intentar de nuevo', seeStats: 'Ver estadísticas', copySeed: 'Copiar seed', shareRun: 'Compartir partida', newSeed: 'Nueva seed', copied: 'Enlace copiado', stats: 'Estadísticas de la partida', runMvp: 'MVP de la partida', backResult: 'Volver al resultado', composition: 'Lectura de composición', noAwper: 'Sin AWPer principal', noIgl: 'Sin IGL', manyRiflers: 'Demasiados riflers', aggressiveLine: 'Alineación agresiva', tacticalLine: 'Alineación táctica', revealed: 'Atributos revelados', hiddenStats: 'Atributos ocultos en Faceit', allMatches: 'Partidas de la run', emptyTitle: 'Tu próxima era empieza aquí.', modeIntro: 'Elige cuánta información quieres llevar a la mesa.', noRepeat: 'Un equipo no puede aparecer dos veces en la misma partida.', majorRules: 'Stage 3: 3 victorias clasifican y 3 derrotas eliminan. Todas las series son MD3; la final es MD5.', autoDesc: 'El Major avanza solo.', manualDesc: 'Controla cada serie.', waitingResult: 'Esperando el primer resultado...', statsSeed: 'Datos ficticios, coherentes y reproducibles por la seed.', map: 'Mapa', final: 'FINAL', waiting: 'ESPERANDO', veryAggressive: 'muy agresivo', greatClutch: 'gran clutch', mainAwper: 'AWPer principal', tacticalProfile: 'perfil táctico', consistentPlayer: 'jugador consistente', versatileProfile: 'perfil versátil', chooseStyleBeforeRoll: 'Elige el estilo de tu organización antes de abrir la primera oportunidad.', useAs: 'Usar como', howUsePlayer: '¿Cómo quieres usar este jugador?', roleOccupied: 'Función ocupada', samePlayerPicked: 'El mismo jugador ya fue elegido', rifleLimitReached: 'Límite de rifles alcanzado', lineHasAwper: 'Tu equipo ya tiene un AWPer', lineHasIgl: 'Tu equipo ya tiene un IGL', lineHasEntry: 'Tu equipo ya tiene un entry/opener', lineHasLurker: 'Tu equipo ya tiene un lurker/closer', orgComposition: 'Composición de la organización', assignedRole: 'Función asignada', invalidRole: 'Elige una función válida para este jugador.', optional: 'opcional', noSupport: 'Sin support principal'
  },
  en: {
    ...pt,
    play: 'Play', headline: 'Build an impossible lineup and survive the Major.', subheadline: 'Roll legendary teams, choose one player from each roster, and try to beat historic dynasties.', curated: 'Curated pool with each year’s top 5, 55 historic/current teams, and 275 player versions from 2016 through 2026.', chooseMode: 'Choose your queue', premierDesc: 'See overall, attributes, title, and rarity throughout the draft. Best for a first run.', faceitDesc: 'In Faceit you pick by feel. The numbers appear later.', chooseStyle: 'Organization style', aggressive: 'Aggressive', balanced: 'Balanced', tactical: 'Tactical', aggressiveDesc: 'More firepower and entry, less consistency.', balancedDesc: 'Consistency and mental with no major risks.', tacticalDesc: 'IGL, support, and mental come first.', rollTeam: 'Roll team', opportunity: 'Opportunity', pickOne: 'Choose only one player from this roster.', choosePlayer: 'Choose player', close: 'Close', orgHud: 'Organization HUD', complete: 'Lineup confirmed', estimatedPower: 'Estimated power', startMajor: 'Start Major', majorSetup: 'Major setup', manual: 'Manual', automatic: 'Automatic', simulationMode: 'Simulation mode', speed: 'Speed', normal: 'Normal', fast: 'Fast', ultra: 'Ultra', insta: 'Insta', enterMajor: 'Enter Stage 3', startSeries: 'Start series', nextMatch: 'Next match', skipMap: 'Skip current map', round: 'Round', seriesChance: 'Approximate chance', result: 'Run result', champion: 'MAJOR CHAMPION', eliminated: 'RUN OVER', campaign: 'Campaign', placement: 'Placement', seriesWon: 'Series won', seriesLost: 'Series lost', mapsWon: 'Maps won', mapsLost: 'Maps lost', tryAgain: 'Try again', seeStats: 'View statistics', copySeed: 'Copy seed', shareRun: 'Share run', newSeed: 'New seed', copied: 'Link copied', stats: 'Run statistics', runMvp: 'Run MVP', backResult: 'Back to result', composition: 'Composition readout', noAwper: 'No primary AWPer', noIgl: 'No IGL', manyRiflers: 'Too many riflers', aggressiveLine: 'Aggressive lineup', tacticalLine: 'Tactical lineup', revealed: 'Attributes revealed', hiddenStats: 'Attributes hidden in Faceit', allMatches: 'Run matches', emptyTitle: 'Your next era starts here.', modeIntro: 'Choose how much information you want at the table.', noRepeat: 'A team cannot appear twice in the same run.', majorRules: 'Stage 3: 3 wins qualify and 3 losses eliminate. Every series is BO3; the final is BO5.', autoDesc: 'The Major advances on its own.', manualDesc: 'Control each series.', waitingResult: 'Waiting for the first result...', statsSeed: 'Fictional, coherent data reproducible by seed.', map: 'Map', final: 'FINAL', waiting: 'WAITING', veryAggressive: 'very aggressive', greatClutch: 'great clutch player', mainAwper: 'primary AWPer', tacticalProfile: 'tactical profile', consistentPlayer: 'consistent player', versatileProfile: 'versatile profile', chooseStyleBeforeRoll: 'Choose your organization style before opening the first opportunity.', useAs: 'Use as', howUsePlayer: 'How do you want to use this player?', roleOccupied: 'Role occupied', samePlayerPicked: 'Same player already selected', rifleLimitReached: 'Rifle limit reached', lineHasAwper: 'Your lineup already has an AWPer', lineHasIgl: 'Your lineup already has an IGL', lineHasEntry: 'Your lineup already has an entry/opener', lineHasLurker: 'Your lineup already has a lurker/closer', orgComposition: 'Organization composition', assignedRole: 'Assigned role', invalidRole: 'Choose a valid role for this player.', optional: 'optional', noSupport: 'No primary support'
  }
};

Object.assign(dictionaries.es, {
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
  footerDisclaimer: 'cs13a0 es un proyecto independiente. No está afiliado a Valve, HLTV, equipos, organizaciones ni jugadores. Los ratings y las estadísticas son curados/adaptados para gameplay.'
});

Object.assign(dictionaries.en, {
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
  footerDisclaimer: 'cs13a0 is an independent project. It is not affiliated with Valve, HLTV, teams, organizations, or players. Ratings and stats are curated/adapted for gameplay.'
});

export const translate = (language: Language, key: TranslationKey) => dictionaries[language][key] ?? pt[key];
export type { TranslationKey };
