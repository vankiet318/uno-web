// Cloudflare Worker: phục vụ giao diện, cấp mã phòng, chuyển kết nối WebSocket vào Durable Object của phòng
import { DurableObject } from 'cloudflare:workers';
import { CHAT_MAX_LEN, ROOM_CODE_ALPHABET, ROOM_CODE_RE, type AckRes, type ClientMsg, type ServerMsg } from '../../shared/protocol';
import { COLORS, REACTIONS, type Color, type Settings } from '../../shared/types';
import { GameError, type Round } from './round';
import { randomId, Room, type Transport } from './room';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>;
  ASSETS: Fetcher;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // Tạo phòng: chọn mã ngẫu nhiên chưa ai dùng
    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      for (let i = 0; i < 8; i++) {
        const code = randomId(5, ROOM_CODE_ALPHABET);
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        if (await stub.claim(code)) return json({ code });
      }
      return json({ error: 'Không tạo được phòng, thử lại nhé' }, 503);
    }

    // Kết nối realtime vào phòng
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Cần WebSocket', { status: 426 });
      const code = (url.searchParams.get('room') ?? '').toUpperCase();
      if (!ROOM_CODE_RE.test(code)) return new Response('Mã phòng không hợp lệ', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
    }

    if (url.pathname === '/health') return json({ ok: true });

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------

interface Conn {
  ws: WebSocket;
  playerId?: string;
  lastSeen: number;
  lastReaction: number;
  lastChat: number;
}

const HEARTBEAT_MS = 20_000;
const STALE_MS = 50_000;
/** Không còn ai kết nối bao lâu thì xoá phòng (để Durable Object được giải phóng) */
const EMPTY_ROOM_MS = 10 * 60_000;

