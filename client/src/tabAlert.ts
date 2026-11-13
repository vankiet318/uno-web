// Báo tới lượt trên tiêu đề tab khi người chơi đang ở tab khác
import { useStore } from './store';

const BASE_TITLE = document.title;
// Hai trạng thái nhấp nháy đều ghi rõ nội dung: Chrome có thể giảm nhịp hẹn giờ của tab ẩn
// xuống 1 lần/phút, khi đó tiêu đề vẫn luôn báo "Tới lượt bạn".
const ALERT_TITLES = ['🔴 Tới lượt bạn! – UNO', '⭕ Tới lượt bạn! – UNO'];

let blink: ReturnType<typeof setInterval> | null = null;

function start() {
  if (blink) return;
  let i = 0;
  document.title = ALERT_TITLES[0];
  blink = setInterval(() => {
    i = (i + 1) % ALERT_TITLES.length;
    document.title = ALERT_TITLES[i];
  }, 1000);
}

function stop() {
  if (!blink) return;
  clearInterval(blink);
  blink = null;
  document.title = BASE_TITLE;
}

function update() {
  const s = useStore.getState().state;
  const myTurn = !!s && s.phase === 'playing' && s.turnPlayerId === s.me;
  if (document.hidden && myTurn) start();
  else stop();
}

useStore.subscribe(update);
document.addEventListener('visibilitychange', update);
