import type { Language } from '../types';
import type { OnlineGameMode } from './contracts';

const online = {
  'pt-BR': {
    playOnline: 'Jogar online', title: 'Major online', intro: 'Crie uma sala efêmera ou entre com um código. Sem conta e sem histórico.', mode: 'Modo', host: 'Criar sala', join: 'Entrar na sala', playerName: 'Seu nome', orgName: 'Nome da organização', roomCode: 'Código da sala', lobby: 'Lobby', copyLink: 'Copiar link', participants: 'Participantes', disconnected: 'Desconectado', connected: 'Conectado', connecting: 'Conectando', reconnecting: 'Reconectando', start: 'Iniciar Major', startRound: 'Iniciar rodada do Major', waitingHost: 'Aguardando o host iniciar a rodada', live: 'Ao vivo', capacity: 'Capacidade', entryStage: 'Entrada', deadline: 'Prazo do draft', speed: 'Velocidade', draft: 'Draft online', draw: 'Sortear time', reroll: 'Rerollar', choose: 'Escolher', style: 'Estilo', waiting: 'Aguardando os outros jogadores', currentGame: 'Minha partida', allGames: 'Visão do Major', standings: 'Tabela', bracket: 'Chaveamento', buchholz: 'Buchholz', wins: 'V', losses: 'D', noGames: 'Aguardando os primeiros resultados', champion: 'Campeão', back: 'Voltar', shareRoom: 'Link da sala copiado', completeRoles: 'Defina cinco funções únicas', configurePro: 'Confirmar PRO', deadlineOff: 'Sem prazo'
  },
  en: {
    playOnline: 'Play online', title: 'Online Major', intro: 'Create an ephemeral room or join with a code. No account and no history.', mode: 'Mode', host: 'Create room', join: 'Join room', playerName: 'Your name', orgName: 'Organization name', roomCode: 'Room code', lobby: 'Lobby', copyLink: 'Copy link', participants: 'Participants', disconnected: 'Disconnected', connected: 'Connected', connecting: 'Connecting', reconnecting: 'Reconnecting', start: 'Start Major', startRound: 'Start Major round', waitingHost: 'Waiting for the host to start the round', live: 'Live', capacity: 'Capacity', entryStage: 'Entry stage', deadline: 'Draft deadline', speed: 'Speed', draft: 'Online draft', draw: 'Draw team', reroll: 'Reroll', choose: 'Choose', style: 'Style', waiting: 'Waiting for the other players', currentGame: 'My match', allGames: 'Major overview', standings: 'Standings', bracket: 'Bracket', buchholz: 'Buchholz', wins: 'W', losses: 'L', noGames: 'Waiting for the first results', champion: 'Champion', back: 'Back', shareRoom: 'Room link copied', completeRoles: 'Assign five unique roles', configurePro: 'Confirm PRO', deadlineOff: 'No deadline'
  },
  es: {
    playOnline: 'Jugar online', title: 'Major online', intro: 'Crea una sala efímera o entra con un código. Sin cuenta ni historial.', mode: 'Modo', host: 'Crear sala', join: 'Entrar a la sala', playerName: 'Tu nombre', orgName: 'Nombre de la organización', roomCode: 'Código de sala', lobby: 'Lobby', copyLink: 'Copiar enlace', participants: 'Participantes', disconnected: 'Desconectado', connected: 'Conectado', connecting: 'Conectando', reconnecting: 'Reconectando', start: 'Iniciar Major', startRound: 'Iniciar ronda del Major', waitingHost: 'Esperando que el host inicie la ronda', live: 'En vivo', capacity: 'Capacidad', entryStage: 'Entrada', deadline: 'Plazo del draft', speed: 'Velocidad', draft: 'Draft online', draw: 'Sortear equipo', reroll: 'Reroll', choose: 'Elegir', style: 'Estilo', waiting: 'Esperando a los otros jugadores', currentGame: 'Mi partido', allGames: 'Vista del Major', standings: 'Tabla', bracket: 'Llaves', buchholz: 'Buchholz', wins: 'V', losses: 'D', noGames: 'Esperando los primeros resultados', champion: 'Campeón', back: 'Volver', shareRoom: 'Enlace de sala copiado', completeRoles: 'Asigna cinco funciones únicas', configurePro: 'Confirmar PRO', deadlineOff: 'Sin plazo'
  }
} as const;

export type OnlineTranslationKey = keyof typeof online['pt-BR'];
export const translateOnline = (language: Language, key: OnlineTranslationKey) => online[language][key];

const modePresentation: Record<Language, Record<OnlineGameMode, { name: string; description: string }>> = {
  'pt-BR': {
    premier: { name: 'Normal', description: 'Atributos visíveis e até três rerolls.' },
    faceit: { name: 'Ranked', description: 'Atributos ocultos durante o draft e um reroll.' },
    pro: { name: 'PRO', description: 'Ofertas cegas, funções únicas e um reroll.' },
    fun: { name: 'Resenha', description: 'Somente lines históricas com média 82 ou maior; um reroll.' },
    max_fun: { name: 'Resenha Máxima', description: 'Lines com média 90 ou maior, ou 80 ou menor; um reroll.' }
  },
  en: {
    premier: { name: 'Normal', description: 'Visible attributes and up to three rerolls.' },
    faceit: { name: 'Ranked', description: 'Hidden attributes during the draft and one reroll.' },
    pro: { name: 'PRO', description: 'Blind offers, unique roles, and one reroll.' },
    fun: { name: '4FUN', description: 'Historical lineups with an 82 or higher average only; one reroll.' },
    max_fun: { name: 'Maximum Banter', description: 'Lineups averaging 90 or higher, or 80 or lower; one reroll.' }
  },
  es: {
    premier: { name: 'Normal', description: 'Atributos visibles y hasta tres rerolls.' },
    faceit: { name: 'Ranked', description: 'Atributos ocultos durante el draft y un reroll.' },
    pro: { name: 'PRO', description: 'Ofertas a ciegas, funciones únicas y un reroll.' },
    fun: { name: 'De Chill', description: 'Solo alineaciones históricas con media 82 o superior; un reroll.' },
    max_fun: { name: 'Locura Máxima', description: 'Alineaciones con media 90 o superior, o 80 o inferior; un reroll.' }
  }
};

export const translateOnlineMode = (language: Language, mode: OnlineGameMode) => modePresentation[language][mode];
