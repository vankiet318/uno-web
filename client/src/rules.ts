import { canJumpIn, canPlay, finishBlocked, type Card, type ClientState } from '@shared/types';

export type PlayKind = 'turn' | 'jump' | null;

/** Lá này mình đánh được không: 'turn' = đang tới lượt, 'jump' = chặn ngang, null = không */
export function playKind(state: ClientState, card: Card): PlayKind {
  if (state.phase !== 'playing') return null;
  if (finishBlocked(card, state.hand.length, state.settings)) return null;
  if (state.turnPlayerId === state.me) {
    if (state.hasDrawn && card.id !== state.drawnCardId) return null;
    return canPlay(card, state.topCard, state.currentColor, state.pendingDraw, state.pendingType, state.settings.stacking) ? 'turn' : null;
  }
  return canJumpIn(card, state.topCard, state.pendingDraw, state.settings) ? 'jump' : null;
}
