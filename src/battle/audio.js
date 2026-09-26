/**
 * Web Audio 合成的音效与背景音乐，不加载任何音频文件。
 * 第一次用户操作后才创建音频上下文，遵守浏览器的自动播放限制；在那之前请求的音乐会记下来，解锁后再开始。
 *
 * 信号走向：各个声音 → 音效总线 / 音乐总线 → 总音量 → 输出。音乐总线另有一路短延迟回声，让合成器听起来不那么干。
 */

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const jitter = (amount = 0.03) => 1 + (Math.random() * 2 - 1) * amount;

/** 和弦：根音 MIDI 号 + 音程。 */
const chord = (root, intervals) => intervals.map((i) => root + i);
const MAJ = [0, 4, 7];
const MIN = [0, 3, 7];
const MAJ7 = [0, 4, 7, 11];
const MIN7 = [0, 3, 7, 10];
const DOM7B9 = [0, 4, 7, 10, 13];

export class Sfx {
  constructor() {
    this.enabled = true;
    this.musicEnabled = true;
    this.context = null;
    this.music = new Music(this);
  }

  unlock() {
    if (!this.enabled && !this.musicEnabled) return;
    try {
      if (!this.context) this.attach(new (window.AudioContext || window.webkitAudioContext)());
      if (this.context.state === "suspended") this.context.resume().catch(() => {});
      this.music.resume();
    } catch {
      this.enabled = false;
      this.musicEnabled = false;
    }
  }

  /** 把声音接到一个音频上下文上（实时播放用 AudioContext，分析和测试可以传 OfflineAudioContext）。 */
  attach(ctx) {
    this.context = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicEnabled ? 0.55 : 0;
    // 音乐整体压一点 5 kHz 以上的高频，听久了不刺耳。
    const soften = ctx.createBiquadFilter();
    soften.type = "highshelf";
    soften.frequency.value = 5000;
    soften.gain.value = -8;
    this.musicBus.connect(soften).connect(this.master);
    // 音乐的回声：短延迟 + 低通反馈。
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.23;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2200;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    soften.connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    damp.connect(wet).connect(this.master);
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return this;
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.unlock();
  }

