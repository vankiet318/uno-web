import { AnimatePresence, motion } from 'framer-motion';
import { memo, useEffect, useState } from 'react';
import { LuCheck, LuEye, LuLayers, LuMessageCircle, LuSkipForward, LuSmilePlus, LuX } from 'react-icons/lu';
import { setChatOpen } from '../chat';
import { isWild, needsSwapTarget, REACTIONS, type Card, type Color } from '@shared/types';
import { HEX } from '../director';
import { actions } from '../net';
import { reg } from '../registry';
import { canPlayNow } from '../rules';
import { useStore } from '../store';
import { CardView } from './CardView';
import { ColorPicker } from './ColorPicker';
import { Hand } from './Hand';
import { ChatBox } from './ChatBox';
import { SwapPicker } from './SwapPicker';
import { Avatar, Seat, TimerRing } from './Seat';

/** Chồng bài đã đánh — tách riêng để khi lá mới rơi xuống không phải render lại cả bàn */
const DiscardPile = memo(function DiscardPile({ color }: { color: Color | null }) {
  const discard = useStore((s) => s.discard);
  const top = discard[discard.length - 1];
  return (
    <div className="discard" ref={reg('discard')}>
      <div className="discard-glow" />
      {discard.map((d) => (
        <div key={d.key} className="discard-card" style={{ transform: `translate(${d.dx}px, ${d.dy}px) rotate(${d.rot}deg)` }}>
          <CardView card={d.card} />
        </div>
      ))}
      {color && top?.card.color === 'wild' && (
        <motion.div className="chosen-color" key={color} initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ background: HEX[color] }} />
      )}
    </div>
  );
});

/** Xếp ghế người khác theo vòng cung phía trên, bắt đầu từ người kế tiếp mình */
function seatPosition(i: number, k: number): React.CSSProperties {
  const t = (i + 1) / (k + 1);
  const a = Math.PI + t * Math.PI;
  return { left: `${50 + 42 * Math.cos(a)}%`, top: `${54 + 46 * Math.sin(a)}%` };
}

