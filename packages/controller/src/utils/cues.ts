import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Felt + heard feedback (redizajn 4i). One table maps each event to a
 * vibration pattern and an optional short synthesized sound — no audio
 * assets, the WebAudio oscillator is enough for clicks and tones.
 *
 * Vibration is on by default, sound off (the TV is the loud device). Both are
 * per-device toggles in the ⋯ / player menu. iPhone Safari has no web
 * vibration, so iOS players get the visuals (and sound, if enabled) only.
 */

interface CueSettings {
  vibration: boolean;
  sound: boolean;
  setVibration: (on: boolean) => void;
  setSound: (on: boolean) => void;
}

export const useCueSettings = create<CueSettings>()(
  persist(
    (set) => ({
      vibration: true,
      sound: false,
      setVibration: (vibration) => set({ vibration }),
      setSound: (sound) => set({ sound }),
    }),
    { name: 'igra-cues' }
  )
);

export type CueEvent =
  | 'round' // novo pitanje / runda
  | 'tick' // poslednjih 5 s, jednom u sekundi
  | 'sent' // odgovor poslat
  | 'correct'
  | 'wrong' // netačno / isteklo
  | 'turn' // tvoj je red
  | 'knock' // neko kuca (domaćin)
  | 'reconnected';

/** [frequency Hz, duration ms] pairs played back to back. */
type Tone = readonly (readonly [number, number])[];

const CUES: Record<CueEvent, { vib: number | readonly number[]; tone?: Tone }> = {
  round: { vib: 20, tone: [[1400, 25]] },
  tick: { vib: 10, tone: [[1000, 30]] },
  sent: { vib: 15 },
  correct: { vib: [30, 60, 30], tone: [[660, 110], [880, 160]] },
  wrong: { vib: 120, tone: [[220, 280]] },
  turn: { vib: [40, 80, 40, 80, 40], tone: [[880, 140], [1320, 260]] },
  knock: { vib: [60, 100, 60], tone: [[180, 60], [0, 90], [180, 60]] },
  reconnected: { vib: 20 },
};

export function vibrate(pattern: number | readonly number[]): void {
  if (!useCueSettings.getState().vibration) return;
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern as VibratePattern);
  }
}

let ctx: AudioContext | null = null;

function play(tone: Tone): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    // Unlocked by the toggle tap; later calls just resume it if suspended.
    if (ctx.state === 'suspended') void ctx.resume();
    let at = ctx.currentTime + 0.01;
    for (const [freq, ms] of tone) {
      const dur = ms / 1000;
      if (freq > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.18, at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + dur + 0.02);
      }
      at += dur;
    }
  } catch {
    // Audio is a nicety — never let it break a tap.
  }
}

export function cue(event: CueEvent): void {
  const c = CUES[event];
  vibrate(c.vib);
  if (c.tone && useCueSettings.getState().sound) play(c.tone);
}

/** Call from the sound toggle's tap so iOS unlocks the audio context. */
export function previewSound(): void {
  play([[880, 90]]);
}
