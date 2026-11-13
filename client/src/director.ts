// "Đạo diễn" animation: nhận state + sự kiện từ server rồi dàn dựng hiệu ứng theo thứ tự thời gian.
// Lá bay được tạo trực tiếp bằng DOM + Web Animations API để chạy trên compositor (mượt, không phụ thuộc React).
import confetti from 'canvas-confetti';
import { COLOR_NAMES_VI, type Card, type ClientState, type Color, type GameEvent, type StatePayload } from '@shared/types';
import { cardClass, cardInner } from './cardHtml';
import { cardWidth, centerOf, rectOf, screenCenter } from './registry';
import { sfx } from './sound';
import { addEffect, nextId, toast, useStore, type Pt } from './store';

export const HEX: Record<Color, string> = {
  red: '#ff3b47',
  yellow: '#ffc928',
  green: '#2fc96b',
  blue: '#2f8cff',
};

const PLAY_MS = 420;
let busyUntil = 0;
/** Lá mình đánh đã được animate trước khi server phản hồi */
const localPlays = new Map<string, { landed: boolean; cancelled: boolean }>();
/** Lá mới về tay mình do đổi/chuyền bài (luật 7-0) — ẩn tới khi animation xong */
let exchangeIds: string[] = [];
/** Đếm số lá rút liên tiếp của một người */
let drawChain = { pid: '', n: 0, at: 0 };

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Bộ hẹn giờ & animation đang chờ: ghi lại để huỷ được khi tab bị ẩn ----
const timers = new Set<ReturnType<typeof setTimeout>>();
const anims = new Set<Animation>();
/** Tăng mỗi lần huỷ toàn bộ → các callback cũ (requestAnimationFrame) tự bỏ qua */
let generation = 0;

/** setTimeout có ghi lại để huỷ được */
function later(fn: () => void, ms: number) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
}

/** Huỷ mọi animation và bộ hẹn giờ đang chờ */
function cancelAll() {
  generation++;
  for (const t of timers) clearTimeout(t);
  timers.clear();
  for (const a of anims) a.cancel();
  anims.clear();
  document.getElementById('fly-layer')?.replaceChildren();
  busyUntil = 0;
  localPlays.clear();
  exchangeIds = [];
  drawChain = { pid: '', n: 0, at: 0 };
}

/**
 * Đồng bộ ngay bàn chơi về trạng thái mới nhất, không animation.
 * Dùng khi tab bị ẩn: trình duyệt dừng requestAnimationFrame và làm chậm setTimeout,
 * nếu vẫn xếp hàng animation thì lúc quay lại mọi hiệu ứng sẽ dồn ra cùng lúc.
 */
function snapBoard(state: ClientState | null) {
  cancelAll();
  const cur = useStore.getState().discard;
  const top = state && state.phase !== 'lobby' ? state.topCard : null;
  const discard = !top ? [] : cur[cur.length - 1]?.card.id === top.id ? cur : [{ card: top, key: nextId(), rot: 0, dx: 0, dy: 0 }];
  useStore.setState({ discard, hiddenCards: new Set(), incoming: {}, effects: [] });
}

export function resetBoard() {
  cancelAll();
  useStore.setState({ discard: [], hiddenCards: new Set(), incoming: {}, effects: [] });
}

// Tab vừa bị ẩn → dừng mọi animation đang dở, giữ bàn chơi đúng trạng thái
document.addEventListener('visibilitychange', () => {
  if (document.hidden) snapBoard(useStore.getState().state);
});

