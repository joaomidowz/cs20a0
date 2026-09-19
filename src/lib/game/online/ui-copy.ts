import type { Language } from '../types';

const copy = {
  play: ['Jogar', 'Play', 'Jugar'], team: ['Time', 'Team', 'Equipo'], account: ['Conta', 'Account', 'Cuenta'],
  boxes: ['Caixas', 'Cases', 'Cajas'], coins: ['Comprar coins', 'Buy coins', 'Comprar coins'],
  loading: ['Carregando…', 'Loading…', 'Cargando…'], saving: ['Salvando…', 'Saving…', 'Guardando…'],
  working: ['Processando…', 'Processing…', 'Procesando…'], retry: ['Tentar novamente', 'Try again', 'Reintentar'],
  unsaved: ['Alterações não salvas', 'Unsaved changes', 'Cambios sin guardar'],
  leaveTitle: ['Sair sem salvar o time?', 'Leave without saving your team?', '¿Salir sin guardar el equipo?'],
  leaveBody: ['Seu time salvo continuará sendo usado nas partidas.', 'Matches will use your previously saved team.', 'Las partidas usarán tu equipo guardado anteriormente.'],
  discard: ['Descartar alterações', 'Discard changes', 'Descartar cambios'],
  savePlay: ['Salvar e jogar', 'Save and play', 'Guardar y jugar'],
  chooseCard: ['Escolher carta', 'Choose a card', 'Elegir carta'],
  replace: ['Substituir', 'Replace', 'Sustituir'], edit: ['Editar perfil', 'Edit profile', 'Editar perfil'],
  filters: ['Filtros', 'Filters', 'Filtros'], clear: ['Limpar filtros', 'Clear filters', 'Limpiar filtros'],
  noCards: ['Nenhuma carta encontrada. Ajuste os filtros ou abra uma caixa na Store.', 'No cards found. Adjust filters or open a case in the Store.', 'No hay cartas. Ajusta los filtros o abre una caja en Store.'],
  missing: ['Faltam', 'Missing', 'Faltan'], continue: ['Continuar', 'Continue', 'Continuar'],
  controls: ['Controles da partida', 'Match controls', 'Controles de la partida'],
  rules: ['Configurações da sala', 'Room settings', 'Configuración de sala'],
  progress: ['Em andamento', 'In progress', 'En progreso'],
  received: ['Recompensa recebida', 'Reward received', 'Recompensa recibida'],
  review: ['Revisar troca', 'Review trade', 'Revisar intercambio'],
  confirmTrade: ['Confirmar troca', 'Confirm trade', 'Confirmar intercambio'],
  nextMatch: ['Jogar novamente', 'Play again', 'Jugar de nuevo'],
  report: ['Detalhes das recompensas', 'Reward details', 'Detalles de recompensas'],
  details: ['Detalhes', 'Details', 'Detalles'],
  chooseStake: ['Selecionar cartas', 'Select cards', 'Seleccionar cartas'],
  chooseTarget: ['Escolher alvo', 'Choose target', 'Elegir objetivo'],
  reviewUpgrade: ['Revisar upgrade', 'Review upgrade', 'Revisar upgrade'],
  remaining: ['Complete o time para salvar', 'Complete the team to save', 'Completa el equipo para guardar'],
  friends: ['Jogar com amigos', 'Play with friends', 'Jugar con amigos'],
  storeHint: ['Caixas, promoções e upgrades para sua coleção.', 'Cases, offers and upgrades for your collection.', 'Cajas, ofertas y upgrades para tu colección.'],
  teamHint: ['Monte sua line, salve e entre na próxima partida.', 'Build your lineup, save and join the next match.', 'Arma tu equipo, guarda y entra en la próxima partida.'],
  confirmBuy: ['Confirmar compra', 'Confirm purchase', 'Confirmar compra'],
  walletLabel: ['Carteira', 'Wallet', 'Cartera'], packsShort: ['pacotes', 'packs', 'sobres'], cardsShort: ['cartas', 'cards', 'cartas'],
  addCoins: ['+ Coins', '+ Coins', '+ Coins'],
  promoCoach: ['Promo Coach', 'Coach promo', 'Promo Coach'],
  promoOwned: ['Você já tem', 'You already have it', 'Ya la tienes'],
  promoFrom: ['de', 'was', 'de'], promoFor: ['por', 'now', 'por'],
  promoEnlarge: ['Ampliar carta', 'Enlarge card', 'Ampliar carta'],
  promoAdded: ['Carta adicionada à coleção', 'Card added to your collection', 'Carta añadida a la colección'],
  back: ['Voltar', 'Back', 'Volver'], next: ['Avançar', 'Next', 'Siguiente'],
  step: ['Etapa', 'Step', 'Paso'],
  tradeExpiresIn: ['Expira em', 'Expires in', 'Expira en'],
  tradeStepTeam: ['Time', 'Team', 'Equipo'], tradeStepTheirs: ['Carta dele', 'Their card', 'Su carta'],
  tradeStepMine: ['Sua carta', 'Your card', 'Tu carta'], tradeStepCoins: ['Coins e revisão', 'Coins and review', 'Coins y revisión'],
  tradeTeamHint: ['Digite o nome exato do time do outro jogador.', 'Type the exact team name of the other player.', 'Escribe el nombre exacto del equipo del otro jugador.'],
  tradeTheirsHint: ['Cartas dele que você ainda não tem.', 'Their cards you do not have yet.', 'Sus cartas que aún no tienes.'],
  tradeMineHint: ['Cartas do time salvo ficam travadas.', 'Cards on your saved team are locked.', 'Las cartas del equipo guardado quedan bloqueadas.'],
  tradeNoTheirs: ['Esse time não tem cartas que você ainda não tenha.', 'This team has no card you do not own yet.', 'Ese equipo no tiene cartas que no tengas.'],
  tradeNoMine: ['Você não tem cartas livres para oferecer.', 'You have no free cards to offer.', 'No tienes cartas libres para ofrecer.'],
  tradeFilter: ['Filtrar por nome', 'Filter by name', 'Filtrar por nombre'],
  tradePick: ['Escolher', 'Pick', 'Elegir'], tradeChange: ['Trocar', 'Change', 'Cambiar'],
  showMore: ['Mostrar mais', 'Show more', 'Mostrar más'],
  tradeEmptyReceived: ['Nenhuma proposta recebida. Proponha uma troca e movimente o mercado.', 'No proposals received. Send one and get the market moving.', 'No recibiste propuestas. Envía una y mueve el mercado.'],
  tradeEmptySent: ['Você ainda não enviou propostas.', 'You have not sent any proposals yet.', 'Aún no enviaste propuestas.'],
} as const;

export type UiKey = keyof typeof copy;
export const uiCopy = (language: Language, key: UiKey): string => copy[key][language === 'en' ? 1 : language === 'es' ? 2 : 0];

/** Only local online destinations may be restored after authentication. */
export function safeOnlineReturn(value: string | null): string {
  if (!value) return '/online';
  try {
    const url = new URL(value, 'https://local.invalid');
    if (url.origin !== 'https://local.invalid' || !/^\/online(?:\/|$)/.test(url.pathname) || url.pathname === '/online/conta') return '/online';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/online'; }
}