  setMusic(on) {
    this.musicEnabled = on;
    if (on) this.unlock();
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.context.currentTime, 0.2);
  }

  // ——— 基础音色 ———

  /** 一个振荡器音符。bus 默认走音效总线；音乐的音符传入 musicBus。 */
  tone(freq, duration = 0.18, { delay = 0, at = null, volume = 0.05, type = "sine", slide = 0, attack = 0.008, bus = null, filter = 0, detune = 0 } = {}) {
    const ctx = this.context;
    if (!ctx) return;
    const out = bus ?? this.sfxBus;
    if (!bus && !this.enabled) return;
    const start = at ?? ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // 增益节点默认是 1：不先归零的话，起音的第一个采样会以满音量漏出来，听起来是一下尖锐的咔嗒声。
    gain.gain.value = 0;
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0005, start + duration);
    let node = osc;
    if (filter) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = filter;
      node = osc.connect(lp);
    }
    node.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  /** 滤波噪声：type 为 lowpass / highpass / bandpass；sweep 让滤波频率在时长内滑到另一个值。 */
  noise(duration = 0.2, { delay = 0, at = null, volume = 0.06, filter = 1200, type = "lowpass", sweep = 0, q = 1, bus = null, attack = 0.004 } = {}) {
    const ctx = this.context;
    if (!ctx) return;
    if (!bus && !this.enabled) return;
    const start = at ?? ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bq = ctx.createBiquadFilter();
    bq.type = type;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(filter, start);
    if (sweep) bq.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), start + duration);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0005, start + duration);
    src.connect(bq).connect(gain).connect(bus ?? this.sfxBus);
    src.start(start, Math.random() * 1.5, duration + 0.05);
  }

  /** 金属声：几组不成整数倍的分音一起衰减（盾、铁砧、护甲）。 */
  metal(base, duration = 0.5, { delay = 0, volume = 0.04 } = {}) {
    [1, 2.76, 5.4, 8.93].forEach((ratio, i) =>
      this.tone(base * ratio * jitter(0.01), duration / (1 + i * 0.6), { delay, volume: volume / (1 + i), type: "sine", attack: 0.002 }),
    );
  }

  // ——— 音效 ———

  play(event, amount = 1) {
    this.unlock();
    if (!this.enabled || !this.context) return;
    const j = jitter();
    switch (event) {
      case "step":
        // 棋子落在棋盘上：短促的木头声。
        this.tone(320 * j, 0.06, { type: "triangle", volume: 0.035, slide: -120 });
        this.noise(0.04, { volume: 0.025, filter: 2400, type: "bandpass", q: 2 });
        break;
      case "bump":
        this.tone(95 * j, 0.18, { type: "sine", volume: 0.08, slide: -40 });
        this.noise(0.08, { volume: 0.03, filter: 500 });
        break;
      case "slash":
      case "swing-light":
        this.noise(0.14, { volume: 0.07, filter: 5200, sweep: 1400, type: "bandpass", q: 1.4 });
        this.tone(880 * j, 0.08, { type: "triangle", volume: 0.018, slide: -300, delay: 0.02 });
        break;
      case "swing-heavy":
        this.noise(0.3, { volume: 0.09, filter: 2600, sweep: 300, type: "bandpass", q: 1 });
        this.tone(70, 0.35, { type: "sine", volume: 0.14, slide: -30, delay: 0.08 });
        this.noise(0.12, { volume: 0.06, filter: 400, delay: 0.08 });
        break;
      case "swing-skill":
        this.noise(0.22, { volume: 0.05, filter: 7000, sweep: 2500, type: "bandpass", q: 3 });
        [1318, 1760, 2349].forEach((f, i) => this.tone(f * j, 0.25, { delay: i * 0.04, volume: 0.02, type: "triangle" }));
        break;
      case "shatter":
        // 红心碎裂：几声玻璃般的短脆音，碎得越多越密。
        for (let i = 0; i < Math.min(amount, 8); i += 1) {
          this.tone((1200 + Math.random() * 900) * (1 + i * 0.05), 0.09, { delay: i * 0.03, volume: 0.028, type: "square", filter: 5000 });
          this.noise(0.05, { delay: i * 0.03, volume: 0.02, filter: 6000, type: "highpass" });
        }
        break;
      case "crack":
        // 护甲被打裂：金属声 + 一点碎屑。
        this.metal(620 * j, 0.35, { volume: 0.05 });
        this.noise(0.06, { volume: 0.03, filter: 4000, type: "highpass" });
        break;
      case "combo": {
        // 连击：音高随连击数往上走，越连越亮。
        const base = 72 + Math.min(amount, 8) * 2;
        [0, 4, 7, 12].forEach((iv, i) => this.tone(midi(base + iv), 0.22, { delay: i * 0.045, volume: 0.035, type: "triangle" }));
        break;
      }
      case "chase":
        // 追击：一个上扬的强音。
        [0, 7, 12, 19].forEach((iv, i) => this.tone(midi(62 + iv), 0.5, { delay: i * 0.03, volume: 0.035, type: "sawtooth", filter: 3000 }));
        this.noise(0.4, { volume: 0.04, filter: 800, sweep: 6000, type: "bandpass", q: 1 });
        break;
      case "combo-break":
        this.tone(440, 0.25, { type: "square", volume: 0.025, slide: -220, filter: 1800 });
        this.tone(466, 0.25, { type: "square", volume: 0.02, slide: -230, filter: 1800 });
        break;
      case "hurt":
        this.tone(160 * j, 0.32, { type: "sawtooth", volume: 0.05, slide: -90, filter: 1200 });
        this.tone(60, 0.25, { type: "sine", volume: 0.12, slide: -20 });
        this.noise(0.22, { volume: 0.05, filter: 700 });
        break;
      case "block":
        this.metal(380 * j, 0.6, { volume: 0.06 });
        this.noise(0.1, { volume: 0.05, filter: 3000, type: "bandpass" });
        break;
      case "shield":
        // 摆好防御架势：两声干净的上行音加一点金属。
        [392, 587].forEach((f, i) => this.tone(f, 0.18, { delay: i * 0.05, type: "triangle", volume: 0.04 }));
        this.metal(900, 0.25, { delay: 0.08, volume: 0.02 });
        break;
      case "heal":
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.45, { delay: i * 0.06, volume: 0.03 }));
        this.noise(0.5, { volume: 0.012, filter: 8000, type: "highpass" });
        break;
      case "pray":
        // 主教祷告：低沉的和声慢慢浮起来。
        chord(55, MIN).forEach((n) => this.tone(midi(n), 0.9, { volume: 0.025, type: "sawtooth", attack: 0.25, filter: 900, detune: Math.random() * 12 - 6 }));
        break;
      case "fortify":
        // 城堡筑墙：两下石头闷响。
        [0, 0.12].forEach((d) => {
          this.tone(90, 0.2, { delay: d, type: "sine", volume: 0.1, slide: -30 });
          this.noise(0.12, { delay: d, volume: 0.05, filter: 600 });
        });
        this.metal(300, 0.4, { delay: 0.24, volume: 0.02 });
        break;
      case "stun":
        this.metal(1400, 0.3, { volume: 0.04 });
        this.tone(660, 0.5, { type: "sine", volume: 0.03, slide: -300, delay: 0.05 });
        break;
      case "pickup":
        [659, 880, 1175].forEach((f, i) => this.tone(f, 0.25, { delay: i * 0.06, volume: 0.035, type: "triangle" }));
        break;
      case "chest":
        // 开宝箱：箱盖吱呀一声，然后是一串亮音。
        this.noise(0.25, { volume: 0.04, filter: 900, sweep: 1800, type: "bandpass", q: 6 });
        [392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, 0.45, { delay: 0.15 + i * 0.07, type: "triangle", volume: 0.04 }));
        break;
      case "anvil":
        // 铁砧落锤：一下厚重的金属敲击 + 火花。
        this.metal(220, 1.1, { volume: 0.08 });
        this.tone(55, 0.25, { type: "sine", volume: 0.1 });
        this.noise(0.3, { delay: 0.02, volume: 0.03, filter: 7000, type: "highpass" });
        [1568, 2093].forEach((f, i) => this.tone(f, 0.3, { delay: 0.25 + i * 0.08, volume: 0.02, type: "triangle" }));
        break;
      case "flip":
        // 铁砧重抽：翻牌的纸声。
        this.noise(0.08, { volume: 0.05, filter: 3000, sweep: 6000, type: "bandpass", q: 2 });
        this.noise(0.06, { delay: 0.18, volume: 0.04, filter: 5000, sweep: 2500, type: "bandpass", q: 2 });
        this.tone(988, 0.12, { delay: 0.2, volume: 0.02, type: "triangle" });
        break;
      case "page":
        // 说明卡弹出。
        this.noise(0.1, { volume: 0.03, filter: 2500, sweep: 5000, type: "bandpass", q: 1.5 });
        this.tone(784, 0.15, { delay: 0.04, volume: 0.02, type: "triangle" });
        break;
      case "door":
        this.noise(0.6, { volume: 0.03, filter: 500, sweep: 1200, type: "bandpass", q: 8 });
        this.tone(120, 0.5, { type: "sawtooth", volume: 0.025, slide: 50, filter: 800 });
        this.metal(260, 0.4, { delay: 0.45, volume: 0.03 });
        break;
      case "alert":
        this.tone(740, 0.1, { type: "square", volume: 0.03, filter: 3000 });
        this.tone(988, 0.14, { delay: 0.09, type: "square", volume: 0.03, filter: 3000 });
        break;
      case "battle":
        // 进入战斗：一声扫频 + 重拍。
        this.noise(0.45, { volume: 0.05, filter: 300, sweep: 5000, type: "bandpass", q: 1.2 });
        this.tone(55, 0.5, { delay: 0.35, type: "sine", volume: 0.14, slide: -15 });
        chord(57, MIN).forEach((n) => this.tone(midi(n), 0.5, { delay: 0.35, volume: 0.025, type: "sawtooth", filter: 1500 }));
        break;
      case "charge":
        this.tone(90, 0.8, { type: "sawtooth", volume: 0.035, slide: 220, filter: 900 });
        this.noise(0.8, { volume: 0.03, filter: 200, sweep: 2500, type: "bandpass", q: 3 });
        break;
      case "curse":
        [0, 6, 11].forEach((iv) => this.tone(midi(50 + iv), 0.7, { volume: 0.03, type: "square", filter: 1400, slide: -30 }));
        this.noise(0.3, { volume: 0.04, filter: 400 });
        break;
      case "victory":
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.45, { delay: i * 0.1, type: "triangle", volume: 0.05 }));
        chord(72, MAJ).forEach((n) => this.tone(midi(n), 0.9, { delay: 0.4, volume: 0.025, type: "sine" }));
        break;
      case "defeat":
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.6, { delay: i * 0.18, type: "triangle", volume: 0.05 }));
        this.tone(49, 1.4, { delay: 0.7, type: "sine", volume: 0.08 });
        break;
      case "win":
        [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.7, { delay: i * 0.1, volume: 0.045, type: "triangle" }));
        chord(60, MAJ7).forEach((n) => this.tone(midi(n), 1.4, { delay: 0.6, volume: 0.02, type: "sine", attack: 0.1 }));
        break;
      case "click":
        this.tone(1200 * j, 0.04, { type: "triangle", volume: 0.018 });
        break;
      case "invalid":
        this.tone(150, 0.14, { type: "square", volume: 0.028, filter: 900 });
        this.tone(142, 0.14, { type: "square", volume: 0.022, filter: 900, delay: 0.02 });
        break;
      default:
    }
  }
}

