import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { COLORS, type Card } from '@shared/types';
import { cardWidth, reg } from '../registry';
import { canPlayNow } from '../rules';
import { useStore } from '../store';
import { CardView } from './CardView';

const COLOR_ORDER = [...COLORS, 'wild'];
const VALUE_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2', 'wild', 'wild4'];

function sortHand(hand: Card[]): Card[] {
  return [...hand].sort(
    (a, b) =>
      COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color) || VALUE_ORDER.indexOf(a.value) - VALUE_ORDER.indexOf(b.value),
  );
}

interface Props {
  onPlay: (card: Card) => void;
}

/**
 * Bài trên tay. Vị trí từng lá tính bằng JS, còn chuyển động do CSS transition đảm nhận
 * (chạy trên compositor, không phải đo layout mỗi lần thay đổi).
 */
export function Hand({ onPlay }: Props) {
  const state = useStore((s) => s.state)!;
  const hidden = useStore((s) => s.hiddenCards);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 360, cw: 80 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, cw: cardWidth() });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const cards = useMemo(() => sortHand(state.hand), [state.hand]);
  const myTurn = state.phase === 'playing' && state.turnPlayerId === state.me;
  const { width, cw } = size;
  const n = cards.length;
  // Khoảng cách giữa tâm 2 lá: rộng rãi khi ít bài, chồng lên nhau khi nhiều bài
  const step = n > 1 ? Math.max(cw * 0.22, Math.min(cw * 0.86, (width - 16 - cw) / (n - 1))) : 0;
  const rotStep = Math.min(4, 36 / Math.max(n, 1));


  return (
    <div className={`hand ${myTurn ? 'my-turn' : ''}`} ref={ref}>
      <div className="hand-row" ref={reg('hand')}>
        {cards.map((c, i) => {
          const ok = canPlayNow(state, c);
          const off = i - (n - 1) / 2;
          const y = ok ? -18 : Math.abs(off) * Math.min(4, 40 / n);
          return (
            <div
              key={c.id}
              ref={reg(`card:${c.id}`)}
              className={`hand-card ${ok ? 'playable' : ''} ${myTurn && !ok ? 'dim' : ''} ${c.id === state.drawnCardId ? 'just-drawn' : ''} ${hidden.has(c.id) ? 'hidden' : ''}`}
              style={
                {
                  '--x': `${off * step}px`,
                  '--y': `${y}px`,
                  '--r': `${off * rotStep}deg`,
                  zIndex: i,
                } as React.CSSProperties
              }
              onClick={() => ok && onPlay(c)}
            >
              <CardView card={c} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
