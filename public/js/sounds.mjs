/**
 * Tones are synthesised rather than shipped as audio files: it keeps the
 * repository free of binary assets and of anyone else's recordings.
 */
let context = null;

function audio() {
  if (context === null) context = new (window.AudioContext ?? window.webkitAudioContext)();
  if (context.state === 'suspended') context.resume();
  return context;
}

function tone(ctx, { freq, start, duration, type = 'sine', gain = 0.09 }) {
  const osc = ctx.createOscillator();
  const envelope = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  envelope.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  envelope.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(envelope).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.02);
}

/** Two rising notes, played when a message arrives. */
export function playMessage() {
  try {
    const ctx = audio();
    tone(ctx, { freq: 784, start: 0, duration: 0.12 });
    tone(ctx, { freq: 1047, start: 0.1, duration: 0.18 });
  } catch {
    /* audio is a nicety; a browser that blocks it must not break the page */
  }
}

/** A low thud, played alongside the window shake. */
export function playNudge() {
  try {
    const ctx = audio();
    tone(ctx, { freq: 180, start: 0, duration: 0.22, type: 'square', gain: 0.12 });
    tone(ctx, { freq: 120, start: 0.12, duration: 0.26, type: 'square', gain: 0.1 });
  } catch {
    /* see playMessage */
  }
}
