import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LuSendHorizontal } from 'react-icons/lu';
import { CHAT_MAX_LEN } from '@shared/protocol';
import { actions } from '../net';
import { useStore } from '../store';
import { avatarColor } from './Seat';

const QUICK = ['Nhanh lên!', 'Hay lắm 👏', 'Cứu tui 😭', 'Chơi lại không?', 'GG'];

function time(at: number) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Khung chat: danh sách tin + ô nhập. Dùng ở phòng chờ và trong ván */
export function ChatBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const chat = useStore((s) => s.chat);
  const me = useStore((s) => s.state?.me);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Luôn cuộn xuống tin mới nhất
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const send = async (msg: string) => {
    const t = msg.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await actions.chat(t);
    setSending(false);
    if (ok && msg === text) setText('');
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="chat-box">
      <div className="chat-list" ref={listRef}>
        {chat.length === 0 && <div className="chat-empty">Chưa có tin nhắn nào. Chào mọi người đi! 👋</div>}
        {chat.map((m) =>
          m.playerId === null ? (
            <div key={m.id} className="chat-sys">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`chat-msg ${m.playerId === me ? 'mine' : ''}`}>
              <div className="chat-meta">
                <b style={{ color: avatarColor(m.playerId) }}>{m.playerId === me ? 'Bạn' : m.name}</b>
                <span>{time(m.at)}</span>
              </div>
              <div className="chat-text">{m.text}</div>
            </div>
          ),
        )}
      </div>

      <div className="chat-quick">
        {QUICK.map((q) => (
          <button key={q} onClick={() => void send(q)} disabled={sending}>
            {q}
          </button>
        ))}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <input
          ref={inputRef}
          value={text}
          maxLength={CHAT_MAX_LEN}
          placeholder="Nhập tin nhắn…"
          enterKeyHint="send"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={!text.trim() || sending} aria-label="Gửi">
          <LuSendHorizontal />
        </button>
      </form>
    </div>
  );
}
