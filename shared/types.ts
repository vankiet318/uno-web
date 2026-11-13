// Kiểu dữ liệu & luật dùng chung giữa client và server

export type Color = 'red' | 'yellow' | 'green' | 'blue';
export type CardColor = Color | 'wild';
export type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
}

export const COLORS: Color[] = ['red', 'yellow', 'green', 'blue'];

export const COLOR_NAMES_VI: Record<Color, string> = {
  red: 'Đỏ',
  yellow: 'Vàng',
  green: 'Xanh lá',
  blue: 'Xanh dương',
};

export interface Settings {
  /** Cho phép chồng +2 lên +2, +4 lên +2/+4 */
  stacking: boolean;
  /** Số giây mỗi lượt, 0 = không giới hạn */
  turnSeconds: number;
  /** Rút liên tục đến khi được lá đánh được, rồi bắt buộc đánh */
  drawUntilPlayable: boolean;
  /** Đánh 7: đổi bài với 1 người. Đánh 0: cả bàn chuyền bài theo chiều chơi */
  sevenZero: boolean;
  /** Lá cuối cùng phải là lá số */
  noActionFinish: boolean;
  /** Số lá chia mỗi người */
  handSize: number;
  /** Điểm để vô địch, 0 = chơi không giới hạn */
  targetScore: number;
}

export const CLASSIC_SETTINGS: Settings = {
  stacking: false,
  turnSeconds: 30,
  drawUntilPlayable: false,
  sevenZero: false,
  noActionFinish: false,
  handSize: 7,
  targetScore: 0,
};

export const CHAOS_SETTINGS: Settings = {
  stacking: true,
  turnSeconds: 30,
  drawUntilPlayable: true,
  sevenZero: true,
  noActionFinish: true,
  handSize: 7,
  targetScore: 0,
};

export const DEFAULT_SETTINGS: Settings = { ...CLASSIC_SETTINGS, stacking: true };

export const HAND_SIZES = [5, 7, 10];
export const TARGET_SCORES = [0, 200, 500];
export const TURN_SECONDS = [0, 15, 30, 60];
export const MAX_PLAYERS = 10;

export type Phase = 'lobby' | 'playing' | 'roundOver';
export type PendingType = 'draw2' | 'wild4' | null;

export interface PublicPlayer {
  id: string;
  name: string;
  cardCount: number;
  connected: boolean;
  isBot: boolean;
  isHost: boolean;
  score: number;
  /** Đang có 1 lá mà chưa hô UNO — có thể bị bắt */
  unoVulnerable: boolean;
  /** Vào giữa ván: chỉ xem, được chia bài từ ván sau */
  spectator: boolean;
}

export interface ClientState {
  code: string;
  phase: Phase;
  me: string;
  players: PublicPlayer[];
  hand: Card[];
  topCard: Card | null;
  currentColor: Color | null;
  turnPlayerId: string | null;
  direction: 1 | -1;
  pendingDraw: number;
  pendingType: PendingType;
  drawPileCount: number;
  hasDrawn: boolean;
  drawnCardId: string | null;
  unoArmed: boolean;
  settings: Settings;
  turnEndsAt: number | null;
  serverNow: number;
  round: number;
  winnerId: string | null;
  /** Người đạt điểm vô địch (khi bật điểm thắng chung cuộc) */
  matchWinnerId: string | null;
  roundPoints: number;
  lastHands: { playerId: string; cards: Card[] }[];
}

export type GameEvent =
  | { type: 'deal'; order: string[]; perPlayer: number }
  | { type: 'play'; playerId: string; card: Card; color: Color }
  | { type: 'draw'; playerId: string; count: number; cards?: Card[]; penalty?: boolean }
  | { type: 'skip'; playerId: string }
  | { type: 'reverse'; direction: 1 | -1 }
  | { type: 'color'; color: Color; playerId: string }
  | { type: 'stack'; total: number; targetId: string }
  | { type: 'uno'; playerId: string }
  | { type: 'caught'; catcherId: string; targetId: string }
  | { type: 'pass'; playerId: string }
  | { type: 'shuffle' }
  | { type: 'timeout'; playerId: string }
  | { type: 'win'; playerId: string; points: number }
  | { type: 'reaction'; playerId: string; emoji: string }
  | { type: 'swap'; a: string; b: string }
  | { type: 'rotate'; direction: 1 | -1 };

export interface StatePayload {
  state: ClientState;
  events: GameEvent[];
}

export function isWild(card: Card): boolean {
  return card.value === 'wild' || card.value === 'wild4';
}

export function canPlay(
  card: Card,
  top: Card | null,
  currentColor: Color | null,
  pendingDraw: number,
  pendingType: PendingType,
  stacking: boolean,
): boolean {
  if (pendingDraw > 0) {
    if (!stacking) return false;
    if (card.value === 'wild4') return true;
    return card.value === 'draw2' && pendingType === 'draw2';
  }
  if (isWild(card)) return true;
  if (!top) return true;
  return card.color === currentColor || card.value === top.value;
}

export const isNumber = (card: Card) => /^\d$/.test(card.value);

/** Luật 'không về bằng lá chức năng': lá cuối không được là lá chức năng */
export function finishBlocked(card: Card, handCount: number, settings: Settings): boolean {
  return settings.noActionFinish && handCount === 1 && !isNumber(card);
}

/** Lá 7 cần chọn người đổi bài (khi còn bài sau khi đánh) */
export function needsSwapTarget(card: Card, handCount: number, settings: Settings): boolean {
  return settings.sevenZero && card.value === '7' && handCount > 1;
}

export function cardPoints(card: Card): number {
  if (isWild(card)) return 50;
  if (card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2') return 20;
  return Number(card.value);
}

export const REACTIONS = ['😂', '😡', '😱', '🔥', '👏', '🤡', '🍅', '💀'];
