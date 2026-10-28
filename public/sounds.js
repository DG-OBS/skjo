// Bruitages de robot fabriqués en direct avec la Web Audio API (aucun fichier son).
const Sound = (() => {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('roboskyjo-muted') === '1'; } catch (e) { /* rien */ }

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = 'square', vol = 0.06, when = 0, slide = null } = {}) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    const t = a.currentTime + when;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const S = {
    click() { tone(520, 0.05, { vol: 0.04 }); },
    flip() { tone(660, 0.06); tone(990, 0.06, { when: 0.05, vol: 0.05 }); },
    draw() { tone(300, 0.18, { type: 'sine', slide: 900, vol: 0.08 }); },
    swap() { tone(180, 0.09, { type: 'triangle', vol: 0.12 }); tone(420, 0.08, { type: 'triangle', when: 0.08, vol: 0.08 }); },
    toss() { tone(700, 0.15, { type: 'sine', slide: 200, vol: 0.07 }); },
    laser() {
      tone(1800, 0.35, { type: 'sawtooth', slide: 90, vol: 0.06 });
      tone(1200, 0.3, { type: 'square', slide: 60, vol: 0.04, when: 0.12 });
    },
    ding() { tone(880, 0.12, { type: 'sine', vol: 0.1 }); tone(1320, 0.2, { type: 'sine', vol: 0.08, when: 0.1 }); },
    alarm() { for (let i = 0; i < 4; i++) tone(i % 2 ? 520 : 760, 0.14, { when: i * 0.15, vol: 0.05 }); },
    fail() {
      [392, 370, 349, 262].forEach((f, i) => tone(f, i === 3 ? 0.6 : 0.25, { type: 'triangle', vol: 0.12, when: i * 0.26, slide: i === 3 ? 200 : null }));
    },
    win() {
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'square', vol: 0.06, when: i * 0.13 }));
    },
    bip() {
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) tone(400 + Math.random() * 900, 0.06, { when: i * 0.07, vol: 0.04 });
    },
    error() { tone(160, 0.2, { type: 'sawtooth', vol: 0.05 }); },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('roboskyjo-muted', muted ? '1' : '0'); } catch (e) { /* rien */ }
      if (!muted) S.ding();
      return muted;
    },
    unlock() { if (!muted) audio(); },
  };
  return S;
})();
