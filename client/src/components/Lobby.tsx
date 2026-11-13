import { AnimatePresence, motion } from 'framer-motion';
import { LuBot, LuCrown, LuLink, LuMessageCircle, LuPlay, LuWifiOff, LuX } from 'react-icons/lu';
import { MAX_PLAYERS } from '@shared/types';
import { actions } from '../net';
import { toast, useStore } from '../store';
import { CardView } from './CardView';
import { ChatBox } from './ChatBox';
import { RulesPanel } from './RulesPanel';
import { Avatar } from './Seat';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Đã copy link mời!');
  } catch {
    // http không có HTTPS thì clipboard API không chạy
    window.prompt('Copy link này gửi cho bạn bè:', text);
  }
}

export function Lobby() {
  const state = useStore((s) => s.state)!;
  const amHost = state.players.find((p) => p.id === state.me)?.isHost;
  const link = `${location.origin}/?r=${state.code}`;

  return (
    <div className="lobby">
      <motion.div className="panel" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <div className="lobby-head">
          <div>
            <div className="muted">Mã phòng</div>
            <div className="room-code">{state.code}</div>
          </div>
          <button className="btn" onClick={() => copy(link)}>
            <LuLink /> Copy link mời
          </button>
        </div>

        <h3>
          Người chơi ({state.players.length}/{MAX_PLAYERS})
        </h3>
        <div className="player-list">
          <AnimatePresence>
            {state.players.map((p) => (
              <motion.div
                key={p.id}
                className="player-row"
                layout
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 30, opacity: 0 }}
              >
                <Avatar p={p} size={36} />
                <span className="pname">
                  {p.name} {p.id === state.me && <span className="muted">(bạn)</span>}
                </span>
                {p.isHost && (
                  <span className="tag gold">
                    <LuCrown /> Chủ phòng
                  </span>
                )}
                {!p.connected && (
                  <span className="tag warn">
                    <LuWifiOff /> offline
                  </span>
                )}
                {p.score > 0 && <span className="tag">{p.score} điểm</span>}
                {amHost && p.id !== state.me && (
                  <button className="btn icon small" title="Mời ra" onClick={() => actions.kick(p.id)}>
                    <LuX />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {amHost && (
          <button className="btn ghost wide" onClick={() => actions.addBot()} disabled={state.players.length >= MAX_PLAYERS}>
            <LuBot /> Thêm bot
          </button>
        )}

        <RulesPanel settings={state.settings} editable={!!amHost} />

        {amHost ? (
          <>
            <button className="btn primary wide big" onClick={() => actions.start()} disabled={state.players.length < 2}>
              {state.players.length < 2 ? (
                'Cần ít nhất 2 người'
              ) : (
                <>
                  <LuPlay /> Bắt đầu chơi
                </>
              )}
            </button>
          </>
        ) : (
          <div className="waiting">
            <div className="waiting-cards">
              {[0, 1, 2].map((i) => (
                <motion.div key={i} animate={{ y: [0, -14, 0] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }}>
                  <CardView card={null} small />
                </motion.div>
              ))}
            </div>
            <p className="muted">Chờ chủ phòng bắt đầu…</p>
          </div>
        )}
      </motion.div>

      <motion.div className="panel chat-panel" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
        <h3>
          <LuMessageCircle /> Chat
        </h3>
        <ChatBox />
      </motion.div>
    </div>
  );
}
