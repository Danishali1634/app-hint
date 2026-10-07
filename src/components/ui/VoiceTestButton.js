/**
 * @file The "▶ Test" pill next to an AI voice (Settings, NarratorVoicePicker).
 * State comes from hooks/useVoiceTest: Test → Downloading 40% → Preparing… → Stop.
 */

import { Loader2, Play, Square } from 'lucide-react';

/**
 * @param {{
 *   voice: { id: string, name: string },
 *   testing: { id: string, status: string } | null,
 *   label: string,          // useVoiceTest().testLabel(voice)
 *   onClick: () => void,
 * }} props
 */
export function VoiceTestButton({ voice, testing, label, onClick }) {
  const active = testing?.id === voice.id;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold transition-colors ${
        active ? 'bg-accent text-white' : 'text-accent ring-1 ring-accent/30 hover:bg-accent/10'
      }`}
      aria-label={active ? `Stop testing ${voice.name}` : `Test ${voice.name}`}
    >
      {!active ? (
        <Play className="w-3.5 h-3.5" fill="currentColor" />
      ) : testing.status === 'playing' ? (
        <Square className="w-3 h-3" fill="currentColor" />
      ) : (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      )}
      {label}
    </button>
  );
}