const center = (r: DOMRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

function seatPt(pid: string, me: string): Pt {
  if (pid === me) return centerOf('hand') ?? { x: innerWidth / 2, y: innerHeight - 80 };
  return centerOf(`seat:${pid}`) ?? screenCenter();
}

/** Tỉ lệ lá nhỏ ở ghế người khác so với lá chuẩn */
function seatScale(): number {
  const el = document.querySelector<HTMLElement>('.seat .mini .card');
  return (el?.offsetWidth || 34) / cardWidth();
}

const deckPt = () => centerOf('deck') ?? screenCenter();
const discardPt = () => centerOf('discard') ?? screenCenter();

interface FlyOpts {
  card: Card | null;
  from: Pt;
  to: Pt;
  fromScale?: number;
  toScale?: number;
  delay?: number;
  duration?: number;
  spin?: number;
  arc?: number;
}

const T = (p: Pt, s: number, r: number) => `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${r}deg) scale(${s})`;

/** Cho một lá bài bay theo đường cong. onLand chạy khi lá chạm đích */
function fly(o: FlyOpts, onLand?: () => void) {
  const { card, from, to, fromScale = 1, toScale = 1, delay = 0, duration = 400, spin = 0, arc = 50 } = o;
  const start = () => {
    const layer = document.getElementById('fly-layer');
    if (!layer || reduceMotion()) {
      onLand?.();
      return;
    }
    const el = document.createElement('div');
    el.className = 'flyer';
    el.innerHTML = `<div class="${cardClass(card)}">${cardInner(card)}</div>`;
    layer.appendChild(el);
    const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - arc };
    const peak = Math.max(fromScale, toScale) * 1.12;
    const anim = el.animate(
      [
        { transform: T(from, fromScale, 0), easing: 'cubic-bezier(.3,.6,.5,1)' },
        { transform: T(mid, peak, spin * 0.55), offset: 0.45, easing: 'cubic-bezier(.4,0,.6,1)' },
        { transform: T(to, toScale, spin) },
      ],
      { duration, fill: 'forwards' },
    );
    anims.add(anim);
    anim.onfinish = () => {
      anims.delete(anim);
      onLand?.();
      // Gỡ ở frame sau để lá thật kịp hiện ra, tránh nháy
      requestAnimationFrame(() => el.remove());
    };
  };
  if (delay > 0) later(start, delay);
  else start();
}

/** Rung màn hình (chạy trên compositor) */
function shakeStage(hard: boolean) {
  const el = document.getElementById('stage');
  if (!el || reduceMotion()) return;
  const a = hard ? 14 : 6;
  el.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${-a}px, ${a * 0.5}px)` },
      { transform: `translate(${a}px, ${-a * 0.5}px)` },
      { transform: `translate(${-a * 0.6}px, ${a * 0.3}px)` },
      { transform: `translate(${a * 0.4}px, 0)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: hard ? 550 : 320, easing: 'ease-out' },
  );
}

function pushDiscard(card: Card) {
  useStore.setState((s) => ({
    discard: [
      ...s.discard.slice(-5),
      { card, key: nextId(), rot: Math.random() * 40 - 20, dx: Math.random() * 12 - 6, dy: Math.random() * 12 - 6 },
    ],
  }));
}

function setHidden(cardId: string, hidden: boolean) {
  useStore.setState((s) => {
    const h = new Set(s.hiddenCards);
    if (hidden) h.add(cardId);
    else h.delete(cardId);
    return { hiddenCards: h };
  });
}

function arrive(pid: string, n = 1) {
  useStore.setState((s) => ({ incoming: { ...s.incoming, [pid]: Math.max(0, (s.incoming[pid] ?? 0) - n) } }));
}

function burst(colors: string[], origin: Pt, count = 120) {
  void confetti({
    particleCount: count,
    spread: 110,
    startVelocity: 45,
    origin: { x: origin.x / innerWidth, y: origin.y / innerHeight },
    colors,
    zIndex: 60,
    disableForReducedMotion: true,
  });
}

/** Hiệu ứng khi lá chạm chồng bài */
function landPlay(card: Card, color: Color) {
  pushDiscard(card);
  if (card.value === 'wild4') {
    sfx.boom();
    shakeStage(true);
    addEffect({ kind: 'wild4', color }, 1500);
    burst(Object.values(HEX), discardPt(), 140);
  } else if (card.value === 'draw2') {
    sfx.hit();
    shakeStage(false);
    addEffect({ kind: 'bigText', text: '+2', color: card.color as Color, size: 1 }, 1000);
  } else if (card.value === 'wild') {
    sfx.magic();
  } else {
    sfx.play();
  }
}

const extraAfterPlay = (card: Card) => (card.value === 'wild4' ? 850 : card.value === 'draw2' ? 400 : 50);

/**
 * Đánh bài "lạc quan": cho lá bay ngay khi bấm, không chờ server.
 * Trả về hàm hoàn tác nếu server từ chối.
 */
