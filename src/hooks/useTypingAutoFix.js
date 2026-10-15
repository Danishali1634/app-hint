/**
 * @file Auto-fix of spelling while typing in a step text box, in two steps:
 *   1. Each word as it is finished (space or punctuation typed after it):
 *      offline fixes — "kre" → kare, "dikai" → dikhai (fixText.fixTypedWord).
 *   2. When the typing pauses (~1.2 s) or the box loses focus: Google's English
 *      spell checker on the whole text — "pleas clik" → please click
 *      (fixText.googleSpellCheck; English sentences only, off when Settings
 *      turned online lookups off).
 * The last fixes are shown with an Undo; a fix the user undid is never made
 * again in this box (they meant it). On by default, the switch is remembered.
 *
 *   const textareaRef = useRef(null);
 *   const autoFix = useTypingAutoFix({ value, onChange, textareaRef });
 *   <textarea ref={textareaRef} value={value}
 *     onChange={autoFix.onTextChange} onBlur={autoFix.onBlur} />
 *   {autoFix.lastFix && <>Auto-fixed {describeFixes(autoFix.lastFix)}
 *     <button onClick={autoFix.undoLastFix}>Undo</button></>}
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fixTypedWord, googleSpellCheck } from '@/services/text/fixText';
import { readKey, writeKey } from '@/services/storage/settings';
import { LS_AUTOFIX } from '@/constants';

/** A word ends when one of these is typed after it. */
const WORD_END = /[\s.,!?;:।)]/;
/** Pause in typing before Google is asked (fewer requests, no fixes mid-thought). */
const GOOGLE_PAUSE_MS = 1200;

/** @typedef {{ from: string, to: string, start: number }} TypingFix */

const pairKey = (from, to) => `${from.toLowerCase()}→${to.toLowerCase()}`;

/** "“teh” → “the”, “clik” → “click”" — for the Auto-fixed line. */
export function describeFixes(fixes) {
  return fixes.map((f) => `“${f.from}” → “${f.to}”`).join(', ');
}

/**
 * @param {{
 *   value: string,
 *   onChange: (text: string) => void,
 *   textareaRef: import('react').RefObject<HTMLTextAreaElement | HTMLInputElement>,
 *   finishWhenGone?: boolean,  // a box that closes on Enter (the video builder's
 *                              // floating card): the check started on blur still
 *                              // applies its fixes through onChange after it is gone
 * }} options
 * @returns {{
 *   autoFix: boolean,
 *   toggleAutoFix: () => void,
 *   onTextChange: (e: import('react').ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void,
 *   onBlur: () => void,
 *   lastFix: TypingFix[] | null,
 *   undoLastFix: () => void,
 *   clearLastFix: () => void,
 * }}
 */
