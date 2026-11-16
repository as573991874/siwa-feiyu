// 纯 WebAudio 合成的小音效，不依赖任何素材
let ctx = null;
export const sound = { on: true };
function ac() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; }
function noise(dur) { const c = ac(), b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; return s; }
/** 撕裂声：带通噪声，频率由高滑到低，带一点颗粒感 */
export function rip(power = 1) {
  if (!sound.on) return; const c = ac(), t = c.currentTime, dur = 0.22 + 0.2 * power;
  const n = noise(dur), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
  f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(900, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * power, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lfo.type = 'square'; lfo.frequency.value = 70; lg.gain.value = 0.25; lfo.connect(lg).connect(g.gain);
  n.connect(f).connect(g).connect(c.destination); n.start(t); lfo.start(t); n.stop(t + dur); lfo.stop(t + dur);
}
export function tone(freq, dur = 0.12, type = 'sine', vol = 0.18, when = 0) {
  if (!sound.on) return; const c = ac(), t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur);
}
export const snap = () => { tone(520, 0.06, 'triangle', 0.12); tone(260, 0.09, 'sine', 0.1, 0.02); };
export const tick = () => tone(880, 0.05, 'square', 0.06);
export const win = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, i * 0.11));
export const lose = () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.08, i * 0.16));
