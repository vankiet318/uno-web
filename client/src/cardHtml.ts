import { COLORS, type Card, type CardValue } from '@shared/types';

// Hình lá bài: "Card Asset Pack" của natomarcacini — giấy phép CC0 (xem public/cards/LICENSE.txt)

/** Đường dẫn hình của lá bài. card = null → mặt sau */
export function cardSrc(card: Card | null): string {
  return card ? `/cards/${card.color}-${card.value}.png` : '/cards/back.png';
}

/** Lớp CSS của lá bài (dùng chung cho React và lá bay tạo bằng DOM) */
export function cardClass(card: Card | null, small = false): string {
  const base = card ? `card c-${card.color} v-${card.value}` : 'card back';
  return small ? `${base} small` : base;
}

/** Nội dung bên trong lá bài */
export function cardInner(card: Card | null): string {
  return `<img src="${cardSrc(card)}" alt="" draggable="false" decoding="async">`;
}

/** Tải trước toàn bộ 55 hình để lá không bị trắng khi bay lần đầu */
export function preloadCards() {
  const values: CardValue[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
  const cards: (Card | null)[] = [null, { id: '', color: 'wild', value: 'wild' }, { id: '', color: 'wild', value: 'wild4' }];
  for (const color of COLORS) for (const value of values) cards.push({ id: '', color, value });
  for (const c of cards) {
    const img = new Image();
    img.src = cardSrc(c);
  }
}
