// Kết nối realtime tới Durable Object của phòng qua WebSocket gốc của trình duyệt
import type { AckRes, ClientMsg, ServerMsg } from '@shared/protocol';
import type { Card, Color, Settings } from '@shared/types';
import { clearChat, onChat } from './chat';
import { animateLocalPlay, handleEvents, handlePayload, resetBoard } from './director';
import { toast, useStore } from './store';

function store(key: string, value?: string): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* chế độ ẩn danh */
  }
  return value ?? null;
}

function randomToken(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Mỗi trình duyệt có 1 token bí mật để kết nối lại đúng ghế */
export function token(): string {
  let t = store('uno.token');
  if (!t) t = store('uno.token', randomToken())!;
  return t;
}

export const savedName = () => store('uno.name') ?? '';
export const saveName = (n: string) => store('uno.name', n);

export function roomFromUrl(): string {
  return new URLSearchParams(location.search).get('r')?.toUpperCase() ?? '';
}

function setUrlRoom(code: string | null) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('r', code);
  else url.searchParams.delete('r');
  history.replaceState(null, '', url);
}

// ---------------------------------------------------------------------------
// Kết nối WebSocket: gửi lệnh có phản hồi, heartbeat, tự kết nối lại

const ACK_TIMEOUT = 8000;
const PING_EVERY = 15000;

let ws: WebSocket | null = null;
/** Phòng đang muốn kết nối. null = chủ động ngắt, không kết nối lại */
let roomCode: string | null = null;
let seq = 0;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
const pending = new Map<number, { resolve: (r: AckRes) => void; timer: ReturnType<typeof setTimeout> }>();

