import { AnimatePresence, motion } from 'framer-motion';
import { LuLogOut, LuVolume2, LuVolumeX, LuWifiOff } from 'react-icons/lu';
import { Effects } from './components/Effects';
import { FlyLayer } from './components/FlyLayer';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { RoundOver } from './components/RoundOver';
import { Table } from './components/Table';
import { leaveRoom } from './net';
import { unlockAudio } from './sound';
import { useStore } from './store';

function TopBar() {
  const state = useStore((s) => s.state)!;
  const muted = useStore((s) => s.muted);
  const connected = useStore((s) => s.connected);
  const toggleMute = () => {
    const m = !muted;
    useStore.setState({ muted: m });
    try {
      localStorage.setItem('uno.muted', m ? '1' : '0');
    } catch {
      /* bỏ qua */
    }
  };
  const leave = () => {
    const msg = state.phase === 'playing' ? 'Rời ván đang chơi? Bot sẽ chơi thay bạn.' : 'Rời phòng?';
    if (confirm(msg)) void leaveRoom();
  };
  return (
    <div className="top-bar">
      <span className="logo-small">UNO</span>
      <span className="code-chip">Phòng {state.code}</span>
      {!connected && (
        <span className="tag warn">
          <LuWifiOff /> Đang kết nối lại…
        </span>
      )}
      <span className="spacer" />
      <button className="btn icon" onClick={toggleMute} title="Âm thanh">
        {muted ? <LuVolumeX /> : <LuVolume2 />}
      </button>
      <button className="btn icon" onClick={leave} title="Rời phòng">
        <LuLogOut />
      </button>
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className="toast" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const state = useStore((s) => s.state);
  return (
    <div className="app" onPointerDown={unlockAudio}>
      <div className="stage" id="stage">
        {!state ? (
          <Home />
        ) : (
          <>
            <TopBar />
            {state.phase === 'lobby' ? <Lobby /> : <Table />}
            {state.phase === 'roundOver' && <RoundOver key={state.round} />}
          </>
        )}
      </div>
      <FlyLayer />
      <Effects />
      <Toasts />
    </div>
  );
}
