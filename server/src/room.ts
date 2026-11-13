import { CHAT_HISTORY, type ChatMsg, type ServerMsg } from '../../shared/protocol';
import {
  DEFAULT_SETTINGS, HAND_SIZES, MAX_PLAYERS, TARGET_SCORES, TURN_SECONDS,
  type Card, type ClientState, type Color, type GameEvent, type Phase, type Settings, type StatePayload,
} from '../../shared/types';
import { chooseBotMove, type BotMove } from './bot';
import { GameError, Round } from './round';

/** Cách gửi tin tới một kết nối (Durable Object cài đặt bằng WebSocket) */
export interface Transport {
  send(connId: string, msg: ServerMsg): void;
  /** Mời ra: báo cho client rồi tách kết nối khỏi phòng */
  kick(connId: string): void;
}

export interface Member {
  id: string;
  token: string;
  name: string;
  isBot: boolean;
  sockets: Set<string>;
  score: number;
}

const BOT_NAMES = ['Bot Mèo', 'Bot Cún', 'Bot Gấu', 'Bot Thỏ', 'Bot Cáo', 'Bot Hổ', 'Bot Vịt', 'Bot Cá'];

export function randomId(len = 8, alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'): string {
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/** Ước lượng thời gian animation phía client (ms) để bot không đánh quá nhanh */
function animationTime(events: GameEvent[]): number {
  let t = 0;
  for (const e of events) {
    if (e.type === 'deal') t += 2400;
    else if (e.type === 'play' && e.card.value === 'wild4') t += 1300;
    else if (e.type === 'play' && e.card.value === 'draw2') t += 700;
    else if (e.type === 'skip' || e.type === 'reverse' || e.type === 'stack' || e.type === 'caught') t += 600;
    else if (e.type === 'draw' && e.penalty) t += Math.min(e.count, 10) * 120;
    else if (e.type === 'draw' && e.count > 1) t += Math.min(e.count, 12) * 90;
    else if (e.type === 'swap' || e.type === 'rotate') t += 1100;
  }
  return t;
}

export class Room {
  members: Member[] = [];
  hostId = '';
  settings: Settings = { ...DEFAULT_SETTINGS };
  phase: Phase = 'lobby';
  round: Round | null = null;
  roundNumber = 0;
  turnEndsAt: number | null = null;
  lastHands: { playerId: string; cards: Card[] }[] = [];
  matchWinnerId: string | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private catchTimer: ReturnType<typeof setTimeout> | null = null;
  lastActive = Date.now();
  private chatLog: ChatMsg[] = [];
  private chatSeq = 0;

  constructor(public code: string, private transport: Transport) {}

  get humansOnline(): number {
    return this.members.filter((m) => !m.isBot && m.sockets.size > 0).length;
  }

  member(id: string): Member {
    const m = this.members.find((x) => x.id === id);
    if (!m) throw new GameError('Không tìm thấy người chơi');
    return m;
  }

  /** Vào phòng mới hoặc kết nối lại bằng token */
  join(token: string, name: string, socketId: string): Member {
    let m = this.members.find((x) => x.token === token && !x.isBot);
    if (m) {
      m.sockets.add(socketId);
      if (name) m.name = name;
      return m;
    }
    if (this.phase !== 'lobby') throw new GameError('Ván đang diễn ra, chờ ván sau nhé');
    if (this.members.length >= MAX_PLAYERS) throw new GameError('Phòng đã đầy');
    m = { id: randomId(), token, name: name || 'Người chơi', isBot: false, sockets: new Set([socketId]), score: 0 };
    this.members.push(m);
    if (!this.hostId || !this.members.some((x) => x.id === this.hostId)) this.hostId = m.id;
    this.systemChat(`${m.name} đã vào phòng`);
    return m;
  }

  /** Rời phòng hẳn. Đang chơi → chuyển thành bot để ván tiếp tục */
  leave(id: string) {
    const m = this.member(id);
    this.systemChat(this.phase === 'lobby' ? `${m.name} đã rời phòng` : `${m.name} đã rời phòng, máy chơi thay`);
    if (this.phase === 'lobby') {
      this.members = this.members.filter((x) => x.id !== id);
    } else {
      m.isBot = true;
      m.sockets.clear();
      m.name = `${m.name} (máy)`;
      m.token = randomId(24);
    }
    if (this.hostId === id) {
      const next = this.members.find((x) => !x.isBot);
      this.hostId = next?.id ?? '';
    }
  }

  disconnect(socketId: string) {
    for (const m of this.members) m.sockets.delete(socketId);
  }

  assertHost(id: string) {
    if (id !== this.hostId) throw new GameError('Chỉ chủ phòng mới làm được');
  }

  addBot() {
    if (this.phase !== 'lobby') throw new GameError('Chỉ thêm bot trong phòng chờ');
    if (this.members.length >= MAX_PLAYERS) throw new GameError('Phòng đã đầy');
    const used = new Set(this.members.map((m) => m.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.members.length + 1}`;
    this.members.push({ id: randomId(), token: randomId(24), name, isBot: true, sockets: new Set(), score: 0 });
  }

  kick(id: string) {
    if (this.phase !== 'lobby') throw new GameError('Chỉ mời ra trong phòng chờ');
    if (id === this.hostId) throw new GameError('Không thể tự mời mình ra');
    const m = this.member(id);
    for (const sid of m.sockets) this.transport.kick(sid);
    this.members = this.members.filter((x) => x.id !== id);
    this.systemChat(`${m.name} đã bị mời ra khỏi phòng`);
  }

  // ---- Chat ----

  /** Gửi tin nhắn của người chơi tới cả phòng */
  chat(playerId: string, text: string) {
    const m = this.member(playerId);
    this.pushChat({ id: ++this.chatSeq, playerId, name: m.name, text, at: Date.now() });
  }

  private systemChat(text: string) {
    this.pushChat({ id: ++this.chatSeq, playerId: null, name: '', text, at: Date.now() });
  }

  private pushChat(msg: ChatMsg) {
    this.chatLog.push(msg);
    if (this.chatLog.length > CHAT_HISTORY) this.chatLog.shift();
    for (const x of this.members) for (const sid of x.sockets) this.transport.send(sid, { t: 'chat', messages: [msg] });
  }

  /** Gửi toàn bộ lịch sử chat cho một kết nối (khi mới vào hoặc vào lại) */
  sendChatHistory(connId: string) {
    this.transport.send(connId, { t: 'chat', messages: this.chatLog, history: true });
  }

  updateSettings(s: Partial<Settings>) {
    if (this.phase === 'playing') throw new GameError('Không đổi luật khi đang chơi');
    for (const k of ['stacking', 'drawUntilPlayable', 'sevenZero', 'noActionFinish'] as const) {
      if (typeof s[k] === 'boolean') this.settings[k] = s[k];
    }
    if (typeof s.turnSeconds === 'number' && TURN_SECONDS.includes(s.turnSeconds)) this.settings.turnSeconds = s.turnSeconds;
    if (typeof s.handSize === 'number' && HAND_SIZES.includes(s.handSize)) this.settings.handSize = s.handSize;
    if (typeof s.targetScore === 'number' && TARGET_SCORES.includes(s.targetScore)) this.settings.targetScore = s.targetScore;
  }

  start() {
    if (this.members.length < 2) throw new GameError('Cần ít nhất 2 người (có thể thêm bot)');
    if (this.matchWinnerId) {
      for (const m of this.members) m.score = 0;
      this.matchWinnerId = null;
    }
    // Người đánh đầu xoay vòng qua từng ván
    this.round = new Round(this.members.map((m) => m.id), { ...this.settings }, Math.random, this.roundNumber);
    this.roundNumber++;
    this.phase = 'playing';
    this.lastHands = [];
    this.broadcast(this.round.startEvents);
  }

  backToLobby() {
    this.clearTimers();
    this.phase = 'lobby';
    this.round = null;
    // Bot thay người đã rời thì bỏ đi
    this.members = this.members.filter((m) => !m.isBot || !m.name.endsWith('(máy)'));
    this.broadcast([]);
  }

  /** Thực hiện một hành động trong ván rồi gửi state cho mọi người */
  act(playerId: string, fn: (r: Round) => GameEvent[]) {
    if (this.phase !== 'playing' || !this.round) throw new GameError('Ván chưa bắt đầu');
    const events = fn(this.round);
    this.afterAction(events);
  }

  play(playerId: string, cardId: string, color?: Color, uno?: boolean, swapWith?: string) {
    this.act(playerId, (r) => r.play(playerId, cardId, color, uno, swapWith));
  }

  private afterAction(events: GameEvent[]) {
    const r = this.round!;
    if (r.winnerId) {
      const w = this.member(r.winnerId);
      w.score += r.points;
      this.lastHands = r.hands();
      this.phase = 'roundOver';
      if (this.settings.targetScore > 0 && w.score >= this.settings.targetScore) this.matchWinnerId = w.id;
    }
    this.lastActive = Date.now();
    this.broadcast(events);
  }

  reaction(playerId: string, emoji: string) {
    this.emitEvents([{ type: 'reaction', playerId, emoji }]);
  }

  destroy() {
    this.clearTimers();
    this.round = null;
    this.phase = 'lobby';
  }

  private clearTimers() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.catchTimer) clearTimeout(this.catchTimer);
    this.turnTimer = this.catchTimer = null;
    this.turnEndsAt = null;
  }

  /** Hẹn giờ cho lượt hiện tại: bot / người mất kết nối / hết giờ */
  private schedule(events: GameEvent[]) {
    this.clearTimers();
    const r = this.round;
    if (this.phase !== 'playing' || !r) return;

    // Chờ animation phía client chạy xong rồi mới cho bot đi tiếp
    const animDelay = animationTime(events);
    const cur = this.member(r.current.id);
    const offline = !cur.isBot && cur.sockets.size === 0;

    if (r.mustDraw()) {
      // Không có lá đánh được → tự rút. Rút liên tiếp (luật rút đến khi đánh được) thì nhịp nhanh hơn
      const chain = events.some((e) => e.type === 'draw' && e.playerId === cur.id && !e.penalty);
      const delay = animDelay + (chain ? 480 : 900);
      this.turnTimer = setTimeout(() => this.safe(() => this.act(cur.id, (rr) => rr.draw(cur.id))), delay);
    } else if (cur.isBot || offline) {
      const delay = animDelay + (offline ? 4000 : 900 + Math.random() * 900) + (r.hasDrawn ? -300 : 0);
      this.turnTimer = setTimeout(() => this.botTurn(cur.id), delay);
    } else if (this.settings.turnSeconds > 0) {
      const ms = this.settings.turnSeconds * 1000 + animDelay;
      this.turnEndsAt = Date.now() + ms;
      this.turnTimer = setTimeout(() => this.safe(() => this.act(cur.id, (rr) => rr.timeout(cur.id))), ms);
    }

    // Bot canh bắt UNO
    if (r.unoVulnerable) {
      const target = r.unoVulnerable;
      const catcher = this.members.find((m) => m.isBot && m.id !== target);
      if (catcher && Math.random() < 0.6) {
        this.catchTimer = setTimeout(() => {
          this.safe(() => this.act(catcher.id, (rr) => rr.catchUno(catcher.id, target)));
        }, 1800 + Math.random() * 2500);
      }
    }
  }

  private doBotMove(id: string, move: BotMove) {
    if (move.type === 'play') this.act(id, (rr) => rr.play(id, move.cardId, move.color, move.uno, move.swapWith));
    else if (move.type === 'draw') this.act(id, (rr) => rr.draw(id));
    else this.act(id, (rr) => rr.pass(id));
  }

  private botTurn(id: string) {
    this.safe(() => {
      const r = this.round!;
      this.doBotMove(id, chooseBotMove(r, id));
    });
  }

  private safe(fn: () => void) {
    try {
      fn();
    } catch (e) {
      if (!(e instanceof GameError)) console.error(e);
    }
  }

  stateFor(m: Member): ClientState {
    const r = this.round;
    const me = r?.players.find((p) => p.id === m.id);
    return {
      code: this.code,
      phase: this.phase,
      me: m.id,
      players: this.members.map((x) => ({
        id: x.id,
        name: x.name,
        cardCount: r?.players.find((p) => p.id === x.id)?.hand.length ?? 0,
        connected: x.isBot || x.sockets.size > 0,
        isBot: x.isBot,
        isHost: x.id === this.hostId,
        score: x.score,
        unoVulnerable: r?.unoVulnerable === x.id,
      })),
      hand: me?.hand ?? [],
      topCard: r?.top ?? null,
      currentColor: r?.color ?? null,
      turnPlayerId: r && this.phase === 'playing' ? r.current.id : null,
      direction: r?.direction ?? 1,
      pendingDraw: r?.pendingDraw ?? 0,
      pendingType: r?.pendingType ?? null,
      drawPileCount: r?.drawPile.length ?? 0,
      hasDrawn: !!r && r.current.id === m.id && r.hasDrawn,
      drawnCardId: r && r.current.id === m.id ? r.drawnCardId : null,
      unoArmed: me?.unoArmed ?? false,
      settings: this.settings,
      turnEndsAt: this.turnEndsAt,
      serverNow: Date.now(),
      round: this.roundNumber,
      winnerId: r?.winnerId ?? null,
      matchWinnerId: this.matchWinnerId,
      roundPoints: r?.points ?? 0,
      lastHands: this.lastHands,
    };
  }

  /** Ẩn bài rút của người khác */
  private eventsFor(m: Member, events: GameEvent[]): GameEvent[] {
    return events.map((e) => (e.type === 'draw' && e.playerId !== m.id ? { ...e, cards: undefined } : e));
  }

  broadcast(events: GameEvent[]) {
    this.schedule(events);
    for (const m of this.members) {
      if (m.isBot) continue;
      const payload: StatePayload = { state: this.stateFor(m), events: this.eventsFor(m, events) };
      for (const sid of m.sockets) this.transport.send(sid, { t: 'state', payload });
    }
  }

  /** Gửi sự kiện không đổi state (biểu cảm) */
  private emitEvents(events: GameEvent[]) {
    for (const m of this.members) for (const sid of m.sockets) this.transport.send(sid, { t: 'events', events });
  }
}