/* ——— 背景音乐 ———
 * 每首曲子是 4 小节循环，每小节 16 步。调度器用 Web Audio 的时钟提前约 0.15 秒排好音符，
 * setInterval 只负责“往前看”，所以节奏不受主线程卡顿影响。切歌时新旧两首交叉淡入淡出。 */

/** 乐器。t 为开始时间（音频时钟），bus 为这首曲子自己的增益节点。 */
export function instruments(sfx, bus) {
  return {
    bass: (n, t, len, vol = 0.08) => {
      sfx.tone(midi(n), len, { at: t, volume: vol, type: "triangle", bus, attack: 0.01, filter: 700 });
      sfx.tone(midi(n - 12), len, { at: t, volume: vol * 0.6, type: "sine", bus, attack: 0.01 });
    },
    pluck: (n, t, vol = 0.03) => sfx.tone(midi(n), 0.28, { at: t, volume: vol, type: "triangle", bus, attack: 0.004, filter: 3200 }),
    bell: (n, t, vol = 0.025) => {
      sfx.tone(midi(n), 1.2, { at: t, volume: vol, type: "sine", bus, attack: 0.004 });
      sfx.tone(midi(n + 12) * 1.003, 0.4, { at: t, volume: vol * 0.12, type: "sine", bus, attack: 0.004 });
    },
    pad: (notes, t, len, vol = 0.014, cutoff = 1100) =>
      notes.forEach((n) => [-7, 7].forEach((d) => sfx.tone(midi(n), len, { at: t, volume: vol, type: "sawtooth", bus, attack: len * 0.35, filter: cutoff, detune: d }))),
    organ: (notes, t, len, vol = 0.012) =>
      notes.forEach((n) => {
        sfx.tone(midi(n), len, { at: t, volume: vol, type: "square", bus, attack: 0.03, filter: 1600 });
        sfx.tone(midi(n + 12), len, { at: t, volume: vol * 0.5, type: "sine", bus, attack: 0.03 });
      }),
    lead: (n, t, len, vol = 0.028) => sfx.tone(midi(n), len, { at: t, volume: vol, type: "square", bus, attack: 0.02, filter: 1800 }),
    kick: (t, vol = 0.16) => sfx.tone(140, 0.18, { at: t, volume: vol, type: "sine", bus, slide: -100, attack: 0.002 }),
    snare: (t, vol = 0.05) => {
      sfx.noise(0.16, { at: t, volume: vol, filter: 1800, type: "bandpass", q: 0.8, bus });
      sfx.tone(190, 0.08, { at: t, volume: vol * 0.6, type: "triangle", bus, attack: 0.002 });
    },
    // 镲用带通噪声，只留 6 kHz 左右的“嚓”，不要最顶上的刺声。
    hat: (t, vol = 0.014) => sfx.noise(0.035, { at: t, volume: vol, filter: 6000, type: "bandpass", q: 0.9, bus }),
  };
}

