import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAOS_SETTINGS, CLASSIC_SETTINGS, type Card, type CardValue, type Color, type Settings } from '../../shared/types';
import { chooseBotMove, findJumpIn } from './bot';
import { createDeck, Round } from './round';

const S: Settings = { ...CLASSIC_SETTINGS, stacking: true, turnSeconds: 0 };
let n = 1000;
const card = (color: Card['color'], value: CardValue): Card => ({ id: `t${n++}`, color, value });

/** Tạo ván rồi gán tay bài / lá trên cùng theo ý muốn */
function setup(hands: Card[][], top: Card = card('red', '5'), settings = S) {
  const r = new Round(hands.map((_, i) => `p${i}`), settings, Math.random, 0);
  r.players.forEach((p, i) => (p.hand = hands[i]));
  r.discard = [top];
  r.color = top.color as Color;
  return r;
}

test('bộ bài có 108 lá', () => {
  const d = createDeck();
  assert.equal(d.length, 108);
  assert.equal(new Set(d.map((c) => c.id)).size, 108);
});

test('chia 7 lá, lá đầu là lá số', () => {
  const r = new Round(['a', 'b', 'c'], S);
  assert.ok(r.players.every((p) => p.hand.length === 7));
  assert.match(r.top.value, /^\d$/);
  assert.equal(r.drawPile.length + r.discard.length + 21, 108);
});

test('đánh lá cùng màu → chuyển lượt', () => {
  const r = setup([[card('red', '7'), card('blue', '1')], [card('green', '2')]]);
  r.play('p0', r.players[0].hand[0].id);
  assert.equal(r.current.id, 'p1');
  assert.equal(r.top.value, '7');
});

test('không cho đánh lá sai màu sai số', () => {
  const r = setup([[card('blue', '7'), card('blue', '1')], [card('green', '2')]]);
  assert.throws(() => r.play('p0', r.players[0].hand[0].id));
});

test('không cho đánh khi chưa tới lượt', () => {
  const r = setup([[card('red', '7')], [card('red', '2'), card('red', '3')]]);
  assert.throws(() => r.play('p1', r.players[1].hand[0].id), /Chưa tới lượt/);
});

test('cấm lượt bỏ qua người kế tiếp', () => {
  const r = setup([[card('red', 'skip'), card('red', '1')], [card('red', '2')], [card('red', '3')]]);
  const ev = r.play('p0', r.players[0].hand[0].id);
  assert.ok(ev.some((e) => e.type === 'skip' && e.playerId === 'p1'));
  assert.equal(r.current.id, 'p2');
});

test('đổi chiều với 3 người', () => {
  const r = setup([[card('red', 'reverse'), card('red', '1')], [card('red', '2')], [card('red', '3')]]);
  r.play('p0', r.players[0].hand[0].id);
  assert.equal(r.direction, -1);
  assert.equal(r.current.id, 'p2');
});

test('đổi chiều với 2 người = cấm lượt', () => {
  const r = setup([[card('red', 'reverse'), card('red', '1')], [card('red', '2')]]);
  r.play('p0', r.players[0].hand[0].id);
  assert.equal(r.current.id, 'p0');
});

test('+2 không thể chồng → người kế rút 2 và mất lượt', () => {
  const r = setup([[card('red', 'draw2'), card('red', '1')], [card('blue', '2')], [card('red', '3')]]);
  r.play('p0', r.players[0].hand[0].id);
  assert.equal(r.players[1].hand.length, 3);
  assert.equal(r.current.id, 'p2');
  assert.equal(r.pendingDraw, 0);
});

