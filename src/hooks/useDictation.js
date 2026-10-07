/**
 * @file Voice typing for step text — the browser's speech recognition
 * (Chrome / Edge / Safari; hidden where it doesn't exist, e.g. Firefox).
 *
 *   const { supported, listening, interim, start, stop } = useDictation(onText);
 *   start('hinglish')   // onText(finalText) per spoken phrase; start again = new session
 *
 * LANGUAGES (DICTATION_LANGS):
 *   hinglish  Hindi recognizer, written back in Roman letters with the usual
 *             Hinglish spellings ("बारकोड स्कैन करें" → "barcode scan karein";
 *             hinglish.toHinglish), so captions look like typed Hinglish.
 *   hindi     Hindi recognizer, kept in Hindi script — read perfectly by the
 *             Hindi voices (not by the English ones).
 *   english   English (India) recognizer.
 * Mixed speech ("yahan barcode scan karo") is best with hinglish: the Hindi
 * recognizer knows common English words; the English one garbles Hindi.
 *
 * PRIVACY: Chrome and Edge send the audio to their own speech service while
 * listening (that is how the browser feature works); nothing is recorded or kept.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { toHinglish } from '@/services/text/hinglish';

export const DICTATION_LANGS = [
  {
    id: 'hinglish',
    label: 'Hinglish',
    recognizer: 'hi-IN',
    hint: 'Hindi + English, written in Roman letters',
  },
  {
    id: 'hindi',
    label: 'हिंदी',
    recognizer: 'hi-IN',
    hint: 'Written in Hindi script — best for Hindi voices',
  },
  { id: 'english', label: 'English', recognizer: 'en-IN', hint: 'English (India)' },
];

const Recognition =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

const ERRORS = {
  'not-allowed': 'Allow the microphone to use voice typing',
  'service-not-allowed': 'Allow the microphone to use voice typing',
  'audio-capture': 'No microphone found',
  network: 'Voice typing needs an internet connection',
  'language-not-supported': 'This browser can’t type that language — try Chrome',
};

/** @param {(text: string) => void} onText called with each finished phrase */
export function useDictation(onText) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recognition = useRef(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);
  useEffect(() => () => recognition.current?.abort(), []);

  /** @param {'hinglish' | 'hindi' | 'english'} langId */
  const start = (langId) => {
    if (!Recognition) return;
    recognition.current?.abort();
    const lang = DICTATION_LANGS.find((l) => l.id === langId) ?? DICTATION_LANGS[0];
    const rec = new Recognition();
    rec.lang = lang.recognizer;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const said = result[0].transcript.trim();
        if (!result.isFinal) pending += `${said} `;
        else if (said) onTextRef.current(lang.id === 'hinglish' ? toHinglish(said) : said);
      }
      setInterim(pending.trim());
    };
    rec.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      toast.error(ERRORS[event.error] || `Voice typing stopped (${event.error})`);
    };
    rec.onend = () => {
      if (recognition.current !== rec) return;
      recognition.current = null;
      setListening(false);
      setInterim('');
    };
    recognition.current = rec;
    rec.start();
    setListening(true);
  };

  return { supported: !!Recognition, listening, interim, start, stop };
}