export function Table() {
  const state = useStore((s) => s.state)!;
  const [picking, setPicking] = useState<Card | null>(null);
  const [swapping, setSwapping] = useState<Card | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const chatOpen = useStore((s) => s.chatOpen);
  const chatUnread = useStore((s) => s.chatUnread);

  const me = state.players.find((p) => p.id === state.me)!;
  const meIdx = state.players.findIndex((p) => p.id === state.me);
  // Ghế trên bàn: chỉ người đang chơi (người xem không có ghế)
  const others = [...state.players.slice(meIdx + 1), ...state.players.slice(0, meIdx)].filter((p) => !p.spectator);
  const spectators = state.players.filter((p) => p.spectator);
  const myTurn = state.phase === 'playing' && state.turnPlayerId === state.me;
  const turnPlayer = state.players.find((p) => p.id === state.turnPlayerId);
  const color: Color | null = state.currentColor;
  const glow = color ? HEX[color] : '#888';
  const hasPlayable = state.hand.some((c) => canPlayNow(state, c));
  const forcedPlay = state.settings.drawUntilPlayable;
  // Không có lá đánh được → server tự rút; chỉ cho bấm rút khi có lá mà vẫn muốn rút
  const autoDrawing = myTurn && !hasPlayable && !state.hasDrawn;
  const canDrawManually = myTurn && hasPlayable && !state.hasDrawn && state.pendingDraw === 0;
  const canArmUno = myTurn && state.hand.length === 2 && hasPlayable && !state.unoArmed;
  const canCallUno = me.unoVulnerable;

  // Lượt hoặc lá trên bàn đổi → đóng hộp chọn đang mở
  useEffect(() => {
    setPicking(null);
    setSwapping(null);
  }, [state.turnPlayerId, state.topCard?.id]);

  const play = (c: Card) => {
    if (isWild(c)) setPicking(c);
    else if (needsSwapTarget(c, state.hand.length - 1, state.settings)) setSwapping(c);
    else void actions.play(c);
  };

  let status: string;
  if (state.phase !== 'playing') status = 'Ván đã kết thúc';
  else if (myTurn) {
    if (state.pendingDraw > 0) status = `Chồng thêm +2/+4 hoặc rút ${state.pendingDraw} lá!`;
    else if (state.hasDrawn) status = forcedPlay ? 'Đánh lá vừa rút!' : 'Đánh lá vừa rút hoặc bỏ lượt';
    else status = hasPlayable ? 'Tới lượt bạn!' : forcedPlay ? 'Đang rút đến khi đánh được…' : 'Không có lá hợp lệ — đang tự rút…';
  } else status = me.spectator ? `Bạn đang xem · Lượt của ${turnPlayer?.name ?? '...'}` : `Lượt của ${turnPlayer?.name ?? '...'}`;

  return (
    <div className="table-screen">
      <div className="table" style={{ '--glow': glow } as React.CSSProperties}>
        {spectators.length > 0 && (
          <div className="spectators" title="Sẽ được chia bài từ ván sau">
            <LuEye /> Đang xem:
            {spectators.map((p, i) => (
              <span key={p.id} className="spectator-name">
                {p.id === state.me ? 'Bạn' : p.name}
                {me.isHost && p.id !== state.me && (
                  <button className="spectator-kick" onClick={() => actions.kick(p.id)} title={`Mời ${p.name} ra`} aria-label={`Mời ${p.name} ra`}>
                    <LuX />
                  </button>
                )}
                {i < spectators.length - 1 && ','}
              </span>
            ))}
          </div>
        )}
        {others.map((p, i) => (
          <Seat
            key={p.id}
            p={p}
            isTurn={state.turnPlayerId === p.id}
            style={seatPosition(i, others.length)}
            canCatch={p.unoVulnerable && state.phase === 'playing'}
          />
        ))}

        <div className="center">
          <div className={`direction-ring ${state.direction === 1 ? 'cw' : 'ccw'}`}>
            <svg viewBox="0 0 200 200">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={glow} />
                </marker>
              </defs>
              {[0, 1, 2].map((k) => {
                const a0 = (k * 120 + 10) * (Math.PI / 180);
                const a1 = (k * 120 + 95) * (Math.PI / 180);
                const p = (a: number) => `${100 + 92 * Math.cos(a)} ${100 + 92 * Math.sin(a)}`;
                const d = state.direction === 1 ? `M ${p(a0)} A 92 92 0 0 1 ${p(a1)}` : `M ${p(a1)} A 92 92 0 0 0 ${p(a0)}`;
                return <path key={k} d={d} stroke={glow} strokeWidth="5" fill="none" markerEnd="url(#arrow)" opacity="0.8" />;
              })}
            </svg>
          </div>

          <button
            className={`deck ${canDrawManually ? 'can-draw' : ''} ${autoDrawing ? 'must-draw' : ''}`}
            ref={reg('deck')}
            onClick={() => canDrawManually && actions.draw()}
            title="Rút bài"
          >
            <div className="deck-stack">
              <CardView card={null} />
              <CardView card={null} />
              <CardView card={null} />
            </div>
            <span className="deck-count">{state.drawPileCount}</span>
            <AnimatePresence>
              {state.pendingDraw > 0 && (
                <motion.span
                  className="pending-badge"
                  key={state.pendingDraw}
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.5, 1] }}
                  exit={{ scale: 0 }}
                >
                  +{state.pendingDraw}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <DiscardPile color={color} />
        </div>

        <motion.div className={`status ${myTurn ? 'mine' : ''}`} key={status} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          {status}
        </motion.div>
      </div>

      <div className={`me-bar ${myTurn ? 'turn' : ''}`}>
        <div className="me-info">
          <div className="seat-avatar" ref={reg('me-avatar')}>
            {myTurn && <TimerRing size={50} />}
            <Avatar p={me} size={40} />
          </div>
          <div>
            <div className="me-name">{me.name}</div>
            <div className="seat-score">{me.spectator ? 'Đang xem' : `${me.score} điểm`}</div>
          </div>
        </div>

        <div className="me-actions">
          <AnimatePresence>
            {(canArmUno || canCallUno) && (
              <motion.button
                key="uno"
                className="uno-btn"
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: [1, 1.12, 1], rotate: 0 }}
                exit={{ scale: 0 }}
                transition={{ scale: { repeat: Infinity, duration: 0.7 } }}
                onClick={() => actions.uno()}
              >
                UNO!
              </motion.button>
            )}
            {state.unoArmed && myTurn && (
              <motion.span key="armed" className="armed" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <LuCheck /> Đã hô UNO
              </motion.span>
            )}
            {myTurn && state.hasDrawn && !forcedPlay && (
              <motion.button key="pass" className="btn ghost" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} onClick={() => actions.pass()}>
                <LuSkipForward /> Bỏ lượt
              </motion.button>
            )}
            {myTurn && state.pendingDraw > 0 && (
              <motion.button key="take" className="btn danger" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} onClick={() => actions.draw()}>
                <LuLayers /> Rút {state.pendingDraw} lá
              </motion.button>
            )}
          </AnimatePresence>
          <div className="reactions">
            <button className="btn icon" onClick={() => setShowReactions((v) => !v)} title="Biểu cảm">
              <LuSmilePlus />
            </button>
            <AnimatePresence>
              {showReactions && (
                <motion.div className="reaction-pop" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
                  {REACTIONS.map((e) => (
                    <button key={e} onClick={() => void actions.reaction(e)}>
                      {e}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button className="btn icon chat-toggle" onClick={() => setChatOpen(!chatOpen)} title="Chat" aria-label="Chat">
            <LuMessageCircle />
            <AnimatePresence>
              {chatUnread > 0 && (
                <motion.span className="unread" key={chatUnread} initial={{ scale: 0 }} animate={{ scale: [0, 1.4, 1] }} exit={{ scale: 0 }}>
                  {chatUnread > 9 ? '9+' : chatUnread}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {chatOpen && (
          <motion.div
            className="panel chat-drawer"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="chat-head">
              <h3>
                <LuMessageCircle /> Chat
              </h3>
              <button className="btn icon small" onClick={() => setChatOpen(false)} aria-label="Đóng chat">
                <LuX />
              </button>
            </div>
            <ChatBox autoFocus />
          </motion.div>
        )}
      </AnimatePresence>

      {me.spectator ? (
        <motion.div className="spectate-banner" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <LuEye className="spectate-ico" />
          <div>
            <b>Bạn đang xem ván này</b>
            <span>Bạn sẽ được chia bài từ ván sau. Trong lúc chờ, cứ chat thoải mái nhé!</span>
          </div>
        </motion.div>
      ) : (
        <Hand onPlay={play} />
      )}

      <AnimatePresence>
        {swapping && (
          <SwapPicker
            players={others}
            onPick={(id) => {
              const card = swapping;
              setSwapping(null);
              void actions.play(card, undefined, id);
            }}
            onCancel={() => setSwapping(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {picking && (
          <ColorPicker
            onPick={(c) => {
              const card = picking;
              setPicking(null);
              void actions.play(card, c);
            }}
            onCancel={() => setPicking(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
