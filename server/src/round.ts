import {
  canJumpIn, canPlay, cardPoints, COLORS, finishBlocked, isWild, needsSwapTarget,
  type Card, type CardValue, type Color, type GameEvent, type PendingType, type Settings,
} from '../../shared/types';

export class GameError extends Error {}

export interface RoundPlayer {
  id: string;
  hand: Card[];
  /** Đã bấm UNO trước khi đánh lá áp chót */
  unoArmed: boolean;
}

export type Rng = () => number;

export function createDeck(): Card[] {
  const deck: Card[] = [];
  let n = 0;
  const add = (color: Card['color'], value: CardValue) => deck.push({ id: `c${n++}`, color, value });
  for (const color of COLORS) {
    add(color, '0');
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'] as CardValue[]) {
      add(color, v);
      add(color, v);
    }
  }
  for (let i = 0; i < 4; i++) {
    add('wild', 'wild');
    add('wild', 'wild4');
  }
  return deck;
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Màu xuất hiện nhiều nhất trên tay (dùng khi máy tự chọn màu) */
export function bestColor(hand: Card[]): Color {
  const count: Record<Color, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) if (c.color !== 'wild') count[c.color]++;
  return COLORS.reduce((a, b) => (count[b] > count[a] ? b : a), COLORS[Math.floor(Math.random() * 4)]);
}

/**
 * Một ván UNO. Thuần logic, không có timer hay mạng → dễ test.
 * Mỗi hành động trả về danh sách sự kiện để client chạy animation.
 */
export class Round {
  players: RoundPlayer[];
  drawPile: Card[];
  discard: Card[] = [];
  color: Color;
  turn: number;
  direction: 1 | -1 = 1;
  pendingDraw = 0;
  pendingType: PendingType = null;
  hasDrawn = false;
  drawnCardId: string | null = null;
  unoVulnerable: string | null = null;
  winnerId: string | null = null;
  points = 0;
  readonly startEvents: GameEvent[] = [];

  constructor(playerIds: string[], public settings: Settings, private rng: Rng = Math.random, startIndex = 0) {
    if (playerIds.length < 2) throw new GameError('Cần ít nhất 2 người chơi');
    const handSize = settings.handSize;
    this.players = playerIds.map((id) => ({ id, hand: [], unoArmed: false }));
    this.drawPile = shuffle(createDeck(), rng);
    for (let i = 0; i < handSize; i++) {
      for (const p of this.players) p.hand.push(this.drawPile.pop()!);
    }
    // Lật lá đầu: chỉ chấp nhận lá số cho đơn giản
    let first = this.drawPile.pop()!;
    while (!/^\d$/.test(first.value)) {
      this.drawPile.unshift(first);
      first = this.drawPile.pop()!;
    }
    this.discard.push(first);
    this.color = first.color as Color;
    this.turn = startIndex % this.players.length;
    this.startEvents.push({ type: 'deal', order: this.players.map((p) => p.id), perPlayer: handSize });
  }

  get top(): Card {
    return this.discard[this.discard.length - 1];
  }

  get current(): RoundPlayer {
    return this.players[this.turn];
  }

  player(id: string): RoundPlayer {
    const p = this.players.find((x) => x.id === id);
    if (!p) throw new GameError('Không tìm thấy người chơi');
    return p;
  }

  private idx(steps: number): number {
    const n = this.players.length;
    return (((this.turn + this.direction * steps) % n) + n) % n;
  }

  private assertTurn(id: string) {
    if (this.winnerId) throw new GameError('Ván đã kết thúc');
    if (this.current.id !== id) throw new GameError('Chưa tới lượt bạn');
  }

  private nextTurn(steps = 1) {
    this.turn = this.idx(steps);
    this.hasDrawn = false;
    this.drawnCardId = null;
  }

  /** Người kế tiếp hành động → người trước hết cơ hội bị bắt UNO */
  private clearVulnerable(actorId: string) {
    if (this.unoVulnerable && this.unoVulnerable !== actorId) this.unoVulnerable = null;
  }

