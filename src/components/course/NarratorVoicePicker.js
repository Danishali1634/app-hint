/**
 * @file "Who should explain?" — the narrator: language, voice and voice speed,
 * in one place (New course form, editor's Voice panel, Settings). Every change
 * is saved at once AND demonstrated at once — nothing to save, nothing to guess.
 *
 *   <NarratorVoicePicker />          open (New course form, Settings)
 *   <NarratorVoicePicker compact />  one line "Narrator: Priyamvada · Change"
 *   <NarratorVoicePicker onVoiceChange={…} onLanguageChange={(lang, previous) => …} />
 *        editor: a new language converts the course's steps there
 *   <NarratorVoicePicker sampleText="…" />  previews speak this instead of the demo line
 *
 * CONNECTED CHOICES (never a mismatched preview):
 *   - Language English · Hinglish · हिंदी picks a voice that speaks it (same
 *     gender as before), and the demo line becomes one WRITTEN for that
 *     language (services/text/demoLines), in the narrator's own gender.
 *   - A voice of the other language switches the language with it.
 *   - Every choice plays the result: a new language or voice speaks the demo
 *     line; a new speed speaks it at that speed (after the slider rests), and
 *     "Slower · Normal · Faster" compare in one click each.
 * The preview is the real thing: the same AI voice, speed, Hinglish/Hindi
 * conversion and gender forms the walkthrough and the video use.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Mic2 } from 'lucide-react';
import {
  AI_VOICES,
  aiVoiceFromSettings,
  isAiVoiceSupported,
  narrationLanguage,
} from '@/services/audio/neuralVoice';
import { getVoiceSettings, setVoiceSettings } from '@/services/storage/settings';
import { NARRATION_LANGUAGES, demoLine, languageForVoice } from '@/services/text/demoLines';
import { matchSpeakerGender } from '@/services/text/speakerGender';
import { useVoiceTest } from '@/hooks/useVoiceTest';
import { VoiceTestButton } from '@/components/ui/VoiceTestButton';

const SPEED = { min: 0.8, max: 1.2, step: 0.05 };
/** One-click comparisons for the voice speed. */
const SPEED_PRESETS = [
  { rate: 0.9, label: 'Slower' },
  { rate: 1, label: 'Normal' },
  { rate: 1.15, label: 'Faster' },
];
/** The speed preview plays once the slider has rested this long. */
const SPEED_PREVIEW_DELAY_MS = 450;

const voiceLangOf = (language) => NARRATION_LANGUAGES.find((l) => l.id === language)?.voiceLang;

/**
 * @param {{
 *   compact?: boolean,
 *   onVoiceChange?: (voice: typeof AI_VOICES[number], previous: typeof AI_VOICES[number]) => void,
 *   onLanguageChange?: (language: 'en' | 'hinglish' | 'hindi', previous: string) => void,
 *   sampleText?: string,
 * }} props
 */
