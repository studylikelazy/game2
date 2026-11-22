// 効果音はWebAudioで合成（外部アセット不要・軽量）。
let ctx = null;
let enabled = true;

function ensure() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function blip({ freq = 440, dur = 0.08, type = 'sine', gain = 0.05, slide = 0 } = {}) {
  if (!enabled) return;
  const audio = ensure();
  if (!audio) return;
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audio.currentTime);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), audio.currentTime + dur);
  g.gain.setValueAtTime(gain, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
  osc.connect(g).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + dur + 0.02);
}

export const sfx = {
  toggle() { enabled = !enabled; return enabled; },
  get enabled() { return enabled; },
  click() { blip({ freq: 520, dur: 0.05, type: 'triangle', gain: 0.03 }); },
  hit() { blip({ freq: 180, dur: 0.1, type: 'sawtooth', gain: 0.045, slide: -90 }); },
  heal() { blip({ freq: 520, dur: 0.16, type: 'sine', gain: 0.04, slide: 260 }); },
  block() { blip({ freq: 300, dur: 0.09, type: 'square', gain: 0.025 }); },
  deny() { blip({ freq: 150, dur: 0.09, type: 'square', gain: 0.03 }); },
  reward() { [0, 90, 180].forEach((t, i) => setTimeout(() => blip({ freq: [660, 880, 1180][i], dur: 0.12, type: 'sine', gain: 0.035 }), t)); },
  victory() { [0, 130, 260, 420].forEach((t, i) => setTimeout(() => blip({ freq: [523, 659, 784, 1046][i], dur: 0.24, type: 'triangle', gain: 0.05 }), t)); },
  defeat() { [0, 160, 340].forEach((t, i) => setTimeout(() => blip({ freq: [330, 262, 196][i], dur: 0.3, type: 'sine', gain: 0.05 }), t)); },
};