export function useTypingAutoFix({ value, onChange, textareaRef, finishWhenGone = false }) {
  const [autoFix, setAutoFix] = useState(() => readKey(LS_AUTOFIX) !== '0');
  const [lastFix, setLastFix] = useState(/** @type {TypingFix[] | null} */ (null));

  // Fixes arrive after awaits: they work on the CURRENT text, not the render's.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const rejected = useRef(new Set()); // pairKey of fixes the user undid
  const lastChecked = useRef(null); // the text Google last saw
  const typed = useRef(false); // typed since the last Google check
  const timer = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  /**
   * Applies the fixes that still match the current text (the user may have
   * typed on meanwhile) in one change, keeping the caret where it was.
   * @param {TypingFix[]} fixes  starts in the current text
   * @returns {TypingFix[]} the applied ones, starts in the NEW text
   */
  const applyFixes = useCallback(
    (fixes) => {
      const current = valueRef.current;
      const ok = fixes
        .filter((f) => current.slice(f.start, f.start + f.from.length) === f.from)
        .sort((a, b) => a.start - b.start)
        // Overlapping fixes cannot both apply.
        .filter((f, i, all) => i === 0 || all[i - 1].start + all[i - 1].from.length <= f.start);
      if (!ok.length) return [];
      const el = textareaRef?.current;
      const caret = el && document.activeElement === el ? el.selectionStart : null;
      let next = current;
      for (const f of [...ok].reverse()) {
        next = next.slice(0, f.start) + f.to + next.slice(f.start + f.from.length);
      }
      let shift = 0;
      let movedCaret = caret;
      const applied = ok.map((f) => {
        const moved = { ...f, start: f.start + shift };
        if (caret != null && caret > f.start) movedCaret += f.to.length - f.from.length;
        shift += f.to.length - f.from.length;
        return moved;
      });
      valueRef.current = next; // a second fix before the re-render sees this one
      onChangeRef.current(next);
      if (movedCaret != null) {
        requestAnimationFrame(() => el.setSelectionRange(movedCaret, movedCaret));
      }
      return applied;
    },
    [textareaRef],
  );

  /** Step 1: the word just finished by a space or punctuation. */
  const fixFinishedWord = async (text, caret) => {
    if (caret < 2 || !WORD_END.test(text[caret - 1])) return;
    const before = text.slice(0, caret - 1);
    const word = before.match(/[A-Za-z]+$/)?.[0];
    if (!word) return;
    const start = before.length - word.length;
    const sentence = before.slice(Math.max(0, before.search(/[^.!?।\n]*$/)));
    const to = await fixTypedWord(word, sentence).catch(() => null);
    if (!to || !mounted.current || rejected.current.has(pairKey(word, to))) return;
    const applied = applyFixes([{ from: word, to, start }]);
    if (applied.length) setLastFix(applied);
  };

  /** Step 2: Google on the whole text. `whileTyping`: leave the word at the caret. */
  const checkWithGoogle = async (whileTyping) => {
    const text = valueRef.current;
    if (!typed.current || text === lastChecked.current || !text.trim()) return;
    typed.current = false;
    lastChecked.current = text;
    const { changes } = await googleSpellCheck(text);
    if ((!mounted.current && !finishWhenGone) || !changes.length) return;
    const el = textareaRef?.current;
    const caret = whileTyping && el && document.activeElement === el ? el.selectionStart : null;
    const wanted = changes.filter((c) => !rejected.current.has(pairKey(c.from, c.to)));
    // A word the caret is at the end of may still be half typed ("butto"):
    // left for the blur check (the answer is cached, so that costs nothing).
    const atCaret = wanted.filter((c) => caret === c.start + c.from.length);
    const applied = applyFixes(wanted.filter((c) => !atCaret.includes(c)));
    if (atCaret.length) {
      typed.current = true;
      lastChecked.current = null;
    } else if (applied.length) {
      // Our own change is not new typing: don't send it to Google again.
      lastChecked.current = valueRef.current;
    }
    if (applied.length && mounted.current) setLastFix(applied);
  };

  const onTextChange = (e) => {
    const text = e.target.value;
    const typedOne = text.length === valueRef.current.length + 1;
    valueRef.current = text;
    onChangeRef.current(text);
    if (!autoFix) return;
    typed.current = true;
    if (typedOne) fixFinishedWord(text, e.target.selectionStart);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => checkWithGoogle(true), GOOGLE_PAUSE_MS);
  };

  const onBlur = () => {
    clearTimeout(timer.current);
    if (autoFix) checkWithGoogle(false);
  };

  const undoLastFix = () => {
    if (!lastFix) return;
    for (const f of lastFix) rejected.current.add(pairKey(f.from, f.to));
    applyFixes(lastFix.map((f) => ({ from: f.to, to: f.from, start: f.start })));
    setLastFix(null);
  };

  const clearLastFix = useCallback(() => setLastFix(null), []);

  const toggleAutoFix = () => {
    setAutoFix((on) => {
      writeKey(LS_AUTOFIX, on ? '0' : '1');
      return !on;
    });
    clearTimeout(timer.current);
    setLastFix(null);
  };

  return { autoFix, toggleAutoFix, onTextChange, onBlur, lastFix, undoLastFix, clearLastFix };
}
