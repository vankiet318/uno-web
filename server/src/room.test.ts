import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { ServerMsg } from '../../shared/protocol';
import { Room, type Transport } from './room';

/** Transport giả: ghi lại tin đã gửi cho từng kết nối */
function fakeTransport() {
  const sent = new Map<string, ServerMsg[]>();
  const kicked: string[] = [];
  const t: Transport = {
    send: (id, msg) => sent.set(id, [...(sent.get(id) ?? []), msg]),
    kick: (id) => kicked.push(id),
  };
  const lastState = (id: string) => {
    const msgs = (sent.get(id) ?? []).filter((m) => m.t === 'state');
    const m = msgs[msgs.length - 1];
    return m && m.t === 'state' ? m.payload.state : null;
  };
  const chats = (id: string) => (sent.get(id) ?? []).flatMap((m) => (m.t === 'chat' ? m.messages.map((x) => x.text) : []));
  return { t, sent, kicked, lastState, chats };
}

let rooms: Room[] = [];
afterEach(() => {
  for (const r of rooms) r.destroy(); // dừng các bộ hẹn giờ (tự rút bài, bot…)
  rooms = [];
});

function setup() {
  const f = fakeTransport();
  const room = new Room('ABCDE', f.t);
  rooms.push(room);
  room.updateSettings({ turnSeconds: 0 });
  const a = room.join('tokenAAAAAAA', 'An', 'cA');
  const b = room.join('tokenBBBBBBB', 'Bình', 'cB');
  room.start();
  return { f, room, a, b };
}

test('vào giữa ván → thành người xem, không có bài, không ở trong ván', () => {
  const { f, room } = setup();
  const c = room.join('tokenCCCCCCC', 'Chi', 'cC');
  assert.equal(c.spectator, true);
  assert.equal(room.round!.players.some((p) => p.id === c.id), false);
  room.broadcast([]);
  const st = f.lastState('cC')!;
  assert.equal(st.phase, 'playing');
  assert.deepEqual(st.hand, []);
  assert.equal(st.players.find((p) => p.id === c.id)!.spectator, true);
  assert.ok(f.chats('cA').some((t) => t.includes('Chi vào xem')));
});

test('người xem không đánh/rút/bắt UNO được', () => {
  const { room } = setup();
  const c = room.join('tokenCCCCCCC', 'Chi', 'cC');
  assert.throws(() => room.act(c.id, (r) => r.draw(c.id)), /đang xem/);
  assert.throws(() => room.act(c.id, (r) => r.callUno(c.id)), /đang xem/);
});

test('ván sau người xem được chia bài', () => {
  const { room } = setup();
  const c = room.join('tokenCCCCCCC', 'Chi', 'cC');
  room.phase = 'roundOver'; // giả lập hết ván
  room.start();
  assert.equal(c.spectator, false);
  assert.equal(room.round!.players.length, 3);
  assert.equal(room.round!.player(c.id).hand.length, 7);
});

test('người xem rời phòng → bị xoá, không thành bot', () => {
  const { room } = setup();
  const c = room.join('tokenCCCCCCC', 'Chi', 'cC');
  room.leave(c.id);
  assert.equal(room.members.some((m) => m.id === c.id), false);
  assert.equal(room.members.filter((m) => m.isBot).length, 0);
});

test('người chơi rời giữa ván → máy chơi thay (như cũ)', () => {
  const { room, b } = setup();
  room.leave(b.id);
  const m = room.members.find((x) => x.id === b.id)!;
  assert.equal(m.isBot, true);
  assert.ok(m.name.endsWith('(máy)'));
});

test('chủ phòng mời người xem ra giữa ván được, người đang chơi thì không', () => {
  const { f, room, b } = setup();
  const c = room.join('tokenCCCCCCC', 'Chi', 'cC');
  assert.throws(() => room.kick(b.id), /người đang xem/);
  room.kick(c.id);
  assert.deepEqual(f.kicked, ['cC']);
  assert.equal(room.members.some((m) => m.id === c.id), false);
});

test('người xem F5 vào lại vẫn là người xem, cùng id', () => {
  const { room } = setup();
  const c = room.join('tokenCCCCCCC', 'Chi', 'cC');
  room.disconnect('cC');
  const again = room.join('tokenCCCCCCC', 'Chi', 'cC2');
  assert.equal(again.id, c.id);
  assert.equal(again.spectator, true);
});

test('phòng đầy tính cả người xem', () => {
  const { room } = setup();
  for (let i = 0; i < 8; i++) room.join(`tokenXXXXXX${i}`, `P${i}`, `c${i}`);
  assert.throws(() => room.join('tokenZZZZZZZ', 'Z', 'cZ'), /đầy/);
});
