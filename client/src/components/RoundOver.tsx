import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { LuEye, LuPlay, LuTrophy, LuUsers } from 'react-icons/lu';
import { animationRemaining } from '../director';
import { actions } from '../net';
import { useStore } from '../store';
import { CardView } from './CardView';
import { Avatar } from './Seat';

export function RoundOver() {
  const state = useStore((s) => s.state)!;
  const [visible, setVisible] = useState(false);

  // Chờ hiệu ứng chiến thắng chạy xong rồi mới hiện bảng điểm
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), animationRemaining() + 300);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;
  const amHost = state.players.find((p) => p.id === state.me)?.isHost;
  const winner = state.players.find((p) => p.id === state.winnerId);
  const champion = state.players.find((p) => p.id === state.matchWinnerId);
  const ranked = state.players.filter((p) => !p.spectator).sort((a, b) => b.score - a.score);
  const waiting = state.players.filter((p) => p.spectator);
  const handOf = (id: string) => state.lastHands.find((h) => h.playerId === id)?.cards ?? [];

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="panel round-over" initial={{ y: 80, scale: 0.8 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring' }}>
        <div className="trophy">
          <LuTrophy />
        </div>
        {champion ? (
          <>
            <h2 className="champion">{champion.id === state.me ? 'BẠN LÀ NHÀ VÔ ĐỊCH!' : `${champion.name} VÔ ĐỊCH!`}</h2>
            <p className="muted">
              Đạt {champion.score}/{state.settings.targetScore} điểm · ván cuối +{state.roundPoints} điểm
            </p>
          </>
        ) : (
          <>
            <h2>{state.winnerId === state.me ? 'Bạn thắng ván này!' : `${winner?.name ?? '?'} thắng!`}</h2>
            <p className="muted">
              +{state.roundPoints} điểm từ bài còn lại của mọi người
              {state.settings.targetScore > 0 && ` · chơi tới ${state.settings.targetScore} điểm`}
            </p>
          </>
        )}
        <div className="score-list">
          {ranked.map((p, i) => (
            <motion.div
              key={p.id}
              className={`score-row ${p.id === state.winnerId ? 'winner' : ''}`}
              initial={{ x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 * i }}
            >
              <span className="rank">{i + 1}</span>
              <Avatar p={p} size={32} />
              <span className="score-name">{p.name}</span>
              <div className="score-hand">
                {handOf(p.id).slice(0, 12).map((c) => (
                  <CardView key={c.id} card={c} small />
                ))}
              </div>
              <span className="score-pts">{p.score}</span>
            </motion.div>
          ))}
        </div>
        {waiting.length > 0 && (
          <p className="waiting-join">
            <LuEye /> Sẽ vào chơi từ ván sau: <b>{waiting.map((p) => (p.id === state.me ? 'Bạn' : p.name)).join(', ')}</b>
          </p>
        )}
        {amHost ? (
          <div className="row">
            <button className="btn ghost" onClick={() => actions.lobby()}>
              <LuUsers /> Về phòng chờ
            </button>
            <button className="btn primary" onClick={() => actions.start()}>
              <LuPlay /> {champion ? 'Chơi lại từ đầu' : 'Ván tiếp theo'}
            </button>
          </div>
        ) : (
          <p className="muted">Chờ chủ phòng bắt đầu ván mới…</p>
        )}
      </motion.div>
    </motion.div>
  );
}