function wsUrl(code: string) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws?room=${encodeURIComponent(code)}`;
}

function failPending(error: string) {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, error });
  }
  pending.clear();
}

function onServerMsg(msg: ServerMsg) {
  switch (msg.t) {
    case 'ack': {
      const p = pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(msg.id);
        p.resolve(msg.res);
      }
      break;
    }
    case 'state':
      handlePayload(msg.payload);
      break;
    case 'events':
      handleEvents(msg.events);
      break;
    case 'chat':
      onChat(msg.messages, !!msg.history);
      break;
    case 'kicked':
      toast('Bạn đã bị mời ra khỏi phòng');
      exitRoom();
      break;
    case 'pong':
      break;
  }
}

/** Mở kết nối tới phòng; resolve khi đã kết nối (hoặc false nếu thất bại) */
function connect(code: string): Promise<boolean> {
  if (ws && roomCode === code && ws.readyState === WebSocket.OPEN) return Promise.resolve(true);
  disconnect();
  roomCode = code;
  return openSocket();
}

function openSocket(): Promise<boolean> {
  return new Promise((resolve) => {
    const code = roomCode;
    if (!code) return resolve(false);
    const sock = new WebSocket(wsUrl(code));
    ws = sock;
    let opened = false;

    sock.onopen = () => {
      opened = true;
      retry = 0;
      useStore.setState({ connected: true });
      pingTimer = setInterval(() => rawSend({ t: 'ping' }), PING_EVERY);
      resolve(true);
    };
    sock.onmessage = (e) => {
      try {
        onServerMsg(JSON.parse(e.data as string) as ServerMsg);
      } catch {
        /* bỏ qua tin hỏng */
      }
    };
    sock.onclose = () => {
      if (ws !== sock) return; // kết nối cũ đã được thay thế
      ws = null;
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      useStore.setState({ connected: false });
      failPending('Mất kết nối máy chủ');
      if (!opened) resolve(false);
      if (roomCode) scheduleReconnect();
    };
  });
}

/** Rớt mạng → thử lại với thời gian chờ tăng dần (0.5s → 5s) rồi vào lại đúng ghế */
function scheduleReconnect() {
  if (retryTimer) return;
  const delay = Math.min(5000, 500 * 2 ** retry++);
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (!roomCode) return;
    const ok = await openSocket();
    if (ok) await rejoin();
  }, delay);
}

async function rejoin() {
  const code = roomCode;
  if (!code) return;
  const res = await request('room:join', { token: token(), name: savedName() });
  if (!res.ok) {
    // Phòng không còn (ví dụ mọi người đã rời quá lâu)
    toast(res.error);
    exitRoom();
  }
}

/** Thoát hẳn khỏi phòng phía client: ngắt kết nối, xoá bàn chơi và chat, về màn hình chính */
function exitRoom() {
  disconnect();
  setUrlRoom(null);
  resetBoard();
  clearChat();
  useStore.setState({ state: null });
}

function disconnect() {
  roomCode = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  const sock = ws;
  ws = null;
  sock?.close();
  failPending('Đã ngắt kết nối');
  useStore.setState({ connected: false });
}

function rawSend(msg: ClientMsg): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
}

/** Gửi lệnh và chờ server phản hồi */
export function request(ev: string, data?: unknown): Promise<AckRes> {
  return new Promise((resolve) => {
    const id = ++seq;
    if (!rawSend({ t: 'req', id, ev, data: data ?? {} })) {
      resolve({ ok: false, error: 'Mất kết nối máy chủ' });
      return;
    }
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, error: 'Máy chủ không phản hồi' });
    }, ACK_TIMEOUT);
    pending.set(id, { resolve, timer });
  });
}

/** Gửi hành động, báo lỗi bằng toast */
export async function act(event: string, data?: unknown): Promise<boolean> {
  const res = await request(event, data);
  if (!res.ok) toast(res.error);
  return res.ok;
}

// ---------------------------------------------------------------------------
// Phòng chơi

export async function createRoom(name: string): Promise<AckRes> {
  saveName(name);
  try {
    const r = await fetch('/api/rooms', { method: 'POST' });
    const body = (await r.json()) as { code?: string; error?: string };
    if (!r.ok || !body.code) return { ok: false, error: body.error ?? 'Không tạo được phòng' };
    return await joinRoom(body.code, name);
  } catch {
    return { ok: false, error: 'Không kết nối được máy chủ' };
  }
}

export async function joinRoom(code: string, name: string): Promise<AckRes> {
  saveName(name);
  const c = code.trim().toUpperCase();
  if (!(await connect(c))) {
    disconnect();
    return { ok: false, error: 'Không kết nối được tới phòng' };
  }
  const res = await request('room:join', { token: token(), name });
  if (res.ok) setUrlRoom(c);
  else disconnect();
  return res;
}

export async function leaveRoom() {
  await request('room:leave');
  exitRoom();
}

export const actions = {
  /** Lá bay ngay lập tức, không chờ server; server từ chối thì hoàn tác */
  play: async (card: Card, color?: Color, swapWith?: string) => {
    const undo = animateLocalPlay(card, color);
    const ok = await act('game:play', { cardId: card.id, color, swapWith });
    if (!ok) undo();
    return ok;
  },
  draw: () => act('game:draw'),
  pass: () => act('game:pass'),
  uno: () => act('game:uno'),
  catchUno: (targetId: string) => act('game:catch', { targetId }),
  start: () => act('game:start'),
  lobby: () => act('game:lobby'),
  addBot: () => act('room:addBot'),
  kick: (playerId: string) => act('room:kick', { playerId }),
  settings: (s: Partial<Settings>) => act('room:settings', s),
  reaction: (emoji: string) => request('reaction', { emoji }),
  chat: (text: string) => act('chat', { text }),
};

// Mở link mời / F5 khi đang trong phòng → tự vào lại (nếu đã có tên)
const initialRoom = roomFromUrl();
if (initialRoom && savedName()) {
  void joinRoom(initialRoom, savedName()).then((res) => {
    if (!res.ok) {
      toast(res.error);
      setUrlRoom(null);
    }
  });
}

// Quay lại tab sau khi điện thoại khoá màn hình: kết nối lại ngay thay vì chờ
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && roomCode && !ws && retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
    retry = 0;
    scheduleReconnect();
  }
});
