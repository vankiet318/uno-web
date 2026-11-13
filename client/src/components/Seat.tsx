import { motion } from 'framer-motion';
import { LuBot, LuCrown, LuHand, LuWifiOff } from 'react-icons/lu';
import type { PublicPlayer } from '@shared/types';
import { actions } from '../net';
import { reg } from '../registry';
import { useStore } from '../store';
import { CardView } from './CardView';

const AVATAR_COLORS = ['#ff6b6b', '#f7b733', '#4ecdc4', '#5c7cfa', '#cc5de8', '#ff8787', '#20c997', '#fd7e14'];

export function avatarColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ p, size = 48 }: { p: PublicPlayer; size?: number }) {
  return (
    <div className="avatar" style={{ background: avatarColor(p.id), width: size, height: size, fontSize: size * 0.45 }}>
      {p.isBot ? <LuBot /> : p.name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}

export function TimerRing({ size }: { size: number }) {
  const turnEndsAt = useStore((s) => s.state?.turnEndsAt);
  const total = useStore((s) => (s.state?.settings.turnSeconds ?? 0) * 1000);
  const offset = useStore((s) => s.clockOffset);
  if (!turnEndsAt || !total) return null;
  const remaining = Math.max(0, turnEndsAt - (Date.now() + offset));
  const frac = Math.min(1, remaining / total);
  const r = size / 2 - 3;
  // Animation bằng CSS (stroke-dashoffset), bắt đầu từ phần thời gian còn lại
  return (
    <svg className="timer-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        key={turnEndsAt}
        className="timer-arc"
        cx={size / 2}
        cy={size / 2}
        r={r}
        pathLength={1}
        style={{ animationDuration: `${total}ms`, animationDelay: `${-(1 - frac) * total}ms` }}
      />
    </svg>
  );
}

interface Props {
  p: PublicPlayer;
  isTurn: boolean;
  style?: React.CSSProperties;
  canCatch: boolean;
}

export function Seat({ p, isTurn, style, canCatch }: Props) {
  const incoming = useStore((s) => s.incoming[p.id] ?? 0);
  const count = Math.max(0, p.cardCount - incoming);
  const shown = Math.min(count, 8);
  return (
    <motion.div
      className={`seat ${isTurn ? 'turn' : ''} ${p.connected ? '' : 'offline'}`}
      style={style}
      animate={isTurn ? { scale: 1.08 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className="seat-cards" ref={reg(`seat:${p.id}`)}>
        {Array.from({ length: shown }, (_, i) => (
          <div key={i} className="mini" style={{ transform: `translateX(${(i - (shown - 1) / 2) * 7}px) rotate(${(i - (shown - 1) / 2) * 8}deg)` }}>
            <CardView card={null} small />
          </div>
        ))}
        <span className="count-badge">{count}</span>
      </div>
      <div className="seat-avatar">
        {isTurn && <TimerRing size={58} />}
        <Avatar p={p} />
        {count === 1 && !p.unoVulnerable && <span className="uno-badge">UNO</span>}
      </div>
      <div className="seat-name">
        {p.isHost && <LuCrown className="crown" />}
        {p.name}
      </div>
      <div className="seat-score">{p.score} điểm</div>
      {!p.connected && (
        <div className="seat-offline">
          <LuWifiOff /> mất kết nối
        </div>
      )}
      {canCatch && (
        <motion.button
          className="catch-btn"
          onClick={() => actions.catchUno(p.id)}
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 0.6 }}
        >
          <LuHand /> Bắt!
        </motion.button>
      )}
    </motion.div>
  );
}
