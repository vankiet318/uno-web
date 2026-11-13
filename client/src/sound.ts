// Âm thanh tổng hợp bằng Web Audio — không cần file mp3
import { useStore } from './store';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (useStore.getState().muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Gọi khi người dùng chạm lần đầu để trình duyệt cho phép phát âm thanh */
export function unlockAudio() {
  ac();
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; to?: number; at?: number } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + (opts.at ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.2, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, opts: { vol?: number; freq?: number; q?: number; at?: number; sweep?: number } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + (opts.at ?? 0);
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(opts.freq ?? 2000, t);
  if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t + dur);
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(opts.vol ?? 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export const sfx = {
  deal: () => noise(0.06, { freq: 3500, vol: 0.12, q: 2 }),
  draw: () => noise(0.1, { freq: 2500, vol: 0.18, sweep: 5000 }),
  play: () => {
    noise(0.12, { freq: 1800, vol: 0.25, sweep: 600 });
    tone(180, 0.08, { type: 'triangle', vol: 0.15 });
  },
  hit: () => {
    tone(160, 0.35, { type: 'square', vol: 0.12, to: 60 });
    noise(0.2, { freq: 800, vol: 0.3 });
  },
  boom: () => {
    tone(120, 0.8, { type: 'sine', vol: 0.45, to: 30 });
    tone(240, 0.4, { type: 'sawtooth', vol: 0.08, to: 50 });
    noise(0.5, { freq: 400, vol: 0.4, sweep: 80 });
  },
  skip: () => {
    tone(440, 0.12, { type: 'square', vol: 0.1 });
    tone(330, 0.25, { type: 'square', vol: 0.1, at: 0.12 });
  },
  reverse: () => {
    noise(0.4, { freq: 400, vol: 0.2, sweep: 4000, q: 3 });
    tone(300, 0.4, { type: 'triangle', vol: 0.12, to: 900 });
  },
  magic: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.1, at: i * 0.06 })),
  stack: () => [300, 400, 500].forEach((f, i) => tone(f, 0.15, { type: 'sawtooth', vol: 0.08, at: i * 0.07 })),
  uno: () => {
    tone(784, 0.15, { type: 'square', vol: 0.12 });
    tone(1047, 0.35, { type: 'square', vol: 0.12, at: 0.12 });
  },
  buzz: () => tone(110, 0.5, { type: 'sawtooth', vol: 0.15 }),
  turn: () => tone(880, 0.15, { type: 'sine', vol: 0.12 }),
  win: () =>
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.15, at: i * 0.12 })),
  pop: () => tone(600, 0.08, { type: 'sine', vol: 0.15, to: 1200 }),
};
