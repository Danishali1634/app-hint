/**
 * @file Recorded voice → text, entirely in the browser (Whisper speech
 * recognition via @huggingface/transformers).
 *
 * WHY: some people record their voice only because talking is faster than
 * typing. "Convert to text" turns the recording into the step's description;
 * the recording is then removed and the AI voice reads the text instead.
 *
 * FIRST USE downloads the Whisper model once (~80 MB) and the browser caches
 * it. The audio never leaves the browser. The library is imported lazily.
 *
 * LANGUAGE: the text is written in English (Whisper translates Hindi/Hinglish
 * speech to English). Every voice — the browser's and the video's — can read it.
 */

const MODEL_ID = 'onnx-community/whisper-base';

let asrPromise = null;

/** Loads the model once and reuses it. */
function getRecognizer(onDownload) {
  if (!asrPromise) {
    asrPromise = import('@huggingface/transformers')
      .then(({ pipeline }) =>
        pipeline('automatic-speech-recognition', MODEL_ID, {
          progress_callback: (p) => {
            if (p.status === 'progress' && p.total) onDownload?.(p.loaded / p.total);
          },
        }),
      )
      .catch((error) => {
        asrPromise = null; // allow a retry (e.g. after reconnecting)
        throw error;
      });
  }
  return asrPromise;
}

/** Decodes any recording (webm/ogg/mp4) into 16 kHz mono samples for Whisper. */
async function toMono16k(blob) {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
    const a = buffer.getChannelData(0);
    const b = buffer.getChannelData(1);
    const mono = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) mono[i] = (a[i] + b[i]) / 2;
    return mono;
  } finally {
    ctx.close();
  }
}

/**
 * @param {Blob} blob  the recording
 * @param {(fraction: number) => void} [onDownload]  model download progress (first use)
 * @returns {Promise<string>} the spoken text
 */
export async function transcribeRecording(blob, onDownload) {
  const [recognize, samples] = await Promise.all([getRecognizer(onDownload), toMono16k(blob)]);
  const result = await recognize(samples, {
    language: 'english',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  return (Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text)
    .replace(/\s+/g, ' ')
    .trim();
}
