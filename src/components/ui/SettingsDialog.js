/**
 * @file Settings: the AI voice (which voice, how fast) and the optional
 * Anthropic API key used by "Improve with AI".
 *
 * VOICE: "Default voice" (selected unless you saved another) = the most natural
 * Indian-English voice this browser has (tts.getDefaultVoice). Below it every
 * voice, most natural first; "Recommended" = natural/neural voices. ▶ plays a
 * sample. Picking a voice or speed is only a DRAFT — nothing changes until
 * "Save voice"; closing or Cancel keeps the saved choice.
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
  const [aiKey, setAiKeyState] = useState(() => getAiKey());
  const [keySaved, setKeySaved] = useState(false);

  // Voices load asynchronously in most browsers.
  useEffect(() => onVoicesChanged(() => setVoices(listVoices())), []);
  useEffect(() => stopPreviewSpeech, []);
  useEffect(() => {
    const handleKeyDown = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const defaultVoice = getDefaultVoice();
  const usingDefault = voiceSettings.voiceURI == null;
  const recommended = voices.filter(isNaturalVoice);
  const others = voices.filter((v) => !isNaturalVoice(v));
  const voiceDirty =
    voiceSettings.voiceURI !== savedVoice.voiceURI || voiceSettings.rate !== savedVoice.rate;

  /** Changes the DRAFT only. */
  const updateVoice = (patch) => setVoiceState((v) => ({ ...v, ...patch }));

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
    previewSpeech(SAMPLE_TEXT, () => setPlayingURI(null), {
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
            <p className="text-xs text-ink-soft dark:text-ink-faint-dark mt-1 mb-3">
              Used when a step has text but no recorded voice. Natural voices sound the most human —
              Microsoft Edge offers the best ones (e.g. “Neerja (Natural) – English India”).
            </p>
            {!isTTSSupported() ? (
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
                  <span className="w-12 text-right font-mono text-xs">
                    {voiceSettings.rate.toFixed(2)}×
                  </span>
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
            )}
          </section>

          {/* ── AI text improvement ── */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-ink-soft-dark">
              <Sparkles className="w-4 h-4 text-accent" /> Improve text with AI (optional)
            </h3>
            <p className="text-xs text-ink-soft dark:text-ink-faint-dark mt-1 mb-3">
              Paste your own Anthropic API key to let Claude rewrite step descriptions so they sound
              natural. The key stays in this browser and is only sent to Anthropic. Without a key,
              “Improve” still tidies the text offline.
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
