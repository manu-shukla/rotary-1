/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SoundProfile = 'audiophile' | 'watchmaker' | 'vault' | 'stepper';

class AudioHapticsEngine {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private hapticsEnabled: boolean = true;
  private currentProfile: SoundProfile = 'audiophile';
  private lastTickTime: number = 0;

  constructor() {
    // AudioContext will be initialized on first user gesture
  }

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public setHapticsEnabled(enabled: boolean) {
    this.hapticsEnabled = enabled;
  }

  public isHapticsEnabled(): boolean {
    return this.hapticsEnabled;
  }

  public setProfile(profile: SoundProfile) {
    this.currentProfile = profile;
  }

  public getProfile(): SoundProfile {
    return this.currentProfile;
  }

  /**
   * Fires a crisp mechanical detent tick sound using high-frequency transient synthesis
   */
  public playDetentTick(direction: 'cw' | 'ccw' = 'cw', velocity: number = 1) {
    // Trigger physical vibrator motor if supported
    if (this.hapticsEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        // Crisp 10ms micro-pulse
        navigator.vibrate(10);
      } catch {
        // Ignore vibration errors
      }
    }

    if (!this.soundEnabled) return;

    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Throttle slightly if too fast (< 15ms)
    if (now - this.lastTickTime < 0.015) {
      return;
    }
    this.lastTickTime = now;

    const masterGain = this.ctx.createGain();
    // Clamp velocity effect
    const volumeMultiplier = Math.min(1.4, Math.max(0.6, 0.7 + velocity * 0.1));
    masterGain.gain.setValueAtTime(0.28 * volumeMultiplier, now);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    masterGain.connect(this.ctx.destination);

    // Profile-specific mechanical timbre
    switch (this.currentProfile) {
      case 'watchmaker': {
        // High-pitched swiss watch ratchet pawl
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        const baseFreq = direction === 'cw' ? 3600 : 3300;
        const jitter = (Math.random() - 0.5) * 80;
        osc.frequency.setValueAtTime(baseFreq + jitter, now);
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.03);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(3200, now);
        filter.Q.setValueAtTime(8, now);

        osc.connect(filter);
        filter.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.035);
        break;
      }

      case 'vault': {
        // Heavy steel dial tumbler with dual metallic click
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(direction === 'cw' ? 440 : 400, now);
        osc1.frequency.exponentialRampToValueAtTime(120, now + 0.06);

        const osc2 = this.ctx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(1850 + (Math.random() - 0.5) * 50, now);
        osc2.frequency.exponentialRampToValueAtTime(800, now + 0.04);

        const gain2 = this.ctx.createGain();
        gain2.gain.setValueAtTime(0.3, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        osc1.connect(masterGain);
        osc2.connect(gain2);
        gain2.connect(masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.065);
        osc2.stop(now + 0.045);
        break;
      }

      case 'stepper': {
        // Crisp industrial stepper motor click
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(2400, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.025);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1200, now);

        osc.connect(filter);
        filter.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.025);
        break;
      }

      case 'audiophile':
      default: {
        // Precision machined brass rotary detent (damped body + tactile knock)
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        const baseFreq = direction === 'cw' ? 820 : 760;
        osc.frequency.setValueAtTime(baseFreq + (Math.random() - 0.5) * 30, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.04);

        // Transient click burst
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.012);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(2800, now);
        noiseFilter.Q.setValueAtTime(3, now);

        noise.connect(noiseFilter);
        noiseFilter.connect(masterGain);
        osc.connect(masterGain);

        noise.start(now);
        osc.start(now);
        osc.stop(now + 0.045);
        break;
      }
    }
  }

  /**
   * Sound played when phone touches NFC tag and couples to RF field
   */
  public playNfcConnectSound() {
    if (!this.soundEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.09); // C6

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.22);

    if (this.hapticsEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([15, 30, 20]);
      } catch {}
    }
  }

  /**
   * Sound played when phone is lifted away, breaking NFC field and writing back to EEPROM
   */
  public playNfcDisconnectAndWriteSound() {
    if (!this.soundEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.setValueAtTime(1174.66, now + 0.07); // D6
    osc.frequency.setValueAtTime(1760, now + 0.14); // A6

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.28);

    if (this.hapticsEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([25, 40, 15]);
      } catch {}
    }
  }

  /**
   * Sound played when vault unlocks
   */
  public playVaultUnlockSound() {
    if (!this.soundEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Heavy mechanical bolt sliding + positive chime
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(392, now); // G4
    osc.frequency.setValueAtTime(587.33, now + 0.12); // D5
    osc.frequency.setValueAtTime(783.99, now + 0.25); // G5
    osc.frequency.setValueAtTime(1174.66, now + 0.4); // D6

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.65);

    if (this.hapticsEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([50, 60, 50, 60, 100]);
      } catch {}
    }
  }
}

export const audioHaptics = new AudioHapticsEngine();
