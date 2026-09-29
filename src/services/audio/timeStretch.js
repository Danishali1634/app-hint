/**
 * @file Changes the speed of speech WITHOUT changing its pitch (WSOLA).
 *
 * WHY: the AI voice follows the speed chosen in Settings (0.8×–1.2×).
 * Simply playing audio faster/slower also makes the voice higher/lower
 * ("chipmunk"), so instead short overlapping windows of the audio are
 * re-spaced in time; each window is shifted slightly (±10 ms) to where it
 * lines up best with the previous one, so the joins are smooth.
 *
 * Used by: services/audio/neuralVoice.js (aiVoiceWav — player and video alike)
 */

const WINDOW_S = 0.03; // 30 ms windows (~ a few pitch periods of a voice)
const SEEK_S = 0.01; // search ±10 ms for the best join
const COMPARE_STRIDE = 8; // compare every 8th sample (plenty for speech, much faster)

/**
 * @param {Float32Array} input   mono samples
 * @param {number} sampleRate
 * @param {number} rate          >1 faster (shorter), <1 slower (longer)
 * @returns {Float32Array}
 */
export function timeStretch(input, sampleRate, rate) {
  if (!(rate > 0) || Math.abs(rate - 1) < 0.01) return input;
  const win = Math.max(16, Math.round(sampleRate * WINDOW_S));
  const hop = win >> 1; // output hop (50% overlap)
  const seek = Math.round(sampleRate * SEEK_S);
  const outLength = Math.round(input.length / rate);
  if (input.length < win * 2) return input;

  const window = new Float32Array(win);
  for (let j = 0; j < win; j++) window[j] = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / (win - 1));

  const out = new Float32Array(outLength + win);
  const weight = new Float32Array(outLength + win);
  let prev = 0; // input position of the previous window

  for (let outPos = 0; outPos < outLength; outPos += hop) {
    const nominal = Math.min(input.length - win, Math.round(outPos * rate));
    let best = nominal;
    // Where the previous window would naturally continue.
    const natural = prev + hop;
    if (outPos > 0 && natural + win <= input.length) {
      let bestScore = -Infinity;
      const from = Math.max(0, nominal - seek);
      const to = Math.min(input.length - win, nominal + seek);
      for (let p = from; p <= to; p++) {
        let score = 0;
        for (let j = 0; j < win; j += COMPARE_STRIDE) score += input[p + j] * input[natural + j];
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
    }
    for (let j = 0; j < win; j++) {
      out[outPos + j] += input[best + j] * window[j];
      weight[outPos + j] += window[j];
    }
    prev = best;
  }

  const result = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) result[i] = weight[i] > 1e-3 ? out[i] / weight[i] : out[i];
  return result;
}
