/** 浏览器原生合成器：首次用户操作后才创建音频上下文，遵守自动播放限制。 */
export class GameAudio {
  constructor() {
    this.enabled = true;
    this.context = null;
  }

  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === "suspended")
        this.context.resume().catch(() => {});
    } catch {
      this.enabled = false;
    }
  }

  tone(frequency, duration = 0.18, delay = 0, volume = 0.045, type = "sine") {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  play(event) {
    this.unlock();
    if (event === "step") this.tone(165, 0.055, 0, 0.014, "triangle");
    if (event === "push") this.tone(100, 0.12, 0, 0.03, "triangle");
    if (event === "collect")
      [659, 880, 1318].forEach((note, index) =>
        this.tone(note, 0.3, index * 0.065),
      );
    if (event === "interact")
      [392, 523].forEach((note, index) => this.tone(note, 0.25, index * 0.09));
    if (event === "wrong") this.tone(196, 0.28, 0, 0.035, "triangle");
    if (event === "win")
      [523, 659, 784, 1046, 1318].forEach((note, index) =>
        this.tone(note, 0.6, index * 0.11),
      );
  }

  note(index) {
    this.unlock();
    this.tone([523, 784, 659, 880][index], 0.6, 0, 0.065, "triangle");
  }
}