/** 曲目：bpm、每小节的和弦（根音 + 音程），以及每一步要演奏什么。 */
export const TRACKS = {
  // 标题：舒缓的钟琴琶音，D 大调。
  title: {
    bpm: 76,
    chords: [chord(50, MAJ7), chord(47, MIN7), chord(43, MAJ7), chord(45, MAJ)],
    step(ins, s, bar, t, beat, c) {
      if (s === 0) ins.pad(c.map((n) => n + 12), t, beat * 4, 0.01, 900);
      if (s === 0) ins.bass(c[0] - 12, t, beat * 3.5, 0.05);
      if (s % 2 === 0) ins.bell(c[(s / 2) % c.length] + 12 + (s >= 8 ? 12 : 0), t, 0.016);
    },
  },
  // 棋盘探索：轻快的拨弦，C 大调。
  board: {
    bpm: 100,
    chords: [chord(48, MAJ), chord(45, MIN), chord(41, MAJ), chord(43, MAJ)],
    step(ins, s, bar, t, beat, c) {
      if (s % 4 === 0) ins.bass(c[0] - 12 + (s === 8 ? 7 : 0), t, beat * 0.9, 0.06);
      const arp = [0, 1, 2, 1, 2, 0, 1, 2];
      if (s % 2 === 0) ins.pluck(c[arp[(s / 2) % 8]] + 12 + (s % 8 === 6 ? 12 : 0), t, 0.024);
      if (s % 4 === 2) ins.hat(t, 0.01);
      if (bar % 2 === 1 && s === 12) ins.bell(c[2] + 12, t, 0.012);
    },
  },
  // 迷雾：更慢更暗，A 小调铺底，稀疏的钟声。
  fog: {
    bpm: 84,
    chords: [chord(45, MIN), chord(41, MAJ), chord(38, MIN), chord(40, MAJ)],
    step(ins, s, bar, t, beat, c) {
      if (s === 0) ins.pad(c.map((n) => n + 12), t, beat * 4.2, 0.012, 700);
      if (s === 0 || s === 10) ins.bass(c[0] - 12, t, beat * 2, 0.05);
      if (s === 0) ins.kick(t, 0.08);
      if ((s === 6 || s === 14) && Math.random() < 0.7) ins.bell(c[(s + bar) % 3] + 12, t, 0.014);
    },
  },
  // 普通战斗：推进感的八分低音 + 标准鼓组，A 小调。
  battle: {
    bpm: 132,
    chords: [chord(45, MIN), chord(45, MIN), chord(41, MAJ), chord(43, MAJ)],
    motif: [12, null, 15, null, 19, null, 17, 15, 12, null, 10, null, 12, null, null, null],
    step(ins, s, bar, t, beat, c) {
      if (s % 2 === 0) ins.bass(c[0] - 12 + (s % 4 === 2 ? 12 : 0), t, beat * 0.45, 0.06);
      if (s % 4 === 0) ins.kick(t);
      if (s === 4 || s === 12) ins.snare(t);
      if (s % 2 === 1) ins.hat(t);
      const m = this.motif[s];
      if (m !== null && bar % 2 === 1) ins.lead(57 + m, t, beat * 0.45, 0.02);
      if (s === 0) ins.pad(c.map((n) => n + 12), t, beat * 4, 0.008, 1400);
    },
  },
  // 精锐战斗：十六分低音、切分的和弦刺，D 小调。
  elite: {
    bpm: 140,
    chords: [chord(50, MIN), chord(46, MAJ), chord(43, MIN), chord(45, [0, 4, 7, 10])],
    step(ins, s, bar, t, beat, c) {
      ins.bass(c[0] - 12 + (s % 8 === 7 ? 12 : 0), t, beat * 0.22, 0.05);
      if ([0, 6, 10].includes(s)) ins.kick(t);
      if (s === 4 || s === 12) ins.snare(t, 0.06);
      if (bar === 3 && s >= 12) ins.snare(t, 0.04);
      if (s % 2 === 1) ins.hat(t, 0.012);
      if ([0, 3, 6, 10].includes(s)) ins.organ(c.map((n) => n + 12), t, beat * 0.3, 0.01);
      if (bar % 2 === 1 && s % 4 === 0) ins.lead(c[s % 3] + 12, t, beat * 0.9, 0.018);
    },
  },
  // 暗王：管风琴和弦 + 三全音低音脉冲，C 小调，最后一小节是属九。
  boss: {
    bpm: 150,
    chords: [chord(48, MIN), chord(44, MAJ), chord(41, MIN), chord(43, DOM7B9)],
    step(ins, s, bar, t, beat, c) {
      if (s === 0) ins.organ(c.map((n) => n + 12), t, beat * 3.8, 0.013);
      if (s === 8) ins.organ(c.map((n) => n + 12), t, beat * 1.8, 0.01);
      const bassNote = s % 8 === 6 ? c[0] - 6 : c[0] - 12;
      if (s % 2 === 0) ins.bass(bassNote, t, beat * 0.4, 0.07);
      if ([0, 3, 8, 11, 14].includes(s)) ins.kick(t, 0.18);
      if (s === 4 || s === 12) ins.snare(t, 0.07);
      if (s % 2 === 1) ins.hat(t, 0.016);
      if (bar >= 2 && [0, 2, 4].includes(s)) ins.lead(c[s / 2] + 12, t, beat * 0.45, 0.02);
      if (bar === 3 && s === 14) ins.pad([c[0] + 24, c[0] + 30], t, beat * 1.5, 0.012, 2000);
    },
  },
};