export function NarratorVoicePicker({
  compact = false,
  onVoiceChange,
  onLanguageChange,
  sampleText,
}) {
  const [voiceId, setVoiceId] = useState(() => aiVoiceFromSettings().voiceId);
  const [language, setLanguage] = useState(() => narrationLanguage());
  const [rate, setRate] = useState(() => getVoiceSettings().rate);
  const [open, setOpen] = useState(!compact);
  const [allVoices, setAllVoices] = useState(false);
  const { testing, testVoice, testLabel } = useVoiceTest();

  const selected = AI_VOICES.find((v) => v.id === voiceId) ?? AI_VOICES[0];
  /** What a voice says in a preview: the demo line in its language and gender. */
  const lineFor = (voice, lang, key = 'intro') =>
    sampleText?.trim() || demoLine(key, lang, voice.gender);
  const speak = (voice, text, speed = rate) =>
    testVoice(voice, text, {
      rate: speed,
      hinglishLookup: getVoiceSettings().hinglishLookup,
      restart: true,
    });

  // Speed: saved and played once the slider rests (not on every step of a drag).
  const lastRate = useRef(rate);
  useEffect(() => {
    if (rate === lastRate.current) return undefined;
    const timer = setTimeout(() => {
      lastRate.current = rate;
      setVoiceSettings({ rate });
      speak(selected, lineFor(selected, language, 'speed'), rate);
    }, SPEED_PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate]);

  if (!isAiVoiceSupported()) return null;

  const applyVoice = (voice) => {
    if (voice.id === voiceId) return;
    setVoiceId(voice.id);
    setVoiceSettings({ aiVoiceId: voice.id });
    onVoiceChange?.(voice, selected);
  };
  const applyLanguage = (lang) => {
    if (lang === language) return;
    setLanguage(lang);
    setVoiceSettings({ language: lang });
    onLanguageChange?.(lang, language);
  };

  /** A language: a voice that speaks it (same gender), then hear it. */
  const chooseLanguage = (lang) => {
    if (lang === language) {
      speak(selected, lineFor(selected, lang));
      return;
    }
    const wanted = voiceLangOf(lang);
    const speaks = (v) => (v.lang === 'hi' ? 'hi' : 'en') === wanted;
    const voice = speaks(selected)
      ? selected
      : (AI_VOICES.find((v) => speaks(v) && v.gender === selected.gender) ??
        AI_VOICES.find(speaks));
    applyVoice(voice);
    applyLanguage(lang);
    speak(voice, lineFor(voice, lang));
  };

  /** A voice: its language comes with it, then hear it. */
  const chooseVoice = (voice) => {
    const lang = languageForVoice(voice.lang === 'hi' ? 'hi' : 'en', language);
    applyVoice(voice);
    applyLanguage(lang);
    speak(voice, lineFor(voice, lang));
  };

  const wantedLang = voiceLangOf(language);
  const matching = AI_VOICES.filter((v) => (v.lang === 'hi' ? 'hi' : 'en') === wantedLang);
  const others = AI_VOICES.filter((v) => !matching.includes(v));
  const shownLine = matchSpeakerGender(lineFor(selected, language), selected.gender);
  const playing = testing?.id === selected.id;

  const renderVoice = (voice) => {
    const active = voice.id === voiceId;
    return (
      <li
        key={voice.id}
        className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${
          active
            ? 'border-accent bg-accent/5 dark:bg-accent/10'
            : 'border-transparent hover:bg-paper-2 dark:hover:bg-paper-2-dark'
        }`}
      >
        <button
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => chooseVoice(voice)}
          className="flex-1 min-w-0 flex items-center gap-3 text-left"
        >
          <span
            className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              active ? 'bg-accent text-white' : 'bg-paper-2 dark:bg-paper-2-dark text-ink-soft'
            }`}
            aria-hidden="true"
          >
            {voice.name[0]}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm font-medium text-ink dark:text-ink-soft-dark">
              {voice.name}
              {active && <Check className="w-4 h-4 text-accent" />}
            </span>
            <span className="block text-[11px] text-ink-faint dark:text-ink-faint-dark">
              {voice.description}
            </span>
          </span>
        </button>
        <VoiceTestButton
          voice={voice}
          testing={testing}
          label={testLabel(voice)}
          onClick={() =>
            testVoice(voice, lineFor(voice, languageForVoice(voice.lang, language)), {
              rate,
              hinglishLookup: getVoiceSettings().hinglishLookup,
            })
          }
        />
      </li>
    );
  };

  return (
    <section className="rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
          <Mic2 className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-ink dark:text-ink-soft-dark">
            Narrator: {selected.name} · {NARRATION_LANGUAGES.find((l) => l.id === language)?.label}
            {rate !== 1 && (
              <span className="ml-1.5 font-mono text-xs text-ink-faint dark:text-ink-faint-dark">
                {rate.toFixed(2)}×
              </span>
            )}
          </span>
          <span className="block text-[11px] text-ink-faint dark:text-ink-faint-dark truncate">
            Reads your steps in the walkthrough and the video
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-accent">
          {open ? 'Done' : 'Change'}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* 1. Language — decides the voice and every preview */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink dark:text-ink-soft-dark">
              Which language should it explain in?
            </p>
            <div
              className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-paper-2 dark:bg-paper-2-dark"
              role="radiogroup"
            >
              {NARRATION_LANGUAGES.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={language === l.id}
                  title={l.hint}
                  onClick={() => chooseLanguage(l.id)}
                  className={`h-9 rounded-lg text-sm font-semibold transition-all ${
                    language === l.id
                      ? 'bg-panel dark:bg-panel-dark text-accent shadow-sm'
                      : 'text-ink-soft dark:text-ink-faint-dark hover:text-ink'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. See and hear it — the real voice, speed and language */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-accent/5 dark:bg-accent/10">
            <span
              className={`relative w-10 h-10 flex-shrink-0 rounded-full bg-accent text-white flex items-center justify-center text-sm font-bold ${
                playing ? 'hs-attention' : ''
              }`}
              aria-hidden="true"
            >
              {selected.name[0]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-accent">
                {playing ? `${selected.name} is speaking…` : `${selected.name} will say`}
              </p>
              <p className="mt-0.5 text-sm text-ink dark:text-ink-soft-dark leading-snug">
                “{shownLine}”
              </p>
            </div>
            <VoiceTestButton
              voice={selected}
              testing={testing}
              label={testLabel(selected) === 'Test' ? 'Hear it' : testLabel(selected)}
              onClick={() =>
                playing
                  ? testVoice(selected, shownLine)
                  : speak(selected, lineFor(selected, language))
              }
            />
          </div>

          {/* 3. Voices that speak this language (the rest folded) */}
          <div>
            <p className="mb-1 text-xs font-semibold text-ink dark:text-ink-soft-dark">
              Pick a voice — you'll hear it straight away
            </p>
            <ul className="space-y-1" role="radiogroup" aria-label="Voices">
              {matching.map(renderVoice)}
              {allVoices && others.map(renderVoice)}
            </ul>
            {others.length > 0 && (
              <button
                type="button"
                onClick={() => setAllVoices((a) => !a)}
                className="mt-1 text-[11px] font-medium text-accent hover:underline"
              >
                {allVoices ? 'Fewer voices' : `${others.length} more voices in other languages`}
              </button>
            )}
          </div>

          {/* 4. Speed — heard as soon as the slider rests */}
          <div>
            <p className="flex items-center justify-between text-xs font-semibold text-ink dark:text-ink-soft-dark">
              How fast should it talk?
              <span className="font-mono text-ink-faint dark:text-ink-faint-dark">
                {rate.toFixed(2)}×
              </span>
            </p>
            <input
              type="range"
              min={SPEED.min}
              max={SPEED.max}
              step={SPEED.step}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="mt-1 w-full accent-accent"
              aria-label="Voice speed"
            />
            <div className="mt-1 flex gap-1.5">
              {SPEED_PRESETS.map((p) => (
                <button
                  key={p.rate}
                  type="button"
                  onClick={() =>
                    p.rate === rate
                      ? speak(selected, lineFor(selected, language, 'speed'), rate)
                      : setRate(p.rate)
                  }
                  className={`flex-1 h-8 rounded-lg text-xs font-semibold transition-colors ${
                    Math.abs(rate - p.rate) < 0.001
                      ? 'bg-accent text-white'
                      : 'bg-paper-2 dark:bg-paper-2-dark text-ink-soft hover:text-accent'
                  }`}
                >
                  ▶ {p.label}
                </button>
              ))}
            </div>
          </div>

          {onLanguageChange && (
            <p className="text-[11px] text-ink-faint dark:text-ink-faint-dark">
              A new language changes your steps to match (Undo is offered). Your own words come back
              if you switch back.
            </p>
          )}
          {selected.lang === 'hi' && selected.gender && (
            <p className="px-3 py-2 rounded-xl bg-paper-2 dark:bg-paper-2-dark text-xs text-ink-soft dark:text-ink-soft-dark">
              <span className="font-semibold">
                {selected.name} speaks as a {selected.gender}.
              </span>{' '}
              Write steps your usual way —{' '}
              {selected.gender === 'female'
                ? '“main karunga” is read as “main karungi”.'
                : '“main karungi” is read as “main karunga”.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