test('chồng +2 → +4 rồi người sau rút 6', () => {
  const r = setup([
    [card('red', 'draw2'), card('red', '1')],
    [card('wild', 'wild4'), card('blue', '9')],
    [card('green', '3'), card('green', '4')],
  ]);
  r.play('p0', r.players[0].hand[0].id);
  assert.equal(r.current.id, 'p1');
  assert.equal(r.pendingDraw, 2);
  const ev = r.play('p1', r.players[1].hand[0].id, 'green');
  assert.ok(ev.some((e) => e.type === 'stack' && e.total === 6));
  // p2 không có lá chồng → tự động rút 6
  assert.equal(r.players[2].hand.length, 8);
  assert.equal(r.current.id, 'p0');
  assert.equal(r.color, 'green');
});

test('tắt chồng bài → +2 phạt ngay dù người kế có +2', () => {
  const r = setup(
    [[card('red', 'draw2'), card('red', '1')], [card('blue', 'draw2')], [card('red', '3')]],
    card('red', '5'),
    { ...S, stacking: false },
  );
  r.play('p0', r.players[0].hand[0].id);
  assert.equal(r.players[1].hand.length, 3);
  assert.equal(r.current.id, 'p2');
});

test('người bị +2 chọn rút thay vì chồng', () => {
  const r = setup([[card('red', 'draw2'), card('red', '1')], [card('blue', 'draw2'), card('blue', '1')]]);
  r.play('p0', r.players[0].hand[0].id);
  assert.equal(r.current.id, 'p1');
  r.draw('p1');
  assert.equal(r.players[1].hand.length, 4);
  assert.equal(r.current.id, 'p0');
});

test('wild bắt buộc chọn màu', () => {
  const r = setup([[card('wild', 'wild'), card('red', '1')], [card('red', '2')]]);
  assert.throws(() => r.play('p0', r.players[0].hand[0].id));
  r.play('p0', r.players[0].hand[0].id, 'blue');
  assert.equal(r.color, 'blue');
});

test('quên hô UNO → bị bắt rút 2', () => {
  const r = setup([[card('red', '1'), card('red', '2')], [card('blue', '2'), card('blue', '3')]]);
  r.play('p0', r.players[0].hand[0].id);
  assert.equal(r.unoVulnerable, 'p0');
  r.catchUno('p1', 'p0');
  assert.equal(r.players[0].hand.length, 3);
  assert.equal(r.unoVulnerable, null);
});

test('hô UNO trước khi đánh thì an toàn', () => {
  const r = setup([[card('red', '1'), card('red', '2')], [card('blue', '2'), card('blue', '3')]]);
  r.callUno('p0');
  const ev = r.play('p0', r.players[0].hand[0].id);
  assert.ok(ev.some((e) => e.type === 'uno'));
  assert.equal(r.unoVulnerable, null);
  assert.throws(() => r.catchUno('p1', 'p0'));
});

test('rút bài đánh được thì được chọn đánh hoặc bỏ lượt', () => {
  const r = setup([[card('blue', '1')], [card('blue', '2')]]);
  r.drawPile.push(card('red', '9'));
  r.draw('p0');
  assert.equal(r.hasDrawn, true);
  assert.equal(r.current.id, 'p0');
  assert.throws(() => r.play('p0', r.players[0].hand[0].id)); // không phải lá vừa rút
  r.pass('p0');
  assert.equal(r.current.id, 'p1');
});

test('rút bài không đánh được thì tự qua lượt', () => {
  const r = setup([[card('blue', '1')], [card('blue', '2')]]);
  r.drawPile.push(card('green', '9'));
  r.draw('p0');
  assert.equal(r.current.id, 'p1');
});

test('hết bài → thắng và tính điểm', () => {
  const r = setup([[card('red', '1')], [card('blue', '2'), card('wild', 'wild4'), card('green', 'skip')]]);
  const ev = r.play('p0', r.players[0].hand[0].id);
  assert.equal(r.winnerId, 'p0');
  assert.ok(ev.some((e) => e.type === 'win' && e.points === 72));
});

test('hết chồng bài rút → xào lại chồng bỏ', () => {
  const r = setup([[card('blue', '1')], [card('blue', '2')]]);
  r.discard = [card('green', '3'), card('green', '4'), card('red', '5')];
  r.drawPile = [];
  const ev = r.draw('p0');
  assert.ok(ev.some((e) => e.type === 'shuffle'));
  assert.equal(r.discard.length, 1);
  assert.equal(r.top.value, '5');
});

