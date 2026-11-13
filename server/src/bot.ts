import { isWild, type Card, type Color } from '../../shared/types';
import { bestColor, type Round } from './round';

export type BotMove =
  | { type: 'play'; cardId: string; color?: Color; uno: boolean; swapWith?: string }
  | { type: 'draw' }
  | { type: 'pass' };

/** Điểm ưu tiên: đánh lá hành động/màu trùng trước, giữ Wild cho lúc cần */
function score(card: Card, round: Round, nextCount: number): number {
  let s = 0;
  if (card.color === round.color) s += 10;
  if (card.value === 'draw2' || card.value === 'skip') s += nextCount <= 2 ? 30 : 8;
  if (card.value === 'reverse') s += 6;
  if (card.value === 'wild') s -= 20;
  if (card.value === 'wild4') s -= nextCount <= 2 ? -25 : 30;
  if (/^\d$/.test(card.value)) s += Number(card.value) * 0.5;
  // Luật 7-0: đánh 7 khi có người ít bài hơn mình hẳn
  if (round.settings.sevenZero && card.value === '7') {
    const me = round.players.find((p) => p.id === round.current.id)!;
    const fewest = Math.min(...round.players.filter((p) => p !== me).map((p) => p.hand.length));
    s += me.hand.length - fewest >= 3 ? 40 : -5;
  }
  return s;
}

function playMove(round: Round, botId: string, card: Card): BotMove {
  const me = round.player(botId);
  const rest = me.hand.filter((c) => c.id !== card.id);
  return {
    type: 'play',
    cardId: card.id,
    color: isWild(card) ? bestColor(rest) : undefined,
    uno: rest.length === 1 && Math.random() < 0.85,
    swapWith: round.fewestCardsOpponent(botId),
  };
}

export function chooseBotMove(round: Round, botId: string): BotMove {
  const me = round.player(botId);
  const n = round.players.length;
  const next = round.players[(((round.turn + round.direction) % n) + n) % n];
  let options = me.hand.filter((c) => round.playable(c, botId));
  if (round.hasDrawn) options = options.filter((c) => c.id === round.drawnCardId);

  if (options.length === 0) {
    if (!round.hasDrawn) return { type: 'draw' };
    return { type: 'pass' };
  }

  options.sort((a, b) => score(b, round, next.hand.length) - score(a, round, next.hand.length));
  return playMove(round, botId, options[0]);
}

/** Bot (chưa tới lượt) có lá giống hệt để chặn ngang không */
export function findJumpIn(round: Round, botId: string): BotMove | null {
  if (round.current.id === botId || round.winnerId) return null;
  const card = round.player(botId).hand.find((c) => round.playable(c, botId));
  return card ? playMove(round, botId, card) : null;
}
