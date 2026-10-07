/**
 * @file A step's description textarea with helpers:
 *   🎤 Speak    — voice typing in Hinglish, हिंदी or English (hooks/useDictation);
 *                the language is remembered.
 *   ✓ Fix spelling — "kre" → kare, "dikai" → dikhai, "prablomatic" → problematic
 *                (services/text/fixText); "Undo" restores the previous text.
 *   Auto-fix   — the same fixes, applied to each word as you finish typing it
 *                (on by default, remembered; "Undo" next to the last fix).
 *   Convert    — the whole text to Hinglish, English or हिंदी (services/text/translate).
 *   ✨ Improve  — AI rewrite (if an Anthropic key is set in Settings) or an
 *                offline tidy-up; one-click "Undo" restores the previous text.
 *   🔊 Listen   — reads the text in the chosen AI voice (Settings).
 * Used by the editor and by the preview's edit panel.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Volume2,
  Square,
  Undo2,
  Loader2,
  Mic,
  SpellCheck,
  Languages,
  Wand2,
} from 'lucide-react';
import { improveWithClaude, polishText } from '@/services/text/enhance';
import { fixSpelling, fixTypedWord } from '@/services/text/fixText';
import { convertTextTo } from '@/services/text/translate';
import { canSpeakText, previewSpeech, stopPreviewSpeech } from '@/services/audio/tts';
import { narrationLanguage } from '@/services/audio/neuralVoice';
import { getAiKey, readKey, writeKey } from '@/services/storage/settings';
import { LS_AUTOFIX, LS_DICTATION_LANG } from '@/constants';
import { DICTATION_LANGS, useDictation } from '@/hooks/useDictation';
import { toast } from 'react-toastify';
import { Tooltip } from '@/components/ui/Tooltip';

const TOOL_BUTTON_CLASS =
  'flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50';

const CONVERT_TARGETS = [
  { id: 'hinglish', label: 'Hinglish', hint: 'Roman Hindi, spelling fixed' },
  { id: 'english', label: 'English', hint: 'Translate to English' },
  { id: 'hindi', label: 'हिंदी', hint: 'Hindi script — what Hindi voices read best' },
];
/** A word ends when one of these is typed after it. */
const WORD_END = /[\s.,!?;:।)]/;

/** Last voice-typing language, or the narrator's language. */
function initialDictationLang() {
  const saved = readKey(LS_DICTATION_LANG);
  if (DICTATION_LANGS.some((l) => l.id === saved)) return saved;
  // Otherwise the narrator's language: speak the way it will be read.
  const narrator = narrationLanguage();
  return narrator === 'en' ? 'english' : narrator;
}

/**
 * @param {{
 *   id?: string,
 *   value: string,
 *   onChange: (text: string) => void,
 *   label?: string,
 *   pageName?: string,
 *   action?: 'click' | 'look' | 'type',
 *   rows?: number,
 *   grow?: boolean,   // fill the parent's height (the textarea grows)
 *   placeholder?: string,
 * }} props
 */
