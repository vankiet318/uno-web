// Giao thức tin nhắn WebSocket giữa trình duyệt và Durable Object của phòng
import type { GameEvent, StatePayload } from './types';

export type AckRes = { ok: true; code?: string } | { ok: false; error: string };

export interface ChatMsg {
  id: number;
  /** null = tin hệ thống (vào/rời phòng) */
  playerId: string | null;
  name: string;
  text: string;
  at: number;
}

export const CHAT_MAX_LEN = 200;
export const CHAT_HISTORY = 50;

/** Trình duyệt → server */
export type ClientMsg =
  /** Yêu cầu có phản hồi (giống emit + ack của Socket.IO) */
  | { t: 'req'; id: number; ev: string; data?: unknown }
  /** Heartbeat để giữ kết nối và phát hiện rớt mạng */
  | { t: 'ping' };

/** Server → trình duyệt */
export type ServerMsg =
  | { t: 'ack'; id: number; res: AckRes }
  | { t: 'state'; payload: StatePayload }
  | { t: 'events'; events: GameEvent[] }
  /** history = true: danh sách đầy đủ khi mới vào phòng, thay thế lịch sử cũ */
  | { t: 'chat'; messages: ChatMsg[]; history?: boolean }
  | { t: 'kicked' }
  | { t: 'pong' };

export const ROOM_CODE_RE = /^[A-Z2-9]{5}$/;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