function cleanName(name: unknown): string {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

/**
 * Mỗi phòng chơi là một Durable Object: giữ WebSocket của mọi người trong phòng, trạng thái ván
 * và các đồng hồ (bot, tự rút bài, hết giờ). Mọi tin nhắn được xử lý tuần tự nên không bị tranh chấp.
 */
export class RoomDO extends DurableObject<Env> {
  private room: Room | null = null;
  private conns = new Map<string, Conn>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private emptyTimer: ReturnType<typeof setTimeout> | null = null;

  private transport: Transport = {
    send: (connId, msg) => this.send(connId, msg),
    kick: (connId) => {
      const c = this.conns.get(connId);
      if (!c) return;
      this.send(connId, { t: 'kicked' });
      c.playerId = undefined;
      try {
        c.ws.close(4000, 'kicked');
      } catch {
        /* đã đóng */
      }
      this.conns.delete(connId);
    },
  };

  /** Giữ chỗ mã phòng khi tạo phòng mới. false = mã đang được dùng */
  async claim(code: string): Promise<boolean> {
    if (this.room) return false;
    this.room = new Room(code, this.transport);
    // Không ai vào trong 1 phút thì nhả mã
    this.armEmptyTimer(60_000);
    return true;
  }

  async fetch(req: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    const id = crypto.randomUUID();
    this.conns.set(id, { ws: server, lastSeen: Date.now(), lastReaction: 0, lastChat: 0 });
    this.startHeartbeat();
    this.cancelEmptyTimer();

    server.addEventListener('message', (e) => this.onMessage(id, e.data));
    server.addEventListener('close', () => this.onClose(id));
    server.addEventListener('error', () => this.onClose(id));
    void req;
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- Kết nối ----

  private send(connId: string, msg: ServerMsg) {
    const c = this.conns.get(connId);
    if (!c) return;
    try {
      c.ws.send(JSON.stringify(msg));
    } catch {
      this.onClose(connId);
    }
  }

  private onClose(connId: string) {
    const c = this.conns.get(connId);
    if (!c) return;
    this.conns.delete(connId);
    if (this.room) {
      this.room.disconnect(connId);
      if (c.playerId) this.room.broadcast([]);
    }
    if (this.conns.size === 0) {
      this.stopHeartbeat();
      this.armEmptyTimer(EMPTY_ROOM_MS);
    }
  }

  /** Đóng kết nối "chết" (rớt mạng mà không báo) */
  private startHeartbeat() {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      const now = Date.now();
      for (const [id, c] of this.conns) {
        if (now - c.lastSeen > STALE_MS) {
          try {
            c.ws.close(4001, 'timeout');
          } catch {
            /* bỏ qua */
          }
          this.onClose(id);
        }
      }
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private armEmptyTimer(ms: number) {
    this.cancelEmptyTimer();
    this.emptyTimer = setTimeout(() => {
      if (this.conns.size > 0) return;
      this.room?.destroy();
      this.room = null;
    }, ms);
  }

  private cancelEmptyTimer() {
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.emptyTimer = null;
  }

  // ---- Tin nhắn ----

  private onMessage(connId: string, raw: string | ArrayBuffer) {
    const c = this.conns.get(connId);
    if (!c) return;
    c.lastSeen = Date.now();
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (msg.t === 'ping') {
      this.send(connId, { t: 'pong' });
      return;
    }
    if (msg.t !== 'req' || typeof msg.id !== 'number') return;

    let res: AckRes;
    try {
      const code = this.handle(c, connId, String(msg.ev), (msg.data ?? {}) as Record<string, unknown>);
      res = { ok: true, code: code || undefined };
    } catch (e) {
      if (!(e instanceof GameError)) console.error(e);
      res = { ok: false, error: e instanceof GameError ? e.message : 'Lỗi máy chủ' };
    }
    this.send(connId, { t: 'ack', id: msg.id, res });
  }

  /** Xử lý một lệnh từ người chơi. Lỗi luật chơi → ném GameError */
  private handle(c: Conn, connId: string, ev: string, d: Record<string, unknown>): string | void {
    if (ev === 'room:join') {
      const room = this.room;
      if (!room) throw new GameError('Không tìm thấy phòng');
      const token = d.token;
      if (typeof token !== 'string' || token.length < 8) throw new GameError('Token không hợp lệ');
      const m = room.join(token, cleanName(d.name), connId);
      c.playerId = m.id;
      this.cancelEmptyTimer();
      room.broadcast([]);
      room.sendChatHistory(connId);
      return room.code;
    }

    const room = this.room;
    const pid = c.playerId;
    if (!room || !pid) throw new GameError('Bạn chưa vào phòng');
    const act = (fn: (r: Round, pid: string) => ReturnType<Round['draw']>) => room.act(pid, (r) => fn(r, pid));

    switch (ev) {
      case 'room:leave': {
        room.leave(pid);
        room.disconnect(connId);
        c.playerId = undefined;
        if (room.members.every((m) => m.isBot)) {
          room.destroy();
          this.room = null;
        } else room.broadcast([]);
        return;
      }
      case 'room:addBot':
        room.assertHost(pid);
        room.addBot();
        room.broadcast([]);
        return;
      case 'room:kick':
        room.assertHost(pid);
        room.kick(String(d.playerId));
        room.broadcast([]);
        return;
      case 'room:settings':
        room.assertHost(pid);
        room.updateSettings(d as Partial<Settings>);
        room.broadcast([]);
        return;
      case 'game:start':
        room.assertHost(pid);
        if (room.phase === 'playing') throw new GameError('Ván đang diễn ra');
        room.start();
        return;
      case 'game:lobby':
        room.assertHost(pid);
        room.backToLobby();
        return;
      case 'game:play': {
        const color = COLORS.includes(d.color as Color) ? (d.color as Color) : undefined;
        const swapWith = d.swapWith ? String(d.swapWith) : undefined;
        act((r, p) => r.play(p, String(d.cardId), color, !!d.uno, swapWith));
        return;
      }
      case 'game:draw':
        act((r, p) => r.draw(p));
        return;
      case 'game:pass':
        act((r, p) => r.pass(p));
        return;
      case 'game:uno':
        act((r, p) => r.callUno(p));
        return;
      case 'game:catch':
        act((r, p) => r.catchUno(p, String(d.targetId)));
        return;
      case 'chat': {
        const text = String(d.text ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
        if (!text) throw new GameError('Tin nhắn trống');
        if (Date.now() - c.lastChat < 700) throw new GameError('Gửi chậm lại chút nhé');
        c.lastChat = Date.now();
        room.chat(pid, text);
        return;
      }
      case 'reaction': {
        const emoji = String(d.emoji);
        if (!REACTIONS.includes(emoji) || Date.now() - c.lastReaction < 600) return;
        c.lastReaction = Date.now();
        room.reaction(pid, emoji);
        return;
      }
      default:
        throw new GameError('Lệnh không hợp lệ');
    }
  }
}