export function DescriptionField({
  id,
  value,
  onChange,
  label,
  pageName,
  action,
  rows = 4,
  grow = false,
  placeholder = 'What should the viewer do here?',
}) {
  const [improving, setImproving] = useState(false);
  const [previous, setPrevious] = useState(null); // for Undo
  const [listening, setListening] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [dictationLang, setDictationLang] = useState(initialDictationLang);
  const [converting, setConverting] = useState(null); // target id | null
  const [autoFix, setAutoFix] = useState(() => readKey(LS_AUTOFIX) !== '0');
  const [lastFix, setLastFix] = useState(null); // { from, to, start } — for its Undo
  const textarea = useRef(null);

  useEffect(() => stopPreviewSpeech, []);

  // Voice typing appends each finished phrase to the CURRENT text.
  const valueRef = useRef(value);
  valueRef.current = value;

  /** Replaces `from` at `start` with `to` if it is still there, keeping the caret in place. */
  const replaceAt = (start, from, to) => {
    const current = valueRef.current;
    if (current.slice(start, start + from.length) !== from) return false;
    const el = textarea.current;
    const caret = el && document.activeElement === el ? el.selectionStart : null;
    onChange(current.slice(0, start) + to + current.slice(start + from.length));
    if (caret != null) {
      const moved = caret > start ? caret + to.length - from.length : caret;
      requestAnimationFrame(() => el.setSelectionRange(moved, moved));
    }
    return true;
  };

  /** Auto-fix: the word just finished by a space or punctuation. */
  const fixFinishedWord = async (text, caret) => {
    if (caret < 2 || !WORD_END.test(text[caret - 1])) return;
    const before = text.slice(0, caret - 1);
    const word = before.match(/[A-Za-z]+$/)?.[0];
    if (!word) return;
    const start = before.length - word.length;
    const sentence = before.slice(Math.max(0, before.search(/[^.!?।\n]*$/)));
    const to = await fixTypedWord(word, sentence).catch(() => null);
    if (to && replaceAt(start, word, to)) setLastFix({ from: word, to, start });
  };

  const toggleAutoFix = () => {
    setAutoFix((on) => {
      writeKey(LS_AUTOFIX, on ? '0' : '1');
      return !on;
    });
    setLastFix(null);
  };

  const convert = async (target) => {
    if (!value.trim() || converting) return;
    setConverting(target);
    try {
      const converted = await convertTextTo(value, target);
      const name = CONVERT_TARGETS.find((t) => t.id === target).label;
      if (converted.trim() === value.trim()) toast(`Already in ${name}`);
      else {
        setPrevious(value);
        setLastFix(null);
        onChange(converted);
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setConverting(null);
    }
  };
  const dictation = useDictation((said) => {
    const current = valueRef.current;
    onChange(current.trim() ? `${current.replace(/\s+$/, '')} ${said}` : said);
  });

  const toggleDictation = () => {
    if (dictation.listening) dictation.stop();
    else {
      setPrevious(null);
      dictation.start(dictationLang);
    }
  };

  const chooseDictationLang = (id) => {
    setDictationLang(id);
    writeKey(LS_DICTATION_LANG, id);
    if (dictation.listening) dictation.start(id);
  };

  const fix = async () => {
    if (!value.trim()) return;
    setFixing(true);
    try {
      const { text, changes } = await fixSpelling(value);
      if (!changes.length) {
        toast('No spelling mistakes found');
        return;
      }
      setPrevious(value);
      onChange(text);
      const shown = changes.slice(0, 4).map((c) => `${c.from} → ${c.to}`);
      if (changes.length > 4) shown.push(`+${changes.length - 4} more`);
      toast.success(`Fixed: ${shown.join(', ')}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setFixing(false);
    }
  };

  const improve = async () => {
    const text = value.trim();
    if (!text) {
      toast.info('Write something first, then improve it');
      return;
    }
    const apiKey = getAiKey();
    setImproving(true);
    try {
      const improved = apiKey
        ? await improveWithClaude(text, { apiKey, label, pageName, action })
        : polishText(text);
      if (improved === value) {
        toast(apiKey ? 'Already reads well' : 'Tidied — add an AI key in Settings for rewrites');
      } else {
        setPrevious(value);
        onChange(improved);
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setImproving(false);
    }
  };

  const listen = () => {
    if (listening) {
      stopPreviewSpeech();
      setListening(false);
      return;
    }
    if (!value.trim()) return;
    setListening(true);
    previewSpeech(value, () => setListening(false));
  };

  return (
    <div className={grow ? 'flex-1 min-h-0 flex flex-col' : undefined}>
      <textarea
        ref={textarea}
        id={id}
        value={value}
        onChange={(e) => {
          const text = e.target.value;
          const typedOne = text.length === value.length + 1;
          setPrevious(null);
          onChange(text);
          if (autoFix && typedOne) fixFinishedWord(text, e.target.selectionStart);
        }}
        placeholder={placeholder}
        rows={rows}
        className={`${grow ? 'flex-1 min-h-[6rem] ' : ''}w-full px-3 py-2.5 rounded-xl bg-paper-2 dark:bg-paper-2-dark border border-line dark:border-line-dark text-sm text-ink dark:text-ink-soft-dark outline-none focus:border-accent transition-colors resize-none`}
      />
      {lastFix && (
        <p className="mt-1 px-1 flex items-center gap-2 text-[11px] text-ink-faint dark:text-ink-faint-dark">
          Auto-fixed “{lastFix.from}” → “{lastFix.to}”
          <button
            type="button"
            onClick={() => {
              replaceAt(lastFix.start, lastFix.to, lastFix.from);
              setLastFix(null);
            }}
            className="font-semibold text-accent hover:underline"
          >
            Undo
          </button>
        </p>
      )}
      {dictation.interim && (
        <p className="mt-1 px-1 text-xs italic text-ink-faint dark:text-ink-faint-dark">
          {dictation.interim}…
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {dictation.supported && (
          <div className="flex items-center rounded-lg bg-paper-2 dark:bg-paper-2-dark">
            <Tooltip label={dictation.listening ? 'Stop voice typing' : 'Type by speaking'}>
              <button
                onClick={toggleDictation}
                className={`${TOOL_BUTTON_CLASS} ${
                  dictation.listening
                    ? 'bg-danger/10 text-danger'
                    : 'text-ink-soft dark:text-ink-faint-dark hover:text-accent'
                }`}
                aria-pressed={dictation.listening}
              >
                {dictation.listening ? (
                  <Square className="w-3 h-3 animate-pulse" fill="currentColor" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
                {dictation.listening ? 'Listening…' : 'Speak'}
              </button>
            </Tooltip>
            <Tooltip label={DICTATION_LANGS.find((l) => l.id === dictationLang)?.hint}>
              <select
                value={dictationLang}
                onChange={(e) => chooseDictationLang(e.target.value)}
                aria-label="Voice typing language"
                className="h-8 pr-1 bg-transparent text-xs font-semibold text-ink-soft dark:text-ink-faint-dark outline-none cursor-pointer"
              >
                {DICTATION_LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Tooltip>
          </div>
        )}
        <Tooltip
          label={
            autoFix
              ? 'Auto-fix is on: words are corrected as you type (kre → kare, dikai → dikhai)'
              : 'Auto-fix is off'
          }
        >
          <button
            type="button"
            onClick={toggleAutoFix}
            aria-pressed={autoFix}
            className={`${TOOL_BUTTON_CLASS} ${
              autoFix
                ? 'text-accent bg-accent/10'
                : 'text-ink-faint dark:text-ink-faint-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            Auto-fix
          </button>
        </Tooltip>
        <div className="flex items-center rounded-lg bg-paper-2 dark:bg-paper-2-dark">
          <Languages className="ml-2 w-3.5 h-3.5 text-ink-faint dark:text-ink-faint-dark" />
          {CONVERT_TARGETS.map((t) => (
            <Tooltip key={t.id} label={t.hint}>
              <button
                type="button"
                onClick={() => convert(t.id)}
                disabled={!!converting || !value.trim()}
                className={`${TOOL_BUTTON_CLASS} text-ink-soft dark:text-ink-faint-dark hover:text-accent`}
              >
                {converting === t.id && <Loader2 className="w-3 h-3 animate-spin" />}
                {t.label}
              </button>
            </Tooltip>
          ))}
        </div>
        <Tooltip label="Fix chat spellings (kre → kare) and English typos">
          <button
            onClick={fix}
            disabled={fixing || !value.trim()}
            className={`${TOOL_BUTTON_CLASS} text-ink-soft dark:text-ink-faint-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark`}
          >
            {fixing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <SpellCheck className="w-3.5 h-3.5" />
            )}
            Fix spelling
          </button>
        </Tooltip>
        {/* Improve — switched off for now.
        <Tooltip
          label={
            getAiKey()
              ? 'Rewrite your text with AI'
              : 'Tidy up your text (add an AI key in Settings for full rewrites)'
          }
        >
          <button
            onClick={improve}
            disabled={improving}
            className={`${TOOL_BUTTON_CLASS} bg-accent/10 text-accent hover:bg-accent/15`}
          >
            {improving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Improve
          </button>
        </Tooltip>
        */}
        {previous !== null && (
          <Tooltip label="Bring back your own text">
            <button
              onClick={() => {
                onChange(previous);
                setPrevious(null);
              }}
              className={`${TOOL_BUTTON_CLASS} text-ink-soft dark:text-ink-faint-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark`}
            >
              <Undo2 className="w-3.5 h-3.5" /> Undo
            </button>
          </Tooltip>
        )}
        {canSpeakText() && (
          <Tooltip label={listening ? 'Stop' : 'Hear it in the AI voice'}>
            <button
              onClick={listen}
              disabled={!value.trim()}
              className={`${TOOL_BUTTON_CLASS} text-violet dark:text-violet-dark hover:bg-violet/10`}
            >
              {listening ? (
                <Square className="w-3 h-3" fill="currentColor" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              {listening ? 'Stop' : 'Listen'}
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
