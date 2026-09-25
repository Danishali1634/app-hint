/**
 * @file A step's description textarea with two helpers:
 *   ✨ Improve  — AI rewrite (if an Anthropic key is set in Settings) or an
 *                offline tidy-up; one-click "Undo" restores the previous text.
 *   🔊 Listen   — reads the text in the chosen AI voice (Settings).
 * Used by the editor and by the preview's edit panel.
 */

import { useEffect, useState } from 'react';
import { Sparkles, Volume2, Square, Undo2, Loader2 } from 'lucide-react';
import { improveWithClaude, polishText } from '@/services/text/enhance';
import { previewSpeech, stopPreviewSpeech, isTTSSupported } from '@/services/audio/tts';
import { getAiKey } from '@/services/storage/settings';
import { useToast } from '@/hooks/useToast';

const TOOL_BUTTON_CLASS =
  'flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50';

/**
 * @param {{
 *   id?: string,
 *   value: string,
 *   onChange: (text: string) => void,
 *   label?: string,
 *   pageName?: string,
 *   action?: 'click' | 'look',
 *   rows?: number,
 * }} props
 */
export function DescriptionField({ id, value, onChange, label, pageName, action, rows = 4 }) {
  const { notify } = useToast();
  const [improving, setImproving] = useState(false);
  const [previous, setPrevious] = useState(null); // for Undo
  const [listening, setListening] = useState(false);

  useEffect(() => stopPreviewSpeech, []);

  const improve = async () => {
    const text = value.trim();
    if (!text) {
      notify('Write something first, then improve it', 'info');
      return;
    }
    const apiKey = getAiKey();
    setImproving(true);
    try {
      const improved = apiKey
        ? await improveWithClaude(text, { apiKey, label, pageName, action })
        : polishText(text);
      if (improved === value) {
        notify(apiKey ? 'Already reads well' : 'Tidied — add an AI key in Settings for rewrites');
      } else {
        setPrevious(value);
        onChange(improved);
        notify(apiKey ? 'Improved with AI' : 'Text tidied up', 'success');
      }
    } catch (error) {
      notify(error.message, 'error');
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
    <div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => {
          setPrevious(null);
          onChange(e.target.value);
        }}
        placeholder="Describe what to do here… (e.g. 'Yahan click karke aap graph data dekh sakte hain.')"
        rows={rows}
        className="w-full px-3 py-2.5 rounded-xl bg-paper-2 dark:bg-paper-2-dark border border-line dark:border-line-dark text-sm text-ink dark:text-ink-soft-dark outline-none focus:border-accent transition-colors resize-none"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button
          onClick={improve}
          disabled={improving}
          className={`${TOOL_BUTTON_CLASS} bg-accent/10 text-accent hover:bg-accent/15`}
          title={
            getAiKey()
              ? 'Rewrite with AI'
              : 'Tidy up the text (add an AI key in Settings for rewrites)'
          }
        >
          {improving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          Improve
        </button>
        {previous !== null && (
          <button
            onClick={() => {
              onChange(previous);
              setPrevious(null);
            }}
            className={`${TOOL_BUTTON_CLASS} text-ink-soft dark:text-ink-faint-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark`}
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
        )}
        {isTTSSupported() && (
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
        )}
      </div>
    </div>
  );
}
