/**
 * @file Settings: the AI voice (which voice, how fast) and the optional
 * Anthropic API key used by "Improve with AI".
 *
 * VOICE: the AI voices (services/audio/neuralVoice AI_VOICES) — the SAME voice
 * is used by the walkthrough and the downloaded video. English and Hindi voices
 * are listed in two groups; the user picks one (Hindi is never chosen
 * automatically). Hindi voices show their licence: non-commercial.
 *
 * TEST: every AI voice has a "Test" button that speaks the editable test
 * sentence at the draft speed, so voices can be compared before choosing.
 * Testing does NOT select a voice. It plays the AI voice itself (aiVoiceUrl),
 * never the browser fallback, and shows the one-time download (about 60 MB)
 * as a percentage. Under the Hindi voices: the sentence as they will read it,
 * updated as you type (unfamiliar words are looked up online and saved, unless
 * "Look up unfamiliar words online" is off), and the saved-word count + Clear.
 *
 * Picking a voice or speed is only
 * a DRAFT — nothing changes until "Save voice"; closing or Cancel keeps the
 * saved choice.
 *   Browsers that can't run the AI voice keep the old list of their own voices:
 *   "Default voice" = the most natural Indian-English voice this browser has
 *   (tts.getDefaultVoice), then every voice, most natural first.
 *
 * Rendered in a portal on <body>: the header it opens from has a backdrop
 * blur, which would otherwise trap this "fixed" dialog inside the header.
 * Tip shown to users: Microsoft Edge has the most human voices
 * (e.g. "Neerja (Natural) – English India").
 *
 * AI KEY: stored only in this browser (settings.setAiKey) and sent only to
 * Anthropic when you press "Improve with AI". Leave empty to use the offline
 * text tidy-up instead.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Volume2, Square, Sparkles, KeyRound, Check } from 'lucide-react';
import {
  getDefaultVoice,
  isNaturalVoice,
  isTTSSupported,
  listVoices,
  onVoicesChanged,
  previewSpeech,
  stopPreviewSpeech,
} from '@/services/audio/tts';
import {
  AI_VOICES,
  aiVoiceGender,
  isAiVoiceSupported,
  isHindiVoice,
  narrationLanguage,
  VIDEO_VOICE_ID,
} from '@/services/audio/neuralVoice';
import { matchSpeakerGender } from '@/services/text/speakerGender';
import { VoiceTestButton } from '@/components/ui/VoiceTestButton';
import { PronunciationReview } from '@/components/ui/PronunciationReview';
import { NarratorVoicePicker } from '@/components/course/NarratorVoicePicker';
import { demoLine } from '@/services/text/demoLines';
import {
  forgetLearnedWords,
  learnedWordCount,
  toDevanagari,
  toDevanagariAsync,
} from '@/services/text/hinglish';
import {
  getAiKey,
  getVoiceSettings,
  setAiKey,
  setVoiceSettings,
} from '@/services/storage/settings';

const SAMPLE_TEXT =
  'Namaste! Yahan click karke aap graph data dekh sakte hain. This is how your walkthrough will sound.';

/** @param {{ onClose: () => void }} props */
export function SettingsDialog({ onClose }) {
  const [voices, setVoices] = useState(() => listVoices());
  const [savedVoice, setSavedVoice] = useState(() => getVoiceSettings());
  const [voiceSettings, setVoiceState] = useState(() => getVoiceSettings()); // draft
  const [voiceSaved, setVoiceSaved] = useState(false);
  const [playingURI, setPlayingURI] = useState(null);
  const [testText, setTestText] = useState('');
  const [aiKey, setAiKeyState] = useState(() => getAiKey());
  const [keySaved, setKeySaved] = useState(false);

  // Voices load asynchronously in most browsers.
  useEffect(() => onVoicesChanged(() => setVoices(listVoices())), []);
  useEffect(() => stopPreviewSpeech, []);

  // "Hindi voices read: …" — live while typing; lookups wait for a 400 ms pause.
  // With a Hindi voice selected, it shows that voice's reading (its gender's forms).
  const [hindiPreview, setHindiPreview] = useState(() => toDevanagari(SAMPLE_TEXT));
  const [savedWords, setSavedWords] = useState(() => learnedWordCount());
  const lookup = voiceSettings.hinglishLookup;
  const draftVoiceId = voiceSettings.aiVoiceId ?? VIDEO_VOICE_ID;
  const previewVoice = isHindiVoice(draftVoiceId)
    ? AI_VOICES.find((v) => v.id === draftVoiceId)
    : null;
  const previewGender = previewVoice ? aiVoiceGender(previewVoice.id) : null;
  useEffect(() => {
    const text = matchSpeakerGender(testText.trim() || SAMPLE_TEXT, previewGender);
    setHindiPreview(toDevanagari(text));
    let stale = false;
    const timer = setTimeout(async () => {
      const converted = await toDevanagariAsync(text, { lookup });
      if (stale) return;
      setHindiPreview(converted);
      setSavedWords(learnedWordCount());
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [testText, lookup, previewGender]);
  useEffect(() => {
    const handleKeyDown = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const defaultVoice = getDefaultVoice();
  const usingDefault = voiceSettings.voiceURI == null;
  const recommended = voices.filter(isNaturalVoice);
  const others = voices.filter((v) => !isNaturalVoice(v));
  const aiVoiceSupported = isAiVoiceSupported();
  const aiVoiceOf = (settings) => settings.aiVoiceId ?? VIDEO_VOICE_ID;
  const voiceDirty =
    voiceSettings.voiceURI !== savedVoice.voiceURI ||
    voiceSettings.rate !== savedVoice.rate ||
    aiVoiceOf(voiceSettings) !== aiVoiceOf(savedVoice) ||
    voiceSettings.hinglishLookup !== savedVoice.hinglishLookup;

  /** Changes the DRAFT only. */
  const updateVoice = (patch) => setVoiceState((v) => ({ ...v, ...patch }));

  /** AI voice settings: saved at once (the narrator panel saves its own changes too). */
  const saveNow = (patch) => {
    updateVoice(patch);
    setVoiceSettings(patch);
    setSavedVoice((v) => ({ ...v, ...patch }));
  };

  const saveVoice = () => {
    setVoiceSettings(voiceSettings);
    setSavedVoice(voiceSettings);
    setVoiceSaved(true);
    setTimeout(() => setVoiceSaved(false), 1600);
  };

  /** ▶ a voice (or null = the default) at the draft speed, without saving. */
  const play = (voiceURI) => {
    const key = voiceURI ?? 'default';
    if (playingURI === key) {
      stopPreviewSpeech();
      setPlayingURI(null);
      return;
    }
    updateVoice({ voiceURI });
    setPlayingURI(key);
    // The demo line in the narrator's language, like every other preview.
    previewSpeech(demoLine('intro', narrationLanguage()), () => setPlayingURI(null), {
      voiceURI,
      rate: voiceSettings.rate,
    });
  };

  const saveKey = () => {
    setAiKey(aiKey);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 1500);
  };

  const renderVoice = (voice) => {
    const active = voice.voiceURI === voiceSettings.voiceURI;
    return (
      <li key={voice.voiceURI}>
        <div
          className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${
            active
              ? 'border-accent bg-accent/5 dark:bg-accent/10'
              : 'border-transparent hover:bg-paper-2 dark:hover:bg-paper-2-dark'
          }`}
        >
          <button
            onClick={() => updateVoice({ voiceURI: voice.voiceURI })}
            className="flex-1 min-w-0 text-left"
            aria-pressed={active}
          >
            <span className="block text-sm font-medium text-ink dark:text-ink-soft-dark truncate">
              {voice.name}
            </span>
            <span className="block text-[11px] text-ink-faint dark:text-ink-faint-dark">
              {voice.lang}
              {voice.voiceURI === defaultVoice?.voiceURI ? ' · default' : ''}
              {active ? ' · selected' : ''}
            </span>
          </button>
          <button
            onClick={() => play(voice.voiceURI)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-accent hover:bg-accent/10"
            aria-label={`Listen to ${voice.name}`}
          >
            {playingURI === voice.voiceURI ? (
              <Square className="w-3.5 h-3.5" fill="currentColor" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </li>
    );
  };

  /** Speed + Save / Cancel (both voice lists). Nothing changes until Save. */
  const speedAndSave = (
    <>
      <label className="mt-4 flex items-center gap-3 text-sm text-ink dark:text-ink-soft-dark">
        <span className="w-16 flex-shrink-0 text-xs font-semibold text-ink-faint dark:text-ink-faint-dark">
          Speed
        </span>
        <input
          type="range"
          min="0.8"
          max="1.2"
          step="0.05"
          value={voiceSettings.rate}
          onChange={(e) => updateVoice({ rate: Number(e.target.value) })}
          className="flex-1 accent-accent"
        />
        <span className="w-12 text-right font-mono text-xs">{voiceSettings.rate.toFixed(2)}×</span>
      </label>

      {/* Nothing changes until Save */}
      <div className="mt-4 flex items-center justify-end gap-2">
        {voiceDirty && (
          <span className="mr-auto text-xs font-medium text-amber-600 dark:text-amber-400">
            Not saved yet
          </span>
        )}
        {voiceDirty && (
          <button
            onClick={() => {
              stopPreviewSpeech();
              setVoiceState(savedVoice);
            }}
            className="px-3 h-10 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark"
          >
            Cancel
          </button>
        )}
        <button
          onClick={saveVoice}
          disabled={!voiceDirty && !voiceSaved}
          className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {voiceSaved && <Check className="w-4 h-4" />}
          {voiceSaved ? 'Voice saved' : 'Save voice'}
        </button>
      </div>
    </>
  );

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="hs-caption-in relative w-full max-w-lg max-h-[88vh] flex flex-col rounded-3xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 id="settings-title" className="text-lg font-bold text-ink dark:text-white">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-ink-faint hover:bg-paper-2 dark:hover:bg-paper-2-dark"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-7">
          {/* ── Voice ── */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-ink-soft-dark">
              <Volume2 className="w-4 h-4 text-accent" /> AI voice
            </h3>
            {aiVoiceSupported ? (
              <>
                <p className="text-xs text-ink-soft dark:text-ink-faint-dark mt-1 mb-3">
                  Your narrator for every walkthrough and video. Changes apply everywhere straight
                  away — each one plays so you can hear it.
                </p>
                <NarratorVoicePicker
                  sampleText={testText.trim() || undefined}
                  onVoiceChange={(voice) => saveNow({ aiVoiceId: voice.id })}
                />
                <label className="block mt-3">
                  <span className="block text-xs font-semibold text-ink dark:text-ink-soft-dark mb-1">
                    Try your own sentence
                  </span>
                  <textarea
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    rows={2}
                    placeholder="Type a line from your steps — every preview above will say it"
                    className="w-full px-3 py-2 rounded-xl bg-paper-2 dark:bg-paper-2-dark border border-line dark:border-line-dark text-sm text-ink dark:text-ink-soft-dark outline-none focus:border-accent resize-none"
                  />
                </label>
                {previewVoice && testText.trim() && (
                  <p className="mt-2 px-3 py-2 rounded-xl bg-paper-2 dark:bg-paper-2-dark text-xs text-ink-soft dark:text-ink-soft-dark">
                    <span className="font-semibold">{previewVoice.name} reads: </span>
                    {hindiPreview}
                  </p>
                )}
                <details className="mt-3 group">
                  <summary className="cursor-pointer text-xs font-semibold text-ink-soft dark:text-ink-faint-dark hover:text-accent">
                    Pronunciation and Hindi words
                  </summary>
                  <label className="mt-2 flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lookup}
                      onChange={(e) => saveNow({ hinglishLookup: e.target.checked })}
                      className="mt-0.5 w-4 h-4 accent-accent"
                    />
                    <span className="text-xs text-ink dark:text-ink-soft-dark">
                      Look up unfamiliar words online
                      <span className="block text-[11px] text-ink-faint dark:text-ink-faint-dark">
                        Words the built-in lists don&apos;t know (like “krti”, “kese”) are sent
                        once, one word at a time, to Google&apos;s transliteration service, and the
                        answer is saved in this browser. Off: those words are spelled by simple
                        rules.
                      </span>
                    </span>
                  </label>
                  <p className="mt-1.5 pl-[26px] text-[11px] text-ink-faint dark:text-ink-faint-dark">
                    Saved words: {savedWords}
                    {savedWords > 0 && (
                      <>
                        {' · '}
                        <button
                          type="button"
                          onClick={() => {
                            forgetLearnedWords();
                            setSavedWords(0);
                          }}
                          className="text-accent hover:underline"
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </p>
                  <PronunciationReview
                    voiceId={previewVoice?.id ?? AI_VOICES.find((v) => v.lang === 'hi').id}
                    lookup={lookup}
                  />
                </details>
              </>
            ) : (
              /* Browsers that can't run the AI voice: their own voices, as before. */
              <p className="text-xs text-ink-soft dark:text-ink-faint-dark mt-1 mb-3">
                Used when a step has text but no recorded voice. Natural voices sound the most human
                — Microsoft Edge offers the best ones (e.g. “Neerja (Natural) – English India”).
              </p>
            )}
            {aiVoiceSupported ? null : !isTTSSupported() ? (
              <p className="text-sm text-danger">This browser has no text-to-speech.</p>
            ) : voices.length === 0 ? (
              <p className="text-sm text-ink-faint">Loading voices…</p>
            ) : (
              <>
                {/* Default voice — selected unless another one was saved */}
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 mb-3 rounded-xl border-2 transition-colors ${
                    usingDefault
                      ? 'border-accent bg-accent/5 dark:bg-accent/10'
                      : 'border-line dark:border-line-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark'
                  }`}
                >
                  <button
                    onClick={() => updateVoice({ voiceURI: null })}
                    className="flex-1 min-w-0 text-left"
                    aria-pressed={usingDefault}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-white">
                      Default voice
                      <span className="px-1.5 py-px rounded-full text-[10px] font-bold uppercase tracking-wider bg-accent text-white">
                        Default
                      </span>
                      {usingDefault && <Check className="w-4 h-4 text-accent" />}
                    </span>
                    <span className="block text-[11px] text-ink-faint dark:text-ink-faint-dark truncate">
                      {defaultVoice
                        ? `${defaultVoice.name} · ${defaultVoice.lang}`
                        : 'Best voice of this browser'}
                    </span>
                  </button>
                  <button
                    onClick={() => play(null)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-accent hover:bg-accent/10"
                    aria-label="Listen to the default voice"
                  >
                    {playingURI === 'default' ? (
                      <Square className="w-3.5 h-3.5" fill="currentColor" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {recommended.length > 0 && (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark mb-1.5">
                      Recommended
                    </p>
                    <ul className="space-y-1 mb-3">{recommended.map(renderVoice)}</ul>
                  </>
                )}
                {others.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer text-xs font-medium text-ink-soft dark:text-ink-faint-dark mb-1.5">
                      Other voices ({others.length})
                    </summary>
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {others.map(renderVoice)}
                    </ul>
                  </details>
                )}
                {speedAndSave}
              </>
            )}
          </section>

          {/* ── AI text improvement ── */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-ink-soft-dark">
              <Sparkles className="w-4 h-4 text-accent" /> Improve text with AI (optional)
            </h3>
            <p className="text-xs text-ink-soft dark:text-ink-faint-dark mt-1 mb-3">
              Paste your own Anthropic API key to let Claude rewrite step descriptions so they sound
              natural. Your key is only ever sent to Anthropic. Without a key, “Improve” still
              tidies the text.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
                <input
                  type="password"
                  value={aiKey}
                  onChange={(e) => setAiKeyState(e.target.value)}
                  placeholder="sk-ant-…"
                  autoComplete="off"
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-paper-2 dark:bg-paper-2-dark border border-line dark:border-line-dark text-sm outline-none focus:border-accent"
                  aria-label="Anthropic API key"
                />
              </div>
              <button
                onClick={saveKey}
                className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark"
              >
                {keySaved ? <Check className="w-4 h-4" /> : null}
                {keySaved ? 'Saved' : 'Save'}
              </button>
            </div>
            {aiKey && (
              <button
                onClick={() => {
                  setAiKeyState('');
                  setAiKey('');
                }}
                className="mt-2 text-xs text-danger hover:underline"
              >
                Remove key
              </button>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