export function animateLocalPlay(card: Card, color: Color | undefined): () => void {
  const r = rectOf(`card:${card.id}`);
  const state = useStore.getState().state;
  const from = r ? center(r) : seatPt(state?.me ?? '', state?.me ?? '');
  const entry = { landed: false, cancelled: false };
  localPlays.set(card.id, entry);
  setHidden(card.id, true);
  const now = performance.now();
  busyUntil = Math.max(busyUntil, now) + PLAY_MS + extraAfterPlay(card);
  fly({ card, from, to: discardPt(), duration: PLAY_MS, spin: Math.random() * 50 - 25 + 360, arc: 80 }, () => {
    if (entry.cancelled) return; // server từ chối → đã hoàn tác
    entry.landed = true;
    landPlay(card, color ?? (card.color as Color));
  });
  return () => {
    localPlays.delete(card.id);
    setHidden(card.id, false);
    if (entry.landed) {
      useStore.setState((s) => ({ discard: s.discard.filter((d) => d.card.id !== card.id) }));
    }
    entry.cancelled = true;
    busyUntil = performance.now();
  };
}

export function handlePayload({ state, events }: StatePayload) {
  if (document.hidden) {
    useStore.setState({ state, clockOffset: state.serverNow - Date.now() });
    snapBoard(state);
    return;
  }
  const st = useStore.getState();
  const prev = st.state;
  const me = state.me;

  // Lấy vị trí lá mình vừa đánh trước khi nó biến khỏi tay
  const fromRects = new Map<string, DOMRect>();
  for (const e of events) {
    if (e.type === 'play' && e.playerId === me && !localPlays.has(e.card.id)) {
      const r = rectOf(`card:${e.card.id}`);
      if (r) fromRects.set(e.card.id, r);
    }
  }

  // Ẩn trước các lá sắp bay tới
  const hidden = new Set(st.hiddenCards);
  const incoming = { ...st.incoming };
  let discard = st.discard;
  const myIds = new Set(state.hand.map((c) => c.id));
  for (const id of hidden) if (!myIds.has(id)) hidden.delete(id);

  for (const e of events) {
    if (e.type === 'deal') {
      for (const c of state.hand) hidden.add(c.id);
      for (const pid of e.order) if (pid !== me) incoming[pid] = e.perPlayer;
      discard = [];
      localPlays.clear();
      document.getElementById('fly-layer')?.replaceChildren();
    } else if (e.type === 'draw') {
      if (e.playerId === me) e.cards?.forEach((c) => hidden.add(c.id));
      else incoming[e.playerId] = (incoming[e.playerId] ?? 0) + e.count;
    }
  }

  if (prev && events.some((e) => (e.type === 'swap' && (e.a === me || e.b === me)) || e.type === 'rotate')) {
    const before = new Set(prev.hand.map((c) => c.id));
    const drawn = new Set(events.flatMap((e) => (e.type === 'draw' && e.playerId === me ? (e.cards ?? []).map((c) => c.id) : [])));
    exchangeIds = state.hand.filter((c) => !before.has(c.id) && !drawn.has(c.id)).map((c) => c.id);
    for (const id of exchangeIds) hidden.add(id);
  }

  const freshBoard = !prev || prev.code !== state.code || prev.round !== state.round;
  if (state.phase === 'lobby') discard = [];
  else if (freshBoard && !events.some((e) => e.type === 'deal') && state.topCard) {
    discard = [{ card: state.topCard, key: nextId(), rot: 0, dx: 0, dy: 0 }];
  }

  useStore.setState({ state, clockOffset: state.serverNow - Date.now(), hiddenCards: hidden, incoming, discard });

  // Đợi React vẽ xong để đo vị trí đích (bỏ qua nếu đã bị huỷ do tab ẩn trong lúc chờ)
  const gen = generation;
  requestAnimationFrame(() => {
    if (gen === generation && !document.hidden) runTimeline(events, state, fromRects, prev);
  });
}

export function handleEvents(events: GameEvent[]) {
  const state = useStore.getState().state;
  if (!state || document.hidden) return;
  for (const e of events) {
    if (e.type === 'reaction') {
      sfx.pop();
      addEffect({ kind: 'emoji', at: seatPt(e.playerId, state.me), emoji: e.emoji }, 1800);
    }
  }
}

