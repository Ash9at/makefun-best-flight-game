// audio.js — every sound is synthesised: no audio files, no samples.
//
// The engine is two detuned oscillators through a low-pass filter, the
// wind is a looped noise buffer through a band-pass, and the little
// chimes that mark gates, drops and landings are short sine envelopes.
// Nothing starts until the pilot touches a key, as browsers require.

export class Sound {
  constructor() {
    this.ctx = null;
    this.started = false;
  }

  // Build the graph on the first gesture; safe to call every frame.
  ensure() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Engine: saw + square, pitch follows the throttle and the revs.
    this.engOscA = ctx.createOscillator();
    this.engOscA.type = 'sawtooth';
    this.engOscB = ctx.createOscillator();
    this.engOscB.type = 'square';
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 420;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0.0;
    this.engOscA.connect(this.engFilter);
    this.engOscB.connect(this.engFilter);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.master);
    this.engOscA.start();
    this.engOscB.start();

    // Wind: filtered noise, louder and brighter the faster you fly.
    const len = ctx.sampleRate * 1.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = buf;
    this.windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.windSrc.start();
    this.started = true;
  }

  // Per-frame levels from the state of the plane.
  update(plane) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    if (!plane) {
      // Behind the menus there is no sortie: wind the engine and
      // the wind down to silence rather than freezing them at
      // whatever levels the last flight left behind.
      this.engGain.gain.setTargetAtTime(0, t, 0.15);
      this.windGain.gain.setTargetAtTime(0, t, 0.15);
      return;
    }
    // An empty tank is a dead engine, whatever the lever says: the
    // prop winds down to windmilling and only the wind is left.
    const lever = plane.fuel > 0 ? plane.throttle : 0;
    const rpm = plane.crashed ? 0 : 0.25 + lever * 0.75;
    const freq = 52 + rpm * 68 + plane.speed * 0.22;
    this.engOscA.frequency.setTargetAtTime(freq, t, 0.08);
    this.engOscB.frequency.setTargetAtTime(freq * 0.5 + 3, t, 0.08);
    this.engFilter.frequency.setTargetAtTime(300 + rpm * 700, t, 0.1);
    this.engGain.gain.setTargetAtTime(plane.crashed ? 0 : 0.05 + rpm * 0.075, t, 0.1);
    const wind = Math.min(0.16, Math.max(0, (plane.speed - 18) * 0.0022));
    this.windGain.gain.setTargetAtTime(plane.crashed || plane.onGround ? wind * 0.3 : wind, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(400 + plane.speed * 9, t, 0.2);
  }

  // A short sine blip with a soft envelope.
  blip(freq, dur = 0.16, gain = 0.16, when = 0) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  gate() { this.blip(880, 0.14, 0.15); this.blip(1318, 0.2, 0.13, 0.07); }
  drop() { this.blip(520, 0.12, 0.12); }
  scored() { this.blip(784, 0.14, 0.14); this.blip(1046, 0.22, 0.14, 0.09); }
  // The stall warning: a harsh low buzz, repeated while the wing is
  // stalled — the sound a pilot learns to fear before the sight.
  warn() {
    if (!this.started) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 196;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + 0.2);
  }
  thud() {
    if (!this.started) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.22);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.26);
    osc.connect(g); g.connect(this.master);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  }
  fanfare() {
    this.blip(659, 0.16, 0.15);
    this.blip(880, 0.16, 0.15, 0.13);
    this.blip(1108, 0.3, 0.16, 0.26);
  }
}
