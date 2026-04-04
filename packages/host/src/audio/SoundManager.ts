import { Howl } from 'howler';

type SoundName = 'tick' | 'correct' | 'wrong' | 'reveal' | 'victory' | 'join';

class SoundManagerImpl {
  private sounds = new Map<SoundName, Howl>();
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Generate simple tones using inline data URIs from Web Audio
    // This avoids needing external .mp3 files
    this.sounds.set(
      'tick',
      new Howl({ src: [this.generateToneDataUri(800, 0.08, 'sine')], volume: 0.3 })
    );
    this.sounds.set(
      'correct',
      new Howl({ src: [this.generateToneDataUri(880, 0.15, 'sine', 1200)], volume: 0.5 })
    );
    this.sounds.set(
      'wrong',
      new Howl({ src: [this.generateToneDataUri(300, 0.2, 'square')], volume: 0.3 })
    );
    this.sounds.set(
      'reveal',
      new Howl({ src: [this.generateToneDataUri(600, 0.25, 'sine', 900)], volume: 0.4 })
    );
    this.sounds.set(
      'victory',
      new Howl({ src: [this.generateToneDataUri(523, 0.5, 'sine', 784)], volume: 0.5 })
    );
    this.sounds.set(
      'join',
      new Howl({ src: [this.generateToneDataUri(1000, 0.1, 'sine')], volume: 0.3 })
    );
  }

  play(name: SoundName) {
    this.init();
    const sound = this.sounds.get(name);
    if (sound) sound.play();
  }

  private generateToneDataUri(
    freq: number,
    duration: number,
    type: OscillatorType,
    freqEnd?: number
  ): string {
    const sampleRate = 22050;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const progress = i / numSamples;
      const currentFreq = freqEnd ? freq + (freqEnd - freq) * progress : freq;
      const envelope = Math.min(1, (numSamples - i) / (sampleRate * 0.05)); // fade out
      let sample = 0;

      switch (type) {
        case 'sine':
          sample = Math.sin(2 * Math.PI * currentFreq * t);
          break;
        case 'square':
          sample = Math.sin(2 * Math.PI * currentFreq * t) > 0 ? 0.5 : -0.5;
          break;
        default:
          sample = Math.sin(2 * Math.PI * currentFreq * t);
      }

      buffer[i] = sample * envelope * 0.5;
    }

    // Encode as WAV
    const wavBuffer = this.encodeWav(buffer, sampleRate);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  private encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = samples.length * (bitsPerSample / 8);
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    return buffer;
  }
}

export const SoundManager = new SoundManagerImpl();