  private drawCards(p: RoundPlayer, n: number, events: GameEvent[]): Card[] {
    const got: Card[] = [];
    for (let i = 0; i < n; i++) {
      if (this.drawPile.length === 0) {
        const top = this.discard.pop()!;
        if (this.discard.length === 0) {
          this.discard.push(top);
          break;
        }
        this.drawPile = shuffle(this.discard, this.rng);
        this.discard = [top];
        events.push({ type: 'shuffle' });
      }
      got.push(this.drawPile.pop()!);
    }
    p.hand.push(...got);
    if (p.hand.length > 1) {
      p.unoArmed = false;
      if (this.unoVulnerable === p.id) this.unoVulnerable = null;
    }
    return got;
  }

  /** Lá này người chơi có đánh được lúc này không (gồm cả chặn ngang khi chưa tới lượt) */
  playable(card: Card, playerId: string = this.current.id): boolean {
    const p = this.player(playerId);
    if (finishBlocked(card, p.hand.length, this.settings)) return false;
    if (playerId !== this.current.id) return canJumpIn(card, this.top, this.pendingDraw, this.settings);
    return canPlay(card, this.top, this.color, this.pendingDraw, this.pendingType, this.settings.stacking);
  }

  private canStack(c: Card, p: RoundPlayer): boolean {
    if (finishBlocked(c, p.hand.length, this.settings)) return false;
    return canPlay(c, this.top, this.color, this.pendingDraw, this.pendingType, true);
  }

