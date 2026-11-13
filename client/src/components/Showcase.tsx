import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import type { Card } from '@shared/types';
import { CardView } from './CardView';

const CARDS: Card[] = [
  { id: 'a', color: 'red', value: '7' },
  { id: 'b', color: 'yellow', value: 'skip' },
  { id: 'c', color: 'wild', value: 'wild4' },
  { id: 'd', color: 'green', value: 'reverse' },
  { id: 'e', color: 'blue', value: 'draw2' },
];

const SPREAD = 11; // độ giữa các lá khi nghỉ
const PUSH = 6; // độ dạt ra của lá bên cạnh khi có lá được chọn

/**
 * Quạt bài ở màn hình chính.
 * - Lớp hình (fan-card) chuyển động bằng CSS transition; lớp nhận chuột (fan-hit) đứng yên
 *   ở vị trí nghỉ → lá nhấc lên không làm mất hover, không bị giật qua lại.
 * - Lá được chọn trượt ra theo hướng xòe, dựng thẳng dần, nghiêng 3D theo con trỏ, có vệt sáng.
 */
export function Showcase() {
  const [active, setActive] = useState<number | null>(null);
  const tilts = useRef<(HTMLDivElement | null)[]>([]);
  const n = CARDS.length;

  const restAngle = (i: number) => (i - (n - 1) / 2) * SPREAD;

  const angleOf = (i: number) => {
    const a = restAngle(i);
    if (active === null) return a;
    if (i === active) return a * 0.45; // dựng thẳng dần
    return a + (i < active ? -PUSH : PUSH);
  };

  const onMove = (i: number, e: React.PointerEvent<HTMLDivElement>) => {
    const el = tilts.current[i];
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.style.setProperty('--ry', `${(px - 0.5) * 22}deg`);
    el.style.setProperty('--rx', `${(0.5 - py) * 22}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  };

  const reset = (i: number) => {
    const el = tilts.current[i];
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <div className="fan" onPointerLeave={() => setActive(null)}>
      <div className="fan-float">
        {CARDS.map((c, i) => (
          <motion.div
            key={c.id}
            className="fan-slot"
            style={{ zIndex: active === i ? 10 : i }}
            initial={{ y: -320, opacity: 0, rotate: (i - 2) * -40 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 170, damping: 17 }}
          >
            <div className={`fan-card ${active === i ? 'active' : ''}`} style={{ '--a': `${angleOf(i)}deg` } as React.CSSProperties}>
              <div className={`fan-tilt c-${c.color}`} ref={(el) => void (tilts.current[i] = el)}>
                <CardView card={c} />
                <div className="fan-shine" />
              </div>
            </div>
          </motion.div>
        ))}

        {/* Vùng nhận chuột cố định theo vị trí nghỉ */}
        {CARDS.map((c, i) => (
          <div
            key={`hit-${c.id}`}
            className="fan-hit"
            style={{ '--a': `${restAngle(i)}deg`, zIndex: 20 + i } as React.CSSProperties}
            onPointerEnter={() => setActive(i)}
            onPointerDown={() => setActive(i)}
            onPointerMove={(e) => onMove(i, e)}
            onPointerLeave={() => reset(i)}
          />
        ))}
      </div>
    </div>
  );
}
