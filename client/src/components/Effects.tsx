import { AnimatePresence, motion } from 'framer-motion';
import { LuBan, LuRefreshCcw, LuRefreshCw } from 'react-icons/lu';
import { HEX } from '../director';
import { useStore, type Effect } from '../store';

const TEXT_BG: Record<string, string> = {
  ...HEX,
  dark: '#1b1b2a',
  wild: 'linear-gradient(90deg,#ff3b47,#ffc928,#2fc96b,#2f8cff)',
};

function BigText({ e }: { e: Extract<Effect, { kind: 'bigText' }> }) {
  const color = e.color ?? 'dark';
  const size = e.size ?? 1;
  return (
    <div className="fx-center">
      <motion.div
        className={`big-text ${color === 'wild' ? 'rainbow' : ''}`}
        style={{ '--bt': TEXT_BG[color], fontSize: `calc(var(--big) * ${size})` } as React.CSSProperties}
        initial={{ scale: 0, rotate: -12, opacity: 0 }}
        animate={{ scale: [0, 1.35, 1], rotate: [-12, 4, -3], opacity: 1 }}
        exit={{ scale: 1.6, opacity: 0, filter: 'blur(6px)' }}
        transition={{ duration: 0.45, ease: 'backOut' }}
      >
        {e.text}
        {e.sub && <div className="big-sub">{e.sub}</div>}
      </motion.div>
    </div>
  );
}

function Wild4({ e }: { e: Extract<Effect, { kind: 'wild4' }> }) {
  return (
    <motion.div className="fx-wild4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <motion.div
        className="w4-ring"
        initial={{ scale: 0.2, rotate: 0 }}
        animate={{ scale: [0.2, 1.3, 1.1], rotate: 540 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />
      <motion.div
        className="w4-text"
        style={{ color: HEX[e.color] }}
        initial={{ scale: 6, opacity: 0 }}
        animate={{ scale: [6, 0.9, 1.1, 1], opacity: 1 }}
        transition={{ duration: 0.55, times: [0, 0.6, 0.8, 1], ease: 'easeIn' }}
      >
        +4
      </motion.div>
    </motion.div>
  );
}

function Stamp({ e }: { e: Extract<Effect, { kind: 'stamp' }> }) {
  return (
    <motion.div
      className="fx-stamp"
      style={{ left: e.at.x, top: e.at.y }}
      initial={{ scale: 5, opacity: 0, rotate: -40 }}
      animate={{ scale: [5, 0.8, 1.1, 1], opacity: 1, rotate: -15 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={{ duration: 0.5, ease: 'easeIn' }}
    >
      <LuBan />
    </motion.div>
  );
}

function Reverse({ e }: { e: Extract<Effect, { kind: 'reverse' }> }) {
  return (
    <div className="fx-center">
      <motion.div
        className="fx-reverse"
        initial={{ scale: 0, rotate: 0, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1], rotate: e.direction === 1 ? 360 : -360, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ duration: 0.9, ease: 'easeInOut' }}
      >
        {e.direction === 1 ? <LuRefreshCw /> : <LuRefreshCcw />}
      </motion.div>
    </div>
  );
}

function Ripple({ e }: { e: Extract<Effect, { kind: 'ripple' }> }) {
  const r = Math.max(innerWidth, innerHeight) * 0.75;
  return (
    <motion.div
      className="fx-ripple"
      style={{ left: e.at.x, top: e.at.y, width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r, '--rc': HEX[e.color] } as React.CSSProperties}
      initial={{ scale: 0.1, opacity: 0.7 }}
      animate={{ scale: 1.4, opacity: 0 }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
    />
  );
}

function SeatText({ e }: { e: Extract<Effect, { kind: 'seatText' }> }) {
  return (
    <motion.div
      className={`fx-seat-text ${e.tone}`}
      style={{ left: e.at.x, top: e.at.y }}
      initial={{ scale: 0, y: 0, opacity: 0 }}
      animate={{ scale: [0, 1.5, 1], y: -50, opacity: 1 }}
      exit={{ opacity: 0, y: -90 }}
      transition={{ duration: 0.5, ease: 'backOut' }}
    >
      {e.text}
    </motion.div>
  );
}

function Emoji({ e }: { e: Extract<Effect, { kind: 'emoji' }> }) {
  const drift = (Math.random() - 0.5) * 80;
  return (
    <motion.div
      className="fx-emoji"
      style={{ left: e.at.x, top: e.at.y }}
      initial={{ scale: 0, y: 0, x: 0, opacity: 1 }}
      animate={{ scale: [0, 1.8, 1.3], y: -140, x: drift, opacity: [1, 1, 0] }}
      transition={{ duration: 1.7, ease: 'easeOut' }}
    >
      {e.emoji}
    </motion.div>
  );
}

/** Bong bóng thoại chat phía trên ghế người gửi */
function Bubble({ e }: { e: Extract<Effect, { kind: 'bubble' }> }) {
  // Giữ bong bóng trong màn hình khi ghế nằm sát mép
  const x = Math.min(Math.max(e.at.x, 110), innerWidth - 110);
  return (
    <motion.div
      className="fx-bubble"
      style={{ left: x, top: e.at.y, '--tail': `${e.at.x - x}px` } as React.CSSProperties}
      initial={{ opacity: 0, scale: 0.6, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: -10 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    >
      {e.text}
    </motion.div>
  );
}

function render(e: Effect) {
  switch (e.kind) {
    case 'bubble':
      return <Bubble key={e.id} e={e} />;
    case 'bigText':
      return <BigText key={e.id} e={e} />;
    case 'wild4':
      return <Wild4 key={e.id} e={e} />;
    case 'stamp':
      return <Stamp key={e.id} e={e} />;
    case 'reverse':
      return <Reverse key={e.id} e={e} />;
    case 'ripple':
      return <Ripple key={e.id} e={e} />;
    case 'seatText':
      return <SeatText key={e.id} e={e} />;
    case 'emoji':
      return <Emoji key={e.id} e={e} />;
  }
}

export function Effects() {
  const effects = useStore((s) => s.effects);
  return (
    <div className="fx-layer">
      <AnimatePresence>{effects.map(render)}</AnimatePresence>
    </div>
  );
}
