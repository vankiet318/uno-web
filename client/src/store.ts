import { create } from 'zustand';
import type { Card, ClientState, Color } from '@shared/types';

export interface Pt {
  x: number;
  y: number;
}

export type Effect =
  | { id: number; kind: 'bigText'; text: string; sub?: string; color?: Color | 'wild' | 'dark'; size?: number }
  | { id: number; kind: 'wild4'; color: Color }
  | { id: number; kind: 'stamp'; at: Pt }
  | { id: number; kind: 'reverse'; direction: 1 | -1 }
  | { id: number; kind: 'ripple'; at: Pt; color: Color }
  | { id: number; kind: 'seatText'; at: Pt; text: string; tone: 'uno' | 'penalty' | 'info' }
  | { id: number; kind: 'emoji'; at: Pt; emoji: string };

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
export type EffectInput = DistributiveOmit<Effect, 'id'>;

export interface DiscardItem {
  card: Card;
  rot: number;
  dx: number;
  dy: number;
  key: number;
}

interface Store {
  state: ClientState | null;
  connected: boolean;
  clockOffset: number;
  effects: Effect[];
  discard: DiscardItem[];
  /** Lá trên tay mình đang bay tới, chưa hiện */
  hiddenCards: Set<string>;
  /** Số lá đang bay tới chỗ người khác */
  incoming: Record<string, number>;
  toasts: { id: number; text: string }[];
  muted: boolean;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem('uno.muted') === '1';
  } catch {
    return false;
  }
}

export const useStore = create<Store>(() => ({
  state: null,
  connected: false,
  clockOffset: 0,
  effects: [],
  discard: [],
  hiddenCards: new Set(),
  incoming: {},
  toasts: [],
  muted: readMuted(),
}));

let seq = 1;
export const nextId = () => seq++;

export function toast(text: string) {
  const id = nextId();
  useStore.setState((s) => ({ toasts: [...s.toasts, { id, text }] }));
  setTimeout(() => useStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
}

export function addEffect(e: EffectInput, ttl: number) {
  const id = nextId();
  useStore.setState((s) => ({ effects: [...s.effects, { ...e, id } as Effect] }));
  setTimeout(() => useStore.setState((s) => ({ effects: s.effects.filter((x) => x.id !== id) })), ttl);
}
