import type { Language } from '../types';
import type { OnlineGameMode } from './contracts';

const online = {
  'pt-BR': {
    playOnline: 'Jogar online', title: 'Major online', intro: 'Crie uma sala efêmera ou entre com um código. Sem conta e sem histórico.', mode: 'Modo', host: 'Criar sala', join: 'Entrar na sala', playerName: 'Seu nome', orgName: 'Nome da organização', roomCode: 'Código da sala', lobby: 'Lobby', copyLink: 'Copiar link', participants: 'Participantes', disconnected: 'Desconectado', connected: 'Conectado', connecting: 'Conectando', reconnecting: 'Reconectando', start: 'Iniciar Major', startRound: 'Iniciar rodada do Major', waitingHost: 'Aguardando o host iniciar a rodada', live: 'Ao vivo', capacity: 'Capacidade', entryStage: 'Entrada', deadline: 'Prazo do draft', speed: 'Velocidade', draft: 'Draft online', draw: 'Sortear time', reroll: 'Rerollar', choose: 'Escolher', style: 'Estilo', waiting: 'Aguardando os outros jogadores', currentGame: 'Minha partida', allGames: 'Visão do Major', standings: 'Tabela', bracket: 'Chaveamento', buchholz: 'Buchholz', wins: 'V', losses: 'D', noGames: 'Aguardando os primeiros resultados', champion: 'Campeão', back: 'Voltar', shareRoom: 'Link da sala copiado', completeRoles: 'Defina cinco funções únicas', configurePro: 'Confirmar PRO', deadlineOff: 'Sem prazo', confirmDeadline: 'Prazo para confirmar', sessionExpired: 'Sua sessão nesta sala expirou. Entre novamente com seu nome.', connectionFailed: 'Não foi possível conectar ao servidor online.', connectionLost: 'Conexão perdida. Tentando reconectar…', connectionGaveUp: 'Não foi possível reconectar. Tente novamente.', roomNotFound: 'Sala não encontrada.', roomStarted: 'Esta sala já começou.', roomFull: 'A sala está cheia.', nameTaken: 'Este nome de organização já está em uso.', invalidCode: 'Código inválido: use 8 caracteres.', notReady: 'A conexão ainda não está pronta.', versionMismatch: 'Versão incompatível com o servidor. Atualize a página.', createFailed: 'Não foi possível criar a sala.', rateLimited: 'Muitas tentativas. Aguarde um instante.', mapsConfirmed: 'mapas', rolesConfirmed: 'funções'
  },
  en: {
    playOnline: 'Play online', title: 'Online Major', intro: 'Create an ephemeral room or join with a code. No account and no history.', mode: 'Mode', host: 'Create room', join: 'Join room', playerName: 'Your name', orgName: 'Organization name', roomCode: 'Room code', lobby: 'Lobby', copyLink: 'Copy link', participants: 'Participants', disconnected: 'Disconnected', connected: 'Connected', connecting: 'Connecting', reconnecting: 'Reconnecting', start: 'Start Major', startRound: 'Start Major round', waitingHost: 'Waiting for the host to start the round', live: 'Live', capacity: 'Capacity', entryStage: 'Entry stage', deadline: 'Draft deadline', speed: 'Speed', draft: 'Online draft', draw: 'Draw team', reroll: 'Reroll', choose: 'Choose', style: 'Style', waiting: 'Waiting for the other players', currentGame: 'My match', allGames: 'Major overview', standings: 'Standings', bracket: 'Bracket', buchholz: 'Buchholz', wins: 'W', losses: 'L', noGames: 'Waiting for the first results', champion: 'Champion', back: 'Back', shareRoom: 'Room link copied', completeRoles: 'Assign five unique roles', configurePro: 'Confirm PRO', deadlineOff: 'No deadline', confirmDeadline: 'Confirmation deadline', sessionExpired: 'Your session in this room expired. Join again with your name.', connectionFailed: 'Could not connect to the online server.', connectionLost: 'Connection lost. Reconnecting…', connectionGaveUp: 'Could not reconnect. Try again.', roomNotFound: 'Room not found.', roomStarted: 'This room has already started.', roomFull: 'The room is full.', nameTaken: 'This organization name is already in use.', invalidCode: 'Invalid code: use 8 characters.', notReady: 'The connection is not ready yet.', versionMismatch: 'Version mismatch with the server. Refresh the page.', createFailed: 'Could not create the room.', rateLimited: 'Too many attempts. Wait a moment.', mapsConfirmed: 'maps', rolesConfirmed: 'roles'
  },
  es: {
    playOnline: 'Jugar online', title: 'Major online', intro: 'Crea una sala efímera o entra con un código. Sin cuenta ni historial.', mode: 'Modo', host: 'Crear sala', join: 'Entrar a la sala', playerName: 'Tu nombre', orgName: 'Nombre de la organización', roomCode: 'Código de sala', lobby: 'Lobby', copyLink: 'Copiar enlace', participants: 'Participantes', disconnected: 'Desconectado', connected: 'Conectado', connecting: 'Conectando', reconnecting: 'Reconectando', start: 'Iniciar Major', startRound: 'Iniciar ronda del Major', waitingHost: 'Esperando que el host inicie la ronda', live: 'En vivo', capacity: 'Capacidad', entryStage: 'Entrada', deadline: 'Plazo del draft', speed: 'Velocidad', draft: 'Draft online', draw: 'Sortear equipo', reroll: 'Reroll', choose: 'Elegir', style: 'Estilo', waiting: 'Esperando a los otros jugadores', currentGame: 'Mi partido', allGames: 'Vista del Major', standings: 'Tabla', bracket: 'Llaves', buchholz: 'Buchholz', wins: 'V', losses: 'D', noGames: 'Esperando los primeros resultados', champion: 'Campeón', back: 'Volver', shareRoom: 'Enlace de sala copiado', completeRoles: 'Asigna cinco funciones únicas', configurePro: 'Confirmar PRO', deadlineOff: 'Sin plazo', confirmDeadline: 'Plazo para confirmar', sessionExpired: 'Tu sesión en esta sala expiró. Entra de nuevo con tu nombre.', connectionFailed: 'No se pudo conectar al servidor online.', connectionLost: 'Conexión perdida. Reconectando…', connectionGaveUp: 'No se pudo reconectar. Inténtalo de nuevo.', roomNotFound: 'Sala no encontrada.', roomStarted: 'Esta sala ya comenzó.', roomFull: 'La sala está llena.', nameTaken: 'Este nombre de organización ya está en uso.', invalidCode: 'Código inválido: usa 8 caracteres.', notReady: 'La conexión aún no está lista.', versionMismatch: 'Versión incompatible con el servidor. Actualiza la página.', createFailed: 'No se pudo crear la sala.', rateLimited: 'Demasiados intentos. Espera un momento.', mapsConfirmed: 'mapas', rolesConfirmed: 'funciones'
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
