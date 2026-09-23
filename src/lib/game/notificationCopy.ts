import type { Language } from './types';

const coins = (value: number, language: Language) => value.toLocaleString(language);

export function queueIncreaseMessage(language: Language, count: number): string {
  if (language === 'pt-BR') return `Mais alguém entrou na fila · agora são ${count} ${count === 1 ? 'jogador' : 'jogadores'}`;
  if (language === 'es') return `Alguien más entró en la cola · ahora hay ${count} ${count === 1 ? 'jugador' : 'jugadores'}`;
  return `Someone joined the queue · ${count} ${count === 1 ? 'player' : 'players'} waiting`;
}

export function runRewardMessage(language: Language, amount: number): string {
  if (language === 'pt-BR') return `Run concluída · +${coins(amount, language)} coins`;
  if (language === 'es') return `Partida finalizada · +${coins(amount, language)} coins`;
  return `Run complete · +${coins(amount, language)} coins`;
}

export function insufficientCoinsMessage(language: Language): string {
  if (language === 'pt-BR') return 'Moedas insuficientes para concluir esta ação.';
  if (language === 'es') return 'No tienes coins suficientes para completar esta acción.';
  return 'Not enough coins to complete this action.';
}

export function boostSummaryMessage(language: Language, spent: number, earned: number, net: number): string {
  const result = `${net >= 0 ? '+' : '−'}${coins(Math.abs(net), language)}`;
  if (language === 'pt-BR') return `Boost · ${coins(spent, language)} gastos · +${coins(earned, language)} ganhos · saldo ${result} coins`;
  if (language === 'es') return `Boost · ${coins(spent, language)} gastados · +${coins(earned, language)} ganados · saldo ${result} coins`;
  return `Boost · ${coins(spent, language)} spent · +${coins(earned, language)} earned · net ${result} coins`;
}

export function boostResultLabels(language: Language) {
  if (language === 'pt-BR') return { spent: 'Custo do item', earned: 'Coins ganhos', net: 'Saldo líquido' };
  if (language === 'es') return { spent: 'Costo del artículo', earned: 'Coins ganados', net: 'Saldo neto' };
  return { spent: 'Item cost', earned: 'Coins earned', net: 'Net balance' };
}