function runTimeline(events: GameEvent[], state: ClientState, fromRects: Map<string, DOMRect>, prev: ClientState | null) {
  const me = state.me;
  const name = (id: string) => (id === me ? 'Bạn' : (state.players.find((p) => p.id === id)?.name ?? '?'));
  const now = performance.now();
  let t = Math.min(Math.max(0, busyUntil - now), 2500);
  const at = (ms: number, fn: () => void) => (ms <= 0 ? fn() : later(fn, ms));
  const sScale = seatScale();

  for (const e of events) {
    switch (e.type) {
      case 'deal': {
        sfx.draw();
        let k = 0;
        for (let i = 0; i < e.perPlayer; i++) {
          for (const pid of e.order) {
            const delay = t + k * 45;
            k++;
            if (pid === me) {
              const c = state.hand[i];
              const r = c && rectOf(`card:${c.id}`);
              fly({ card: null, from: deckPt(), to: r ? center(r) : seatPt(me, me), delay, duration: 360, arc: 40 }, () => c && setHidden(c.id, false));
            } else {
              fly({ card: null, from: deckPt(), to: seatPt(pid, me), toScale: sScale, delay, duration: 360, arc: 30 }, () => arrive(pid));
            }
            if (k % 3 === 0) at(delay, sfx.deal);
          }
        }
        t += k * 45 + 380;
        const top = state.topCard;
        if (top) {
          fly({ card: top, from: deckPt(), to: discardPt(), delay: t, duration: 420, spin: 360, arc: 60 }, () => {
            pushDiscard(top);
            sfx.play();
          });
          t += 480;
        }
        break;
      }

      case 'play': {
        const local = localPlays.get(e.card.id);
        if (local) {
          // Đã animate lúc bấm — chỉ cần dọn dẹp
          localPlays.delete(e.card.id);
          break;
        }
        const fr = fromRects.get(e.card.id);
        const from = fr ? center(fr) : seatPt(e.playerId, me);
        const fromScale = fr || e.playerId === me ? 1 : sScale;
        const card = e.card;
        const color = e.color;
        fly({ card, from, to: discardPt(), fromScale, delay: t, duration: PLAY_MS, spin: Math.random() * 60 - 30 + 360, arc: 80 }, () =>
          landPlay(card, color),
        );
        t += PLAY_MS + extraAfterPlay(card);
        break;
      }

      case 'color': {
        at(t, () => {
          addEffect({ kind: 'ripple', at: discardPt(), color: e.color }, 1000);
          addEffect({ kind: 'bigText', text: COLOR_NAMES_VI[e.color], sub: `${name(e.playerId)} đổi màu`, color: e.color, size: 0.55 }, 1100);
        });
        t += 350;
        break;
      }

      case 'skip': {
        at(t, () => {
          sfx.skip();
          addEffect({ kind: 'stamp', at: seatPt(e.playerId, me) }, 1300);
          addEffect({ kind: 'bigText', text: 'MẤT LƯỢT!', sub: name(e.playerId), color: 'dark', size: 0.6 }, 1000);
        });
        t += 650;
        break;
      }

      case 'reverse': {
        at(t, () => {
          sfx.reverse();
          addEffect({ kind: 'reverse', direction: e.direction }, 1100);
        });
        t += 650;
        break;
      }

      case 'stack': {
        at(t, () => {
          sfx.stack();
          shakeStage(e.total >= 8);
          addEffect(
            { kind: 'bigText', text: `+${e.total}`, sub: `Cộng dồn! ${name(e.targetId)} nguy rồi`, color: e.total >= 8 ? 'red' : 'yellow', size: 1 + Math.min(e.total, 12) * 0.05 },
            1200,
          );
        });
        t += 600;
        break;
      }

      case 'draw': {
        const isMe = e.playerId === me;
        const step = e.penalty ? 110 : 0;
        if (e.penalty) {
          at(t, () => {
            sfx.buzz();
            addEffect({ kind: 'seatText', at: seatPt(e.playerId, me), text: `+${e.count}`, tone: 'penalty' }, 1400);
          });
        } else {
          // Rút liên tiếp (luật rút đến khi đánh được): đếm +2, +3, +4… tại ghế
          const nowMs = Date.now();
          drawChain = drawChain.pid === e.playerId && nowMs - drawChain.at < 2000 ? { pid: e.playerId, n: drawChain.n + 1, at: nowMs } : { pid: e.playerId, n: 1, at: nowMs };
          const n = drawChain.n;
          if (n >= 2) {
            at(t + 300, () => addEffect({ kind: 'seatText', at: seatPt(e.playerId, me), text: `+${n}`, tone: n >= 5 ? 'penalty' : 'info' }, 700));
          }
        }
        for (let i = 0; i < e.count; i++) {
          const delay = t + i * step;
          const c = isMe ? e.cards?.[i] : undefined;
          const r = c && rectOf(`card:${c.id}`);
          at(delay, sfx.draw);
          fly(
            {
              card: null,
              from: deckPt(),
              to: isMe ? (r ? center(r) : seatPt(me, me)) : seatPt(e.playerId, me),
              toScale: isMe ? 1 : sScale,
              delay,
              duration: 380,
              spin: isMe ? 0 : Math.random() * 40 - 20,
              arc: 50,
            },
            () => (c ? setHidden(c.id, false) : arrive(e.playerId)),
          );
        }
        t += e.count * step + 400;
        break;
      }

      case 'uno': {
        at(t, () => {
          sfx.uno();
          addEffect({ kind: 'seatText', at: seatPt(e.playerId, me), text: 'UNO!', tone: 'uno' }, 1500);
        });
        t += 300;
        break;
      }

      case 'caught': {
        at(t, () => {
          sfx.buzz();
          shakeStage(false);
          addEffect({ kind: 'bigText', text: 'BẮT ĐƯỢC!', sub: `${name(e.catcherId)} bắt ${name(e.targetId)} quên hô UNO`, color: 'red', size: 0.7 }, 1400);
        });
        t += 500;
        break;
      }

      case 'pass':
        at(t, () => addEffect({ kind: 'seatText', at: seatPt(e.playerId, me), text: 'Bỏ lượt', tone: 'info' }, 1000));
        t += 100;
        break;

      case 'timeout':
        at(t, () => addEffect({ kind: 'seatText', at: seatPt(e.playerId, me), text: 'Hết giờ!', tone: 'penalty' }, 1100));
        t += 200;
        break;

      case 'shuffle':
        at(t, () => toast('Hết bài — xào lại chồng bài đã đánh'));
        break;

      case 'win': {
        at(t + 200, () => {
          sfx.win();
          const colors = Object.values(HEX);
          burst(colors, { x: innerWidth * 0.2, y: innerHeight * 0.6 }, 120);
          burst(colors, { x: innerWidth * 0.8, y: innerHeight * 0.6 }, 120);
          later(() => burst(colors, screenCenter(), 160), 400);
          addEffect({ kind: 'bigText', text: e.playerId === me ? 'BẠN THẮNG!' : `${name(e.playerId)} thắng!`, sub: `+${e.points} điểm`, color: 'wild', size: 0.8 }, 2100);
        });
        t += 1800;
        break;
      }

      case 'swap':
      case 'rotate': {
        // Bài bay giữa các ghế
        const pairs: [string, string][] = [];
        if (e.type === 'swap') pairs.push([e.a, e.b], [e.b, e.a]);
        else {
          const ids = state.players.map((p) => p.id);
          ids.forEach((id, i) => pairs.push([id, ids[(((i + e.direction) % ids.length) + ids.length) % ids.length]]));
        }
        at(t, () => {
          sfx.reverse();
          const sub = e.type === 'swap' ? `${name(e.a)} ⇄ ${name(e.b)}` : 'Cả bàn chuyền bài cho người kế tiếp';
          addEffect({ kind: 'bigText', text: e.type === 'swap' ? 'ĐỔI BÀI!' : 'CHUYỀN BÀI!', sub, color: 'blue', size: 0.6 }, 1300);
        });
        const dur = 650;
        for (const [from, to] of pairs) {
          const fromScale = from === me ? 1 : sScale;
          const toScale = to === me ? 1 : sScale;
          for (let k = 0; k < 4; k++) {
            fly({
              card: null,
              from: seatPt(from, me),
              to: seatPt(to, me),
              fromScale,
              toScale,
              delay: t + 150 + k * 70,
              duration: dur,
              spin: Math.random() * 60 - 30,
              arc: 70,
            });
          }
        }
        const ids = exchangeIds;
        exchangeIds = [];
        at(t + 150 + 3 * 70 + dur, () => ids.forEach((id) => setHidden(id, false)));
        t += 150 + 3 * 70 + dur + 150;
        break;
      }

      case 'reaction':
        break;
    }
  }

  busyUntil = Math.max(busyUntil, now + t);

  // Báo tới lượt mình
  if (state.phase === 'playing' && state.turnPlayerId === me && prev?.turnPlayerId !== me) {
    at(t, sfx.turn);
  }
}

/** Thời gian còn lại của animation đang chạy (ms) — dùng để trì hoãn modal kết thúc */
export function animationRemaining(): number {
  return Math.max(0, busyUntil - performance.now());
}
