/** Web Audio 合成音效：第一次用户操作后才创建音频上下文，遵守浏览器自动播放限制。 */
export class Sfx {
  constructor() {
    this.enabled = true;
    this.context = null;
  }

  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === "suspended") this.context.resume().catch(() => {});
    } catch {
      this.enabled = false;
    }
  }

  tone(freq, duration = 0.18, { delay = 0, volume = 0.05, type = "sine", slide = 0 } = {}) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  noise(duration = 0.2, { delay = 0, volume = 0.06, filter = 1200 } = {}) {
    if (!this.enabled || !this.context) return;
    const ctx = this.context;
    const now = ctx.currentTime + delay;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bq = ctx.createBiquadFilter();
    bq.type = "lowpass";
    bq.frequency.value = filter;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(bq).connect(gain).connect(ctx.destination);
    src.start(now);
  }

  play(event, amount = 1) {
    this.unlock();
    switch (event) {
      case "step":
        this.tone(220, 0.07, { type: "triangle", volume: 0.03 });
        this.noise(0.05, { volume: 0.02, filter: 800 });
        break;
      case "bump":
        this.tone(110, 0.14, { type: "triangle", volume: 0.05, slide: -40 });
        break;
      case "slash":
        this.noise(0.16, { volume: 0.07, filter: 3200 });
        this.tone(660, 0.12, { type: "sawtooth", volume: 0.02, slide: -400 });
        break;
      case "shatter":
        for (let i = 0; i < Math.min(amount, 6); i += 1)
          this.tone(900 + i * 140, 0.12, { delay: i * 0.035, volume: 0.03, type: "square" });
        break;
      case "hurt":
        this.tone(180, 0.3, { type: "sawtooth", volume: 0.05, slide: -90 });
        this.noise(0.2, { volume: 0.05, filter: 600 });
        break;
      case "block":
        this.tone(330, 0.2, { type: "square", volume: 0.035 });
        this.noise(0.12, { volume: 0.05, filter: 2500 });
        break;
      case "shield":
        [392, 523].forEach((f, i) => this.tone(f, 0.2, { delay: i * 0.06, type: "triangle", volume: 0.04 }));
        break;
      case "heal":
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.35, { delay: i * 0.07, volume: 0.04 }));
        break;
      case "pickup":
        [659, 880, 1175].forEach((f, i) => this.tone(f, 0.25, { delay: i * 0.06, volume: 0.04 }));
        break;
      case "chest":
        [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.4, { delay: i * 0.08, type: "triangle", volume: 0.05 }));
        break;
      case "door":
        this.tone(140, 0.5, { type: "sawtooth", volume: 0.03, slide: 60 });
        break;
      case "alert":
        this.tone(740, 0.1, { type: "square", volume: 0.03 });
        this.tone(988, 0.12, { delay: 0.09, type: "square", volume: 0.03 });
        break;
      case "battle":
        [196, 247, 294, 392].forEach((f, i) => this.tone(f, 0.25, { delay: i * 0.07, type: "sawtooth", volume: 0.025 }));
        break;
      case "charge":
        this.tone(120, 0.6, { type: "sawtooth", volume: 0.03, slide: 200 });
        break;
      case "curse":
        this.tone(300, 0.5, { type: "square", volume: 0.03, slide: -200 });
        break;
      case "victory":
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.45, { delay: i * 0.1, type: "triangle", volume: 0.05 }));
        break;
      case "defeat":
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.5, { delay: i * 0.16, type: "triangle", volume: 0.05 }));
        break;
      case "win":
        [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.7, { delay: i * 0.11, volume: 0.05 }));
        break;
      case "click":
        this.tone(880, 0.05, { type: "triangle", volume: 0.02 });
        break;
      case "invalid":
        this.tone(160, 0.12, { type: "square", volume: 0.03 });
        break;
      default:
    }
  }
}