test('hết giờ → tự rút và qua lượt', () => {
  const r = setup([[card('blue', '1')], [card('blue', '2')]]);
  r.drawPile.push(card('red', '9'));
  r.timeout('p0');
  assert.equal(r.current.id, 'p1');
  assert.equal(r.players[0].hand.length, 2);
});

test('bot chơi hết một ván không lỗi', () => {
  for (let g = 0; g < 30; g++) {
    const r = new Round(['a', 'b', 'c', 'd'], S);
    let steps = 0;
    while (!r.winnerId && steps < 2000) {
      const id = r.current.id;
      const m = chooseBotMove(r, id);
      if (m.type === 'play') r.play(id, m.cardId, m.color, m.uno);
      else if (m.type === 'draw') r.draw(id);
      else r.pass(id);
      steps++;
    }
    const total = r.players.reduce((s, p) => s + p.hand.length, 0) + r.drawPile.length + r.discard.length;
    assert.equal(total, 108);
  }
});

// ---------- Luật tuỳ chọn ----------

test('rút đến khi đánh được: rút từng lá, giữ lượt tới khi được lá đánh được', () => {
  const r = setup([[card('blue', '1')], [card('blue', '2')]], card('red', '5'), { ...S, drawUntilPlayable: true });
  r.drawPile.push(card('red', '9'), card('green', '1'), card('yellow', '2')); // rút từ cuối mảng
  assert.equal(r.mustDraw(), true);
  for (let i = 0; i < 2; i++) {
    const ev = r.draw('p0');
    assert.ok(ev.some((e) => e.type === 'draw' && e.count === 1));
    assert.equal(r.current.id, 'p0'); // vẫn giữ lượt
    assert.equal(r.hasDrawn, false);
    assert.equal(r.mustDraw(), true);
  }
  r.draw('p0'); // lá thứ 3: đỏ 9 đánh được
  assert.equal(r.hasDrawn, true);
  assert.equal(r.mustDraw(), false);
  assert.equal(r.players[0].hand.length, 4);
  assert.throws(() => r.pass('p0'), /phải đánh/);
  r.play('p0', r.drawnCardId!);
  assert.equal(r.current.id, 'p1');
});

test('rút đến khi đánh được: hết bài để rút thì tự qua lượt', () => {
  const r = setup([[card('blue', '1')], [card('blue', '2')]], card('red', '5'), { ...S, drawUntilPlayable: true });
  r.drawPile = [card('green', '1')];
  r.draw('p0');
  assert.equal(r.current.id, 'p1');
});

test('không rút đến khi đánh được: rút 1 lá không đánh được thì qua lượt', () => {
  const r = setup([[card('blue', '1')], [card('blue', '2')]], card('red', '5'));
  r.drawPile.push(card('red', '9'), card('green', '1'));
  assert.equal(r.mustDraw(), true);
  r.draw('p0');
  assert.equal(r.current.id, 'p1');
});

test('có lá đánh được thì không tự rút', () => {
  const r = setup([[card('red', '1')], [card('blue', '2')]], card('red', '5'));
  assert.equal(r.mustDraw(), false);
});

test('rút đến khi đánh được: hết giờ thì máy tự đánh lá vừa rút', () => {
  const r = setup([[card('blue', '1'), card('blue', '3')], [card('blue', '2')]], card('red', '5'), { ...S, drawUntilPlayable: true });
  r.drawPile.push(card('wild', 'wild'), card('green', '1'));
  r.timeout('p0'); // rút xanh lá 1: chưa đánh được, vẫn giữ lượt
  assert.equal(r.current.id, 'p0');
  r.draw('p0'); // server tự rút tiếp → được Wild
  r.timeout('p0'); // hết giờ → tự đánh Wild, chọn màu nhiều nhất
  assert.equal(r.top.value, 'wild');
  assert.equal(r.color, 'blue');
  assert.equal(r.current.id, 'p1');
});