  play(id: string, cardId: string, chosen?: Color, sayUno = false, swapWith?: string): GameEvent[] {
    if (this.winnerId) throw new GameError('Ván đã kết thúc');
    const p = this.player(id);
    const ci = p.hand.findIndex((c) => c.id === cardId);
    if (ci < 0) throw new GameError('Bạn không có lá này');
    const card = p.hand[ci];
    const jumping = id !== this.current.id;

    // ---- Kiểm tra hợp lệ (chưa thay đổi gì) ----
    if (jumping) {
      if (!this.playable(card, id)) throw new GameError('Chưa tới lượt bạn');
    } else {
      if (this.hasDrawn && this.drawnCardId !== cardId) throw new GameError('Chỉ được đánh lá vừa rút');
      if (!this.playable(card, id)) {
        throw new GameError(finishBlocked(card, p.hand.length, this.settings) ? 'Không được về bằng lá chức năng' : 'Không đánh được lá này');
      }
    }
    if (isWild(card) && (!chosen || !COLORS.includes(chosen))) throw new GameError('Hãy chọn màu');
    const swapTarget = needsSwapTarget(card, p.hand.length - 1, this.settings)
      ? this.players.find((x) => x.id === swapWith && x.id !== id)
      : undefined;
    if (needsSwapTarget(card, p.hand.length - 1, this.settings) && !swapTarget) throw new GameError('Hãy chọn người để đổi bài');

    // ---- Thực hiện ----
    const events: GameEvent[] = [];
    if (jumping) {
      this.turn = this.players.indexOf(p);
      this.hasDrawn = false;
      this.drawnCardId = null;
      events.push({ type: 'jumpIn', playerId: id });
    }
    this.clearVulnerable(id);
    p.hand.splice(ci, 1);
    this.discard.push(card);
    this.color = isWild(card) ? chosen! : (card.color as Color);
    events.push({ type: 'play', playerId: id, card, color: this.color });

    if (p.hand.length === 1) {
      if (sayUno || p.unoArmed) events.push({ type: 'uno', playerId: id });
      else this.unoVulnerable = id;
    }
    p.unoArmed = false;

    if (p.hand.length === 0) {
      this.winnerId = id;
      this.unoVulnerable = null;
      this.points = this.players.reduce((s, o) => s + o.hand.reduce((a, c) => a + cardPoints(c), 0), 0);
      events.push({ type: 'win', playerId: id, points: this.points });
      return events;
    }

    // Luật 7-0
    if (this.settings.sevenZero && card.value === '7' && swapTarget) {
      [p.hand, swapTarget.hand] = [swapTarget.hand, p.hand];
      events.push({ type: 'swap', a: id, b: swapTarget.id });
      this.resetUnoAfterExchange();
    } else if (this.settings.sevenZero && card.value === '0') {
      const hands = this.players.map((x) => x.hand);
      const n = this.players.length;
      this.players.forEach((_, i) => {
        this.players[(((i + this.direction) % n) + n) % n].hand = hands[i];
      });
      events.push({ type: 'rotate', direction: this.direction });
      this.resetUnoAfterExchange();
    }

    switch (card.value) {
      case 'skip': {
        events.push({ type: 'skip', playerId: this.players[this.idx(1)].id });
        this.nextTurn(2);
        break;
      }
      case 'reverse': {
        this.direction = this.direction === 1 ? -1 : 1;
        events.push({ type: 'reverse', direction: this.direction });
        if (this.players.length === 2) {
          // 2 người: đổi chiều = cấm lượt
          events.push({ type: 'skip', playerId: this.players[this.idx(1)].id });
          this.nextTurn(2);
        } else {
          this.nextTurn(1);
        }
        break;
      }
      case 'draw2':
      case 'wild4': {
        if (card.value === 'wild4') events.push({ type: 'color', color: this.color, playerId: id });
        this.pendingDraw += card.value === 'draw2' ? 2 : 4;
        this.pendingType = card.value;
        const victim = this.players[this.idx(1)];
        if (this.settings.stacking && this.pendingDraw > (card.value === 'draw2' ? 2 : 4)) {
          events.push({ type: 'stack', total: this.pendingDraw, targetId: victim.id });
        }
        if (this.settings.stacking && victim.hand.some((c) => this.canStack(c, victim))) {
          // Người kế có thể chồng tiếp — để họ quyết định
          this.nextTurn(1);
        } else {
          // Phạt ngay và mất lượt
          const got = this.drawCards(victim, this.pendingDraw, events);
          events.push({ type: 'draw', playerId: victim.id, count: got.length, cards: got, penalty: true });
          events.push({ type: 'skip', playerId: victim.id });
          this.pendingDraw = 0;
          this.pendingType = null;
          this.nextTurn(2);
        }
        break;
      }
      case 'wild':
        events.push({ type: 'color', color: this.color, playerId: id });
        this.nextTurn(1);
        break;
      default:
        this.nextTurn(1);
    }
    return events;
  }

  /** Sau khi đổi/chuyền bài: không ai bị bắt UNO oan */
  private resetUnoAfterExchange() {
    this.unoVulnerable = null;
    for (const x of this.players) x.unoArmed = false;
  }

  draw(id: string): GameEvent[] {
    this.assertTurn(id);
    if (this.hasDrawn) throw new GameError('Bạn đã rút rồi, hãy đánh lá vừa rút');
    const p = this.current;
    const events: GameEvent[] = [];
    this.clearVulnerable(id);

    if (this.pendingDraw > 0) {
      const got = this.drawCards(p, this.pendingDraw, events);
      events.push({ type: 'draw', playerId: id, count: got.length, cards: got, penalty: true });
      events.push({ type: 'skip', playerId: id });
      this.pendingDraw = 0;
      this.pendingType = null;
      this.nextTurn(1);
      return events;
    }

    // Mỗi lần rút đúng 1 lá. Luật "rút đến khi đánh được": lá không đánh được thì vẫn giữ lượt
    // để rút tiếp (server tự rút từng lá một để có animation)
    const got = this.drawCards(p, 1, events);
    events.push({ type: 'draw', playerId: id, count: got.length, cards: got });
    const card = got[0];
    if (card && this.playable(card, id)) {
      this.hasDrawn = true;
      this.drawnCardId = card.id;
    } else if (!(card && this.settings.drawUntilPlayable && this.canDrawMore())) {
      events.push({ type: 'pass', playerId: id });
      this.nextTurn(1);
    }
    return events;
  }

