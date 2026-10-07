/**
 * @file Runs the Piper neural voice in a Web Worker (see neuralVoice.js), so
 * speaking a step never freezes the page or the walkthrough animations.
 *
 * Message in:  { id, text, voiceId }
 * Messages out: { id, progress }          model download progress 0–1 (first use)
 *               { id, blob }              audio/wav
 *               { id, error }             message
 */

import { registerExtraVoices } from './extraVoices';

self.onmessage = async ({ data }) => {
  const { id, text, voiceId } = data;
  try {
    const tts = await import('@diffusionstudio/vits-web');
    registerExtraVoices(tts);
    const blob = await tts.predict({ text, voiceId }, (progress) => {
      self.postMessage({ id, progress: progress.total ? progress.loaded / progress.total : null });
    });
    self.postMessage({ id, blob });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
