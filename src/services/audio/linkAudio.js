/**
 * @file Shrinks a voice recording for SHARE LINKS only (the course itself
 * keeps the original).
 *
 * Links carry every recording inside the URL, so bytes matter: a 32 kbps
 * recording adds ~5,400 characters per second. Here it is re-encoded as
 * Opus, mono, 16 kbps (WebCodecs AudioEncoder, faster than real time) in an
 * MP4 container (mp4-muxer) — clear speech, ~45% fewer bytes.
 *   - not WebM: webm-muxer reserves 8 KB of padding per file, more than a short
 *     clip saves; MP4 adds ~1 KB.
 *   - not AAC: the macOS encoder can't go below ~48 kbps, so it would be bigger.
 * A browser that can't play Opus-in-MP4 falls back to the AI voice reading the
 * step's text (hooks/useNarration).
 *
 * Returns the original when the browser can't encode Opus, when decoding
 * fails, or when the result wouldn't be smaller.
 */

import { blobToDataUrl } from '@/utils';

const SAMPLE_RATE = 48_000;
const LINK_VOICE_CONFIG = {
  codec: 'opus',
  sampleRate: SAMPLE_RATE,
  numberOfChannels: 1,
  bitrate: 16_000,
};

/**
 * @param {string} dataUrl  data: URL of a recording
 * @returns {Promise<string>} a smaller data: URL (audio/mp4), or the original
 */
export async function compressVoiceForLink(dataUrl) {
  try {
    if (typeof AudioEncoder === 'undefined' || typeof OfflineAudioContext === 'undefined') {
      return dataUrl;
    }
    if (!(await AudioEncoder.isConfigSupported(LINK_VOICE_CONFIG)).supported) return dataUrl;

    // Decode and mix down to mono 48 kHz.
    const bytes = await (await fetch(dataUrl)).arrayBuffer();
    const decoded = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(bytes);
    const length = Math.ceil(decoded.duration * SAMPLE_RATE);
    if (!length) return dataUrl;
    const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const mono = (await offline.startRendering()).getChannelData(0);

    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      audio: { codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: 1 },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let failure = null;
    const encoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => (failure = e),
    });
    encoder.configure(LINK_VOICE_CONFIG);
    const block = SAMPLE_RATE / 10; // 100 ms per AudioData
    for (let offset = 0; offset < mono.length; offset += block) {
      const data = mono.subarray(offset, Math.min(mono.length, offset + block));
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: SAMPLE_RATE,
        numberOfFrames: data.length,
        numberOfChannels: 1,
        timestamp: Math.round((offset / SAMPLE_RATE) * 1e6),
        data,
      });
      encoder.encode(audioData);
      audioData.close();
    }
    await encoder.flush();
    encoder.close();
    if (failure) return dataUrl;
    muxer.finalize();

    const smaller = await blobToDataUrl(new Blob([target.buffer], { type: 'audio/mp4' }));
    return smaller.length < dataUrl.length ? smaller : dataUrl;
  } catch {
    return dataUrl;
  }
}
