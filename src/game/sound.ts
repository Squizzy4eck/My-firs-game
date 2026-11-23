class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private isEngineRunning: boolean = false;

  private hornOscA: OscillatorNode | null = null;
  private hornOscB: OscillatorNode | null = null;
  private hornGain: GainNode | null = null;
  private isHornPlaying: boolean = false;

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stopEngine();
      this.stopHorn();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public startEngine() {
    if (this.muted || this.isEngineRunning) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(52, ctx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(195, ctx.currentTime);

      gain.gain.setValueAtTime(0.024, ctx.currentTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      this.engineOsc = osc;
      this.engineGain = gain;
      this.isEngineRunning = true;
    } catch {
      // Ignore audio errors
    }
  }

  public updateEngine(speedKmh: number, isNitroActive: boolean, gear: number = 3) {
    if (this.muted || !this.isEngineRunning || !this.ctx || !this.engineOsc || !this.engineGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const normalized = Math.max(0, Math.min(1, (speedKmh - 60) / 210));
    const gearOffset = (6 - Math.max(1, Math.min(6, gear))) * 4.5;
    const targetFreq = 46 + normalized * 68 + gearOffset + (isNitroActive ? 26 : 0);
    const targetGain = 0.018 + normalized * 0.022 + (isNitroActive ? 0.016 : 0);

    this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.08);
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.08);
  }

  public stopEngine() {
    if (!this.isEngineRunning) return;
    try {
      if (this.engineOsc) {
        this.engineOsc.stop();
        this.engineOsc.disconnect();
      }
      if (this.engineGain) {
        this.engineGain.disconnect();
      }
    } catch {
      // Ignore cleanup errors
    }
    this.engineOsc = null;
    this.engineGain = null;
    this.isEngineRunning = false;
  }

  // Dual-tone realistic car horn (H key)
  public startHorn() {
    if (this.muted || this.isHornPlaying) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      // Classic automotive dual-tone major third (~415 Hz + ~523 Hz)
      oscA.type = 'sawtooth';
      oscA.frequency.setValueAtTime(415, now);

      oscB.type = 'sawtooth';
      oscB.frequency.setValueAtTime(523.25, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.11, now + 0.025);

      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      oscA.start(now);
      oscB.start(now);

      this.hornOscA = oscA;
      this.hornOscB = oscB;
      this.hornGain = gain;
      this.isHornPlaying = true;
    } catch {
      // Ignore horn error
    }
  }

  public stopHorn() {
    if (!this.isHornPlaying) return;
    const ctx = this.ctx;
    try {
      if (ctx && this.hornGain) {
        const now = ctx.currentTime;
        this.hornGain.gain.cancelScheduledValues(now);
        this.hornGain.gain.setValueAtTime(this.hornGain.gain.value, now);
        this.hornGain.gain.linearRampToValueAtTime(0.0001, now + 0.045);
      }
      const oscA = this.hornOscA;
      const oscB = this.hornOscB;
      const gain = this.hornGain;
      window.setTimeout(() => {
        try {
          oscA?.stop();
          oscA?.disconnect();
          oscB?.stop();
          oscB?.disconnect();
          gain?.disconnect();
        } catch {
          // Ignore
        }
      }, 55);
    } catch {
      // Ignore
    }
    this.hornOscA = null;
    this.hornOscB = null;
    this.hornGain = null;
    this.isHornPlaying = false;
  }

  public playCameraSwitch() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.05);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playLaneShift() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.07);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  public playGearShift(isUpshift: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Two crisp mechanical gate notches (~160ms apart during hand shift)
    const times = [now + 0.14, now + 0.27];
    times.forEach((t, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const baseFreq = idx === 0 ? 155 : isUpshift ? 235 : 185;
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.55, t + 0.045);

      gain.gain.setValueAtTime(idx === 0 ? 0.032 : 0.048, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.055);
    });
  }

  public playNearMiss() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playPickup() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [587.33, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.065;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.07, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.13);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.14);
    });
  }

  public playCrash() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.25);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);

    const bufferSize = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.14, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
  }
}

export const soundEngine = new SoundEngine();
