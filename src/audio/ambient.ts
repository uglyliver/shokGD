// Procedural ambient audio for the gali. No binary assets — everything is
// synthesized via Web Audio nodes. Three layers:
//   1. A pink-noise traffic/chatter bed (low-passed, slowly modulated).
//   2. Periodic honks — randomized pitch and envelope so they don't loop-read.
//   3. Occasional temple bell hits in the distance.
//
// The AudioContext can only start after a user gesture. start() is called
// from the "click to enter" handler.

export interface Ambient {
  start(): void;
  stop(): void;
}

export function initAmbientAudio(): Ambient {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let bedNode: AudioBufferSourceNode | null = null;
  let honkTimer: number | null = null;
  let bellTimer: number | null = null;
  let stopped = false;

  const makePinkNoiseBuffer = (c: AudioContext, seconds = 4): AudioBuffer => {
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    // Paul Kellet's pink noise approximation.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buf;
  };

  const startBed = () => {
    if (!ctx || !masterGain) return;
    const buf = makePinkNoiseBuffer(ctx, 4);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    // Low-pass to sit it behind honks; gentle filter sweep for life.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();

    const g = ctx.createGain();
    g.gain.value = 0.18;
    src.connect(lp).connect(g).connect(masterGain);
    src.start();
    bedNode = src;
  };

  const scheduleHonk = () => {
    if (stopped || !ctx || !masterGain) return;
    const delay = 400 + Math.random() * 2200; // ms between honks
    honkTimer = window.setTimeout(() => {
      playHonk();
      scheduleHonk();
    }, delay);
  };

  const playHonk = () => {
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;
    const dur = 0.28 + Math.random() * 0.45;
    const freq = 180 + Math.random() * 180;

    // A square + slight detuned saw, then bandpass — classic small-vehicle
    // horn character.
    const osc1 = ctx.createOscillator();
    osc1.type = "square";
    osc1.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.value = freq * 1.01;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq * 3;
    bp.Q.value = 2.5;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.35 + Math.random() * 0.25, now + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, now + dur);

    // Slight stereo placement for depth.
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;

    osc1.connect(bp);
    osc2.connect(bp);
    bp.connect(env).connect(pan).connect(masterGain);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + dur + 0.05);
    osc2.stop(now + dur + 0.05);
  };

  const scheduleBell = () => {
    if (stopped || !ctx || !masterGain) return;
    const delay = 8000 + Math.random() * 15000;
    bellTimer = window.setTimeout(() => {
      playBell();
      scheduleBell();
    }, delay);
  };

  const playBell = () => {
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;
    // A metallic ping — two sines at inharmonic ratio with long decay.
    const base = 520 + Math.random() * 80;
    for (const ratio of [1, 2.76, 5.4]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base * ratio;
      const g = ctx.createGain();
      const peak = 0.08 / ratio;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(peak, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
      const pan = ctx.createStereoPanner();
      pan.pan.value = -0.6; // off to the side, "distant"
      o.connect(g).connect(pan).connect(masterGain);
      o.start(now);
      o.stop(now + 3.0);
    }
  };

  return {
    start() {
      if (ctx) return;
      stopped = false;
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.7;
      masterGain.connect(ctx.destination);
      startBed();
      scheduleHonk();
      scheduleBell();
    },
    stop() {
      stopped = true;
      if (honkTimer !== null) clearTimeout(honkTimer);
      if (bellTimer !== null) clearTimeout(bellTimer);
      try {
        bedNode?.stop();
      } catch {
        /* already stopped */
      }
      ctx?.close();
      ctx = null;
      masterGain = null;
    },
  };
}
