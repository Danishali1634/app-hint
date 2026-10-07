/**
 * @file Piper voices that @diffusionstudio/vits-web's built-in list doesn't
 * have (it has no Hindi), added to its PATH_MAP so `predict({ voiceId })`
 * can load them like any other voice.
 *
 * WHERE THEY COME FROM: vits-web fetches `${HF_BASE}/${path}`, and HF_BASE is
 * its own mirror (huggingface.co/diffusionstudio/piper-voices/resolve/main),
 * which has no Hindi files. The paths below climb out of that mirror with
 * "../" (four levels = the site root) into the upstream rhasspy/piper-voices
 * repo, which has them. The browser resolves the "../" before fetching, and
 * vits-web caches each file in OPFS by its file name, as for its own voices.
 *
 * Must run in every context that calls predict(): the Web Worker
 * (neuralVoice.worker.js) and the main-thread fallback (neuralVoice.js).
 */

const UPSTREAM = '../../../../rhasspy/piper-voices/resolve/main';

/** Piper voice id → model path, relative to vits-web's HF_BASE. */
export const EXTRA_VOICE_PATHS = {
  'hi_IN-rohan-medium': `${UPSTREAM}/hi/hi_IN/rohan/medium/hi_IN-rohan-medium.onnx`,
  'hi_IN-pratham-medium': `${UPSTREAM}/hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx`,
  'hi_IN-priyamvada-medium': `${UPSTREAM}/hi/hi_IN/priyamvada/medium/hi_IN-priyamvada-medium.onnx`,
};

let configsPatched = false;

/**
 * Newer upstream voice configs (.onnx.json) have no `speaker_id_map`, and
 * vits-web reads it unconditionally (`Object.keys(config.speaker_id_map)`),
 * failing with "Cannot convert undefined or null to object". This wraps
 * fetch so ONLY those config files get an empty map added on download;
 * every other request is untouched. vits-web then caches the fixed file.
 */
function patchUpstreamConfigs() {
  if (configsPatched) return;
  configsPatched = true;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const response = await original(input, init);
    const url = typeof input === 'string' ? input : (input?.url ?? '');
    if (!response.ok || !url.includes('/rhasspy/piper-voices/') || !url.endsWith('.onnx.json')) {
      return response;
    }
    const config = await response.json();
    config.speaker_id_map ??= {};
    return new Response(JSON.stringify(config), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

/** @param {{ PATH_MAP: Record<string, string> }} tts  the imported vits-web module */
export function registerExtraVoices(tts) {
  Object.assign(tts.PATH_MAP, EXTRA_VOICE_PATHS);
  patchUpstreamConfigs();
}
