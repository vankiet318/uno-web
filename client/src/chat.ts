// Xử lý tin nhắn chat đến: lưu lịch sử, đếm chưa đọc, hiện bong bóng thoại ở ghế người gửi
import type { ChatMsg } from '@shared/protocol';
import { centerOf } from './registry';
import { sfx } from './sound';
import { nextId, useStore, type Effect } from './store';

const BUBBLE_MS = 4000;

export function onChat(messages: ChatMsg[], history: boolean) {
  if (history) {
    useStore.setState({ chat: messages });
    return;
  }
  const st = useStore.getState();
  const me = st.state?.me;
  const inGame = !!st.state && st.state.phase !== 'lobby';
  let unread = 0;

  for (const m of messages) {
    if (!m.playerId) continue;
    if (m.playerId !== me) {
      sfx.pop();
      if (inGame && !st.chatOpen) unread++;
    }
    if (inGame) showBubble(m.playerId, m.text, m.playerId === me);
  }

  useStore.setState((s) => ({ chat: [...s.chat, ...messages].slice(-100), chatUnread: s.chatUnread + unread }));
}

/** Bong bóng thoại phía trên ghế người gửi; tin mới thay tin cũ của cùng người */
function showBubble(owner: string, text: string, mine: boolean) {
  const at = centerOf(mine ? 'me-avatar' : `seat:${owner}`);
  if (!at) return;
  const id = nextId();
  const bubble: Effect = { id, kind: 'bubble', at, text, owner };
  useStore.setState((s) => ({
    effects: [...s.effects.filter((e) => !(e.kind === 'bubble' && e.owner === owner)), bubble],
  }));
  setTimeout(() => useStore.setState((s) => ({ effects: s.effects.filter((e) => e.id !== id) })), BUBBLE_MS);
}

export function setChatOpen(open: boolean) {
  useStore.setState(open ? { chatOpen: true, chatUnread: 0 } : { chatOpen: false });
}

export function clearChat() {
  useStore.setState({ chat: [], chatUnread: 0, chatOpen: false });
}
