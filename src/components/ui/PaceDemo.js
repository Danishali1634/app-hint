/**
 * @file A miniature walkthrough that plays, on a loop, at the chosen pace —
 * shown under the "How fast should the walkthrough feel?" slider, so the pace
 * is SEEN, not guessed from "0.75×".
 *
 * It is built from the real thing: the same phase timings (utils/pace), the
 * same camera math (utils/camera), the same one persistent focus that morphs
 * from area to area (hooks/useFocusMotion), the same pointer class as the player, and captions in the narrator's
 * language (services/text/demoLines). Changing the pace restarts it at once.
 * The voice itself isn't played (its length doesn't depend on the pace); its
 * time is held like the player holds it, plus the after-voice pause.
 */

import { useEffect, useMemo, useState } from 'react';
import { MousePointer2 } from 'lucide-react';
import {
  OVERVIEW_VIEW,
  cameraTransform,
  computeFocusView,
  glideMs,
  projectRegion,
  regionCenter,
} from '@/utils/camera';
import { useFocusMotion } from '@/hooks/useFocusMotion';
import { afterVoicePauseMs, pacedTiming } from '@/utils/pace';
import { demoSteps } from '@/services/text/demoLines';

/** The three things the mini walkthrough points at (stage %): New, a screen card, Save. */
const TARGETS = [
  { x: 5, y: 5, w: 15, h: 10 },
  { x: 38, y: 34, w: 26, h: 28 },
  { x: 76, y: 80, w: 18, h: 11 },
];
/** Rough time the voice takes for a caption (ms) — not changed by the pace, as in the player. */
const speakMs = (text) => 700 + text.length * 45;

/**
 * @param {{ pace: number, language: 'en' | 'hinglish' | 'hindi' }} props
 */
export function PaceDemo({ pace, language }) {
  const captions = demoSteps(language);
  const T = pacedTiming(pace);
  const glide = glideMs(T.focus);
  // { i: step, phase: enter | focus | point | narrate | action | done }
  const [state, setState] = useState({ i: 0, phase: 'enter' });
  useEffect(() => setState({ i: 0, phase: 'enter' }), [pace, language]);

  const { i, phase } = state;
  useEffect(() => {
    const next = {
      enter: [T.enter + T.overview, { i, phase: 'focus' }],
      focus: [T.focus, { i, phase: 'point' }],
      point: [T.point, { i, phase: 'narrate' }],
      narrate: [speakMs(captions[i]), { i, phase: 'action' }],
      action: [
        T.clickAction + afterVoicePauseMs(pace),
        i < TARGETS.length - 1 ? { i: i + 1, phase: 'focus' } : { i, phase: 'done' },
      ],
      done: [T.overviewFirst + T.doneAutoResume, { i: 0, phase: 'enter' }],
    }[phase];
    const timer = setTimeout(() => setState(next[1]), next[0]);
    return () => clearTimeout(timer);
  }, [i, phase, pace, captions, glide, T]);

  const target = TARGETS[i];
  const focused = phase !== 'enter' && phase !== 'done';
  const targetView = useMemo(
    () => (focused ? computeFocusView(target) : OVERVIEW_VIEW),
    [focused, target],
  );
  const boxes = useMemo(() => [target], [target]);
  // One focus that morphs from area to area together with the camera.
  const { view, boxes: focusBoxes } = useFocusMotion({ view: targetView, boxes }, glide);
  const ring = projectRegion(focusBoxes[0], view);
  const pointer = regionCenter(projectRegion(target, targetView));
  const pointing = ['point', 'narrate', 'action'].includes(phase);
  const captionOn = phase === 'narrate' || phase === 'action';
  const stepMs = T.focus + T.point + speakMs(captions[1]) + T.clickAction + afterVoicePauseMs(pace);

  return (
    <div>
      <div
        className="relative w-full aspect-[16/9] overflow-hidden rounded-xl bg-paper-2 dark:bg-paper-2-dark ring-1 ring-black/5 dark:ring-white/10"
        style={{
          '--hs-glide': `${glide}ms`,
          '--hs-point': `${T.point}ms`,
        }}
        aria-label="A short demo walkthrough at this pace"
        role="img"
      >
        {/* The "screenshot": a tiny app, moved by the camera */}
        <div
          className="absolute inset-0"
          style={{ transformOrigin: '0 0', transform: cameraTransform(view) }}
        >
          <div className="absolute inset-x-0 top-0 h-[20%] bg-panel dark:bg-panel-dark" />
          <div
            className="absolute rounded-md bg-accent text-white text-[9px] font-bold flex items-center justify-center"
            style={box(TARGETS[0])}
          >
            New
          </div>
          {[10, 38, 66].map((x) => (
            <div
              key={x}
              className="absolute rounded-lg bg-panel dark:bg-panel-dark shadow-sm"
              style={{ left: `${x}%`, top: '34%', width: '24%', height: '28%' }}
            >
              <div className="m-[8%] h-[18%] w-[60%] rounded bg-ink/10 dark:bg-white/10" />
              <div className="mx-[8%] h-[12%] w-[80%] rounded bg-ink/5 dark:bg-white/5" />
            </div>
          ))}
          <div
            className="absolute rounded-md bg-ink/80 dark:bg-white/80 text-white dark:text-ink text-[9px] font-bold flex items-center justify-center"
            style={box(TARGETS[2])}
          >
            Save
          </div>
        </div>

        {/* Highlight ring and pointer, outside the camera so they stay crisp */}
        <div
          className="hs-focus-layer absolute rounded-lg ring-2 ring-[#FFD66B] shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
          style={{ ...box(ring), opacity: focused ? 1 : 0 }}
        />
        <MousePointer2
          className={`hs-cursor absolute w-4 h-4 text-ink dark:text-white drop-shadow fill-white dark:fill-ink ${
            phase === 'action' ? 'hs-cursor-press' : ''
          }`}
          style={{
            left: `${pointing ? pointer.x : 50}%`,
            top: `${pointing ? pointer.y : 60}%`,
            opacity: pointing ? 1 : 0,
          }}
          aria-hidden="true"
        />

        {/* Caption, in the narrator's language */}
        <div
          className={`absolute left-[4%] right-[4%] bottom-[4%] px-2.5 py-1.5 rounded-lg bg-panel/95 dark:bg-panel-dark/95 shadow-lg text-[11px] leading-snug text-ink dark:text-ink-soft-dark transition-opacity duration-300 ${
            captionOn ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="mr-1 font-bold text-accent">{i + 1}</span>
          {captions[i]}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-faint dark:text-ink-faint-dark">
        About {(stepMs / 1000).toFixed(1)} s per step at this pace, voice included.
      </p>
    </div>
  );
}

/** A region (stage %) as absolute-position styles. */
function box(r) {
  return { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` };
}