  /** Còn bài để rút không (chồng rút hoặc chồng bỏ còn hơn 1 lá để xào lại) */
  canDrawMore(): boolean {
    return this.drawPile.length > 0 || this.discard.length > 1;
  }

  /** Người đang tới lượt không có lá nào đánh được → phải rút (server tự rút) */
  mustDraw(): boolean {
    if (this.winnerId || this.hasDrawn) return false;
    const p = this.current;
    return !p.hand.some((c) => this.playable(c, p.id));
  }

  pass(id: string): GameEvent[] {
    this.assertTurn(id);
    if (!this.hasDrawn) throw new GameError('Phải rút bài trước khi bỏ lượt');
    if (this.settings.drawUntilPlayable) throw new GameError('Luật rút đến khi đánh được: phải đánh lá vừa rút');
    this.nextTurn(1);
    return [{ type: 'pass', playerId: id }];
  }

  /** Người có ít bài nhất (để máy chọn đổi bài khi đánh 7) */
  fewestCardsOpponent(id: string): string {
    const others = this.players.filter((x) => x.id !== id);
    return others.reduce((a, b) => (b.hand.length < a.hand.length ? b : a)).id;
  }

  /** Máy tự đánh lá vừa rút (luật rút đến khi đánh được) */
  private autoPlayDrawn(id: string): GameEvent[] {
    const p = this.player(id);
    const card = p.hand.find((c) => c.id === this.drawnCardId)!;
    const rest = p.hand.filter((c) => c.id !== card.id);
    return this.play(id, card.id, isWild(card) ? bestColor(rest) : undefined, false, this.fewestCardsOpponent(id));
  }

  /** Hô UNO: trước khi đánh (còn 2 lá, đang tới lượt) hoặc sau khi đánh (còn 1 lá, chưa bị bắt) */
  callUno(id: string): GameEvent[] {
    if (this.winnerId) return [];
    const p = this.player(id);
    if (p.hand.length === 1 && this.unoVulnerable === id) {
      this.unoVulnerable = null;
      return [{ type: 'uno', playerId: id }];
    }
    if (p.hand.length === 2 && this.current.id === id) {
      p.unoArmed = true;
      return [];
    }
    throw new GameError('Chưa hô UNO được lúc này');
  }

  catchUno(catcherId: string, targetId: string): GameEvent[] {
    if (this.winnerId) return [];
    if (catcherId === targetId || this.unoVulnerable !== targetId) throw new GameError('Không bắt được');
    const target = this.player(targetId);
    this.unoVulnerable = null;
    const events: GameEvent[] = [{ type: 'caught', catcherId, targetId }];
    const got = this.drawCards(target, 2, events);
    events.push({ type: 'draw', playerId: targetId, count: got.length, cards: got, penalty: true });
    return events;
  }

  /**
   * Hết giờ: chưa rút thì rút 1 lá (nhận phạt nếu đang bị cộng dồn); đã rút được lá đánh được thì
   * bỏ lượt, hoặc tự đánh lá đó nếu bật luật rút đến khi đánh được.
   * Nếu vẫn chưa có lá đánh được, server sẽ tiếp tục tự rút từng lá.
   */
  timeout(id: string): GameEvent[] {
    this.assertTurn(id);
    const events: GameEvent[] = [{ type: 'timeout', playerId: id }];
    if (!this.hasDrawn) events.push(...this.draw(id));
    if (this.hasDrawn && this.current.id === id && !this.winnerId) {
      events.push(...(this.settings.drawUntilPlayable ? this.autoPlayDrawn(id) : this.pass(id)));
    }
    return events;
  }

  /** Bài còn lại trên tay mọi người (hiển thị khi hết ván) */
  hands() {
    return this.players.map((p) => ({ playerId: p.id, cards: p.hand }));
  }
}
