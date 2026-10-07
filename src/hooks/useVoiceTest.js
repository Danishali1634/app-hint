/**
 * @file "Test" buttons for the AI voices (Settings, NarratorVoicePicker).
 *
 *   const { testing, testVoice, stopTest, testLabel } = useVoiceTest();
 *   testVoice(voice, text, { rate, hinglishLookup })  // again = stop
 *   testVoice(voice, text, { rate, restart: true })   // always (re)plays: live previews
 *
 * Plays the AI voice itself (neuralVoice.aiVoiceUrl), never the browser
 * fallback, so you always hear the voice you are judging. The first test of a
 * voice downloads it (about 60 MB): `testing.progress` is 0–1 meanwhile.
 * Testing never selects a voice. Stops when the component unmounts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { aiVoiceUrl } from '@/services/audio/neuralVoice';
import { stopPreviewSpeech } from '@/services/audio/tts';

export function useVoiceTest() {
  // { id, status: 'loading' | 'playing', progress: 0–1 | null } | null
  const [testing, setTesting] = useState(null);
  const audio = useRef(null);
  const run = useRef(0); // bumps on every start/stop, so a stale test can't update state

  const stopTest = useCallback(() => {
    run.current += 1;
    audio.current?.pause();
    audio.current = null;
    setTesting(null);
  }, []);
  useEffect(() => stopTest, [stopTest]);

  /**
   * @param {{ id: string, name: string }} voice  an AI_VOICES entry
   * @param {string} text
   * @param {{ rate?: number, hinglishLookup?: boolean, restart?: boolean }} [options]
   */
  const testVoice = async (voice, text, { restart = false, ...options } = {}) => {
    if (testing?.id === voice.id && !restart) {
      stopTest();
      return;
    }
    stopTest();
    stopPreviewSpeech();
    const mine = ++run.current;
    const current = () => mine === run.current;
    setTesting({ id: voice.id, status: 'loading', progress: null });
    try {
      const url = await aiVoiceUrl(text, { voiceId: voice.id, ...options }, (progress) => {
        if (current()) setTesting({ id: voice.id, status: 'loading', progress });
      });
      if (!current()) return;
      const player = new Audio(url);
      audio.current = player;
      player.onended = () => current() && setTesting(null);
      setTesting({ id: voice.id, status: 'playing', progress: null });
      await player.play();
    } catch (error) {
      if (!current()) return;
      setTesting(null);
      toast.error(`Couldn't play ${voice.name}: ${error?.message || 'please try again'}`);
    }
  };

  /** The Test button's label: Test / Downloading 40% / Preparing… / Stop. */
  const testLabel = (voice) => {
    if (testing?.id !== voice.id) return 'Test';
    if (testing.status === 'playing') return 'Stop';
    if (testing.progress != null && testing.progress < 1) {
      return `Downloading ${Math.round(testing.progress * 100)}%`;
    }
    return 'Preparing…';
  };

  return { testing, testVoice, stopTest, testLabel };
}