class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.want = null;
    this.current = null;
    this.timer = 0;
    document.addEventListener("visibilitychange", () => {
      if (!this.current) return;
      // 标签页在后台时，定时器会被降频，音符会乱，先把音乐静下来。
      const ctx = this.sfx.context;
      this.current.gain.gain.setTargetAtTime(document.hidden ? 0 : 1, ctx.currentTime, 0.2);
      if (!document.hidden) this.current.next = Math.max(this.current.next, ctx.currentTime + 0.1);
    });
  }

  /** 切换到某首曲子；同一首不会重新开始。null 表示淡出停止。 */
  play(name) {
    this.want = name;
    this.resume();
  }

  resume() {
    const ctx = this.sfx.context;
    if (!ctx || ctx.state !== "running" && ctx.state !== "suspended") return;
    if ((this.current?.name ?? null) === this.want) return;
    const old = this.current;
    if (old) {
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
      setTimeout(() => old.gain.disconnect(), 2000);
    }
    this.current = null;
    if (!this.want || !TRACKS[this.want]) return this.stopTimer();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setTargetAtTime(1, ctx.currentTime + 0.1, 0.5);
    gain.connect(this.sfx.musicBus);
    const track = TRACKS[this.want];
    this.current = { name: this.want, track, gain, ins: instruments(this.sfx, gain), step: 0, next: ctx.currentTime + 0.12 };
    if (!this.timer) this.timer = setInterval(() => this.tick(), 40);
  }

  stopTimer() {
    clearInterval(this.timer);
    this.timer = 0;
  }

  tick() {
    const cur = this.current;
    const ctx = this.sfx.context;
    if (!cur || !ctx || document.hidden) return;
    const beat = 60 / cur.track.bpm;
    const stepLen = beat / 4;
    while (cur.next < ctx.currentTime + 0.15) {
      const bar = Math.floor(cur.step / 16) % 4;
      const s = cur.step % 16;
      if (this.sfx.musicEnabled) cur.track.step(cur.ins, s, bar, cur.next, beat, cur.track.chords[bar]);
      cur.step += 1;
      cur.next += stepLen;
    }
  }
}
