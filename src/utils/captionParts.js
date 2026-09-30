/**
 * @file Long step descriptions as CAPTION PARTS, in step with the voice.
 *
 * WHY
 *   A caption card only has room for a few lines. Instead of cutting a long
 *   description with "…", it is shown in parts, one after another, each part
 *   while the voice says it. Every word of the description appears exactly
 *   once, in order, and parts are never cut inside a word.
 *
 * HOW PARTS ARE MADE (splitCaptionParts)
 *   A text that fits one card stays one part. Longer text is split at sentence
 *   ends; a sentence too long for one card at a comma / semicolon / dash,
 *   then between words. A very short last part is merged into the one before.
 *   The parts depend on the TEXT only (not on screen size), so the player, the
 *   AI voice and the downloaded video all use exactly the same parts.
 *
 * HOW PARTS STAY IN STEP WITH THE VOICE
 *   - AI voice: each part is spoken as its own clip (services/audio/tts,
 *     services/video/exportVideo), so the moment a part starts is exact.
 *   - Browser voice: each part is its own utterance; its start event switches
 *     the caption.
 *   - Recorded voice: the recording is one clip, so the switch points are
 *     estimated from how much text comes before each part, then moved to the
 *     nearest pause in the recording (recordingPartStarts).
 *   - No voice: each part stays up for its reading time (readingPartMs).
 */

/** Up to this many characters: one part (one card). */
const SINGLE_PART_CHARS = 230;
/** Target size of each part when the text is split. */
const PART_CHARS = 190;
/** A last part shorter than this is merged into the one before (if it fits). */
const MIN_LAST_PART_CHARS = 50;

const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();

/** Splits `piece` into chunks of at most `max` characters, at the best places. */
function splitLong(piece, max) {
  if (piece.length <= max) return [piece];
  // 1. After a comma, semicolon, colon or dash.
  const clauses = piece.split(/(?<=[,;:])\s+|\s+(?=[–—-]\s)/);
  if (clauses.length > 1) return pack(clauses, max, (c) => splitLong(c, max));
  // 2. Between words.
  return pack(piece.split(' '), max, (word) => [word]);
}

/** Greedily joins `items` (with spaces) into chunks of at most `max` characters. */
function pack(items, max, splitItem) {
  const chunks = [];
  let current = '';
  for (const item of items) {
    const joined = current ? `${current} ${item}` : item;
    if (joined.length <= max) {
      current = joined;
      continue;
    }
    if (current) chunks.push(current);
    if (item.length <= max) {
      current = item;
    } else {
      const pieces = splitItem(item);
      current = pieces.pop();
      chunks.push(...pieces);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * @param {string} text  a step's description
 * @returns {string[]}  its caption parts (one part for short text; [] for none).
 *   parts.join(' ') is the text with its spacing tidied.
 */
export function splitCaptionParts(text) {
  const clean = normalize(text);
  if (!clean) return [];
  if (clean.length <= SINGLE_PART_CHARS) return [clean];
  const sentences = clean.split(/(?<=[.!?।])\s+/);
  const parts = pack(sentences, PART_CHARS, (s) => splitLong(s, PART_CHARS));
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    const merged = `${parts[parts.length - 2]} ${last}`;
    if (last.length < MIN_LAST_PART_CHARS && merged.length <= SINGLE_PART_CHARS) {
      parts.splice(parts.length - 2, 2, merged);
    }
  }
  return parts;
}

/** How long a part stays up when there is no voice (reading time, ms). */
export function readingPartMs(part) {
  return Math.min(12000, Math.max(3500, part.length * 75));
}

/**
 * The part showing `ms` into the narration.
 * @param {number[]} starts  ms at which each part starts (starts[0] = 0 or the lead-in)
 */
export function partAt(starts, ms) {
  let part = 0;
  for (let k = 1; k < starts.length; k++) if (ms >= starts[k]) part = k;
  return part;
}

/** Where each part begins in the text, as a fraction 0–1 of all its characters. */
function partFractions(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0) || 1;
  let before = 0;
  return parts.map((p) => {
    const fraction = before / total;
    before += p.length;
    return fraction;
  });
}

/**
 * The part a spoken text has reached `offsetMs` into it (for seeking), using
 * the same speaking-speed estimate as the timeline (600 ms + 65 ms a character).
 */
export function partAtOffset(parts, offsetMs) {
  const chars = parts.reduce((sum, p) => sum + p.length, 0);
  const fraction = Math.min(1, Math.max(0, (offsetMs - 600) / (chars * 65 || 1)));
  const fractions = partFractions(parts);
  let part = 0;
  for (let k = 1; k < fractions.length; k++) if (fraction >= fractions[k]) part = k;
  return part;
}

const FRAME_SEC = 0.02; // 20 ms loudness frames
const MIN_PAUSE_SEC = 0.18;

/**
 * When each part starts in a RECORDED voice (seconds from the recording's
 * start). A part's share of the speaking time is its share of the text; each
 * switch point then moves to the nearest pause (silence between words or
 * sentences), so a part never changes in the middle of a word.
 * @param {Float32Array} samples  mono
 * @param {number} sampleRate
 * @param {string[]} parts
 * @returns {number[]}  starts[0] = 0
 */
export function recordingPartStarts(samples, sampleRate, parts) {
  const duration = samples.length / sampleRate;
  if (parts.length < 2 || !duration) return parts.map(() => 0);

  // Loudness per frame.
  const size = Math.max(1, Math.round(FRAME_SEC * sampleRate));
  const levels = [];
  for (let at = 0; at < samples.length; at += size) {
    let sum = 0;
    const end = Math.min(samples.length, at + size);
    for (let i = at; i < end; i++) sum += samples[i] * samples[i];
    levels.push(Math.sqrt(sum / (end - at)));
  }
  const sorted = [...levels].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)] || 0;
  const quiet = Math.max(0.004, loud * 0.12);
  const time = (frame) => frame * FRAME_SEC;

  // The speech itself (without silence before and after).
  let first = levels.findIndex((l) => l > quiet);
  let last = levels.length - 1 - [...levels].reverse().findIndex((l) => l > quiet);
  if (first < 0) {
    first = 0;
    last = levels.length - 1;
  }
  const speechStart = time(first);
  const speechEnd = time(last + 1);

  // Pauses inside the speech (their middles).
  const pauses = [];
  let runStart = -1;
  for (let f = first; f <= last + 1; f++) {
    const silent = f <= last && levels[f] <= quiet;
    if (silent && runStart < 0) runStart = f;
    if (!silent && runStart >= 0) {
      if (time(f - runStart) >= MIN_PAUSE_SEC) pauses.push(time((runStart + f) / 2));
      runStart = -1;
    }
  }

  const span = speechEnd - speechStart;
  const reach = Math.max(0.6, span * 0.15); // how far a switch point may move to a pause
  const starts = [0];
  partFractions(parts)
    .slice(1)
    .forEach((fraction) => {
      const estimate = speechStart + fraction * span;
      const previous = starts[starts.length - 1];
      let best = null;
      for (const p of pauses) {
        if (p <= previous || Math.abs(p - estimate) > reach) continue;
        if (best === null || Math.abs(p - estimate) < Math.abs(best - estimate)) best = p;
      }
      starts.push(Math.max(previous, best ?? estimate));
    });
  return starts;
}
