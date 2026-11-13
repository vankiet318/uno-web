import { canPlay, finishBlocked, type Card, type ClientState } from '@shared/types';

/** Lá này mình đánh được lúc này không (đang tới lượt + hợp luật) */
export function canPlayNow(state: ClientState, card: Card): boolean {
  if (state.phase !== 'playing' || state.turnPlayerId !== state.me) return false;
  if (finishBlocked(card, state.hand.length, state.settings)) return false;
  if (state.hasDrawn && card.id !== state.drawnCardId) return false;
  return canPlay(card, state.topCard, state.currentColor, state.pendingDraw, state.pendingType, state.settings.stacking);
}