test('7-0: đánh 7 đổi bài với người được chọn', () => {
  const r = setup(
    [[card('red', '7'), card('red', '1'), card('red', '2')], [card('blue', '2')], [card('green', '3'), card('green', '4')]],
    card('red', '5'),
    { ...S, sevenZero: true },
  );
  assert.throws(() => r.play('p0', r.players[0].hand[0].id), /chọn người/);
  const ev = r.play('p0', r.players[0].hand[0].id, undefined, false, 'p1');
  assert.ok(ev.some((e) => e.type === 'swap' && e.a === 'p0' && e.b === 'p1'));
  assert.equal(r.players[0].hand.length, 1);
  assert.equal(r.players[1].hand.length, 2);
});

test('7-0: đánh 0 cả bàn chuyền bài theo chiều chơi', () => {
  const r = setup(
    [[card('red', '0'), card('red', '1')], [card('blue', '2'), card('blue', '3')], [card('green', '3'), card('green', '4'), card('green', '5')]],
    card('red', '5'),
    { ...S, sevenZero: true },
  );
  r.play('p0', r.players[0].hand[0].id);
  assert.deepEqual(r.players.map((p) => p.hand.length), [3, 1, 2]);
  assert.equal(r.players[1].hand[0].value, '1');
});

test('chặn ngang: lá giống hệt được đánh khi chưa tới lượt', () => {
  const r = setup([[card('blue', '1'), card('blue', '2')], [card('blue', '3')], [card('red', '5'), card('red', '9')]], card('red', '5'), {
    ...S,
    jumpIn: true,
  });
  const ev = r.play('p2', r.players[2].hand[0].id);
  assert.ok(ev.some((e) => e.type === 'jumpIn' && e.playerId === 'p2'));
  assert.equal(r.current.id, 'p0'); // lượt tiếp theo tính từ người chặn
});

test('chặn ngang: lá không giống hệt thì không được', () => {
  const r = setup([[card('blue', '1')], [card('blue', '3')], [card('red', '6'), card('red', '9')]], card('red', '5'), { ...S, jumpIn: true });
  assert.throws(() => r.play('p2', r.players[2].hand[0].id), /Chưa tới lượt/);
});

test('không về bằng lá chức năng', () => {
  const r = setup([[card('red', 'skip')], [card('blue', '3')]], card('red', '5'), { ...S, noActionFinish: true });
  assert.throws(() => r.play('p0', r.players[0].hand[0].id), /lá chức năng/);
});

test('số lá chia theo cài đặt', () => {
  const r = new Round(['a', 'b'], { ...S, handSize: 10 });
  assert.ok(r.players.every((p) => p.hand.length === 10));
});

test('bot chơi hết ván với luật Hỗn loạn không lỗi', () => {
  for (let g = 0; g < 40; g++) {
    const r = new Round(['a', 'b', 'c', 'd'], { ...CHAOS_SETTINGS });
    let steps = 0;
    while (!r.winnerId && steps < 3000) {
      // thỉnh thoảng có bot chặn ngang
      const jumper = r.players.find((p) => p.id !== r.current.id && findJumpIn(r, p.id));
      if (jumper && Math.random() < 0.3) {
        const m = findJumpIn(r, jumper.id)!;
        if (m.type === 'play') r.play(jumper.id, m.cardId, m.color, m.uno, m.swapWith);
      } else {
        const id = r.current.id;
        const m = chooseBotMove(r, id);
        if (m.type === 'play') r.play(id, m.cardId, m.color, m.uno, m.swapWith);
        else if (m.type === 'draw') r.draw(id);
        else r.pass(id);
      }
      steps++;
    }
    const total = r.players.reduce((s, p) => s + p.hand.length, 0) + r.drawPile.length + r.discard.length;
    assert.equal(total, 108);
  }
});
