// Lưu phần tử DOM của ghế, chồng bài, lá bài… để tính đường bay animation
import type { Pt } from './store';

const els = new Map<string, HTMLElement>();

export function reg(key: string) {
  return (el: HTMLElement | null) => {
    if (el) els.set(key, el);
  };
}

export function rectOf(key: string): DOMRect | null {
  const el = els.get(key);
  if (!el || !el.isConnected) return null;
  return el.getBoundingClientRect();
}

export function centerOf(key: string): Pt | null {
  const r = rectOf(key);
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

export function screenCenter(): Pt {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

/** Chiều rộng lá bài chuẩn (CSS var --cw) */
export function cardWidth(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--cw');
  return parseFloat(v) || 80;
}
