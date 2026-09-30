/**
 * @file Full-screen, animated walkthrough player.
 *
 * GOAL: explain a feature so clearly that the viewer understands it even
 * without reading. Each step is told as a tiny story, not a slide:
 *
 *   "Here is the page"  →  zoom into the feature  →  pointer clicks it
 *   →  the next screen opens OUT OF that button   →  zoom into what matters there
 *
 * Used by all three playback entry points:
 *   - Editor "Preview" button
 *   - CoursePreviewPage   (#/preview/:id)
 *   - SharedCoursePage    (#/s/...  — share links)
 *   - EmbedPage           (#/e/... — inside an <iframe>, `embedded`)
 *
 * NEVER AUTOPLAYS: the player always opens paused on step 1 with a big ▶
 * button over the screenshot (like a YouTube video). Nothing moves or speaks
 * until the viewer clicks it.
 *
 * ONE CLICK, THEN IT PLAYS LIKE A VIDEO
 *   Nothing starts without a click. After ▶ every step flows into the next on
 *   its own — there is no Next button. The viewer pauses with ⏸ / Space and
 *   jumps around with the video-style Timeline (Timeline.js). After the last
 *   step the player stops on "That's the whole feature!".
 * It receives ready-made WalkthroughStep[] (media resolved to data URLs), so it
 * never touches IndexedDB and works the same for local and shared courses.
 *
 * PHASE STATE MACHINE (per step)
 *
 *   enter ─► overview ─► focus ─► point ─► narrate ─► action ─► exit ─► next step
 *                          │  (look steps skip "point")     │
 *                          │                                └─(last step)─► done
 *                          └─(no region: overview ─► narrate)
 *
 *   Timed phases advance with setTimeout (durations below). "narrate" ends when
 *   the voice/TTS finishes (useNarration), or after a pause if there's nothing
 *   to say. Pausing freezes the machine; resuming continues from the same phase.
 *   What each phase LOOKS like is defined in WalkthroughStage.js.
 *
 * STATE
 *   index        current step
 *   phase        see diagram
 *   runId        bumped on every (re)start of a step → remounts the stage so CSS
 *                enter animations replay, and restarts the phase effects
 *   playing      false = paused
 *   voiceMs      real recording lengths, learned while playing (for the Timeline)
 *   enterOrigin  stage % the NEXT step grows out of (the clicked button's spot)
 *
 * LAYOUT MODES
 *   variant 'fullscreen' (default) — covers the screen (editor Preview, embeds).
 *   variant 'inline'               — sits inside the page like a YouTube player
 *                                    (Preview page, share links). Nothing pops up.
 *   compact (automatic)            — when the player is shorter than
 *                                    COMPACT_MAX_HEIGHT (e.g. a 250px embed):
 *                                    YouTube-style — the screenshot fills the frame
 *                                    over a blurred copy of itself, title on top,
 *                                    controls on a gradient bar over the picture.
 *
 * FULLSCREEN: inline players and embeds get a ⤢ button (Fullscreen API on the
 * player root). In fullscreen the player is tall, so it leaves compact mode.
 *
 * ONE CONTINUOUS PIECE: once ▶ is pressed it flows through every step.
 *   - The previous screen animates OUT (`leaving`) while the next animates IN,
 *     out of the clicked button after a click step — no gap between steps.
 *   - Steps on the SAME screenshot keep the same stage (`stageKey`), so the
 *     camera and pointer glide from one area to the next without any cut.
 *
 * HOST CONTROL (editor preview studio): onIndexChange reports the frame,
 * onPlayingChange reports play/pause, requestedIndex jumps to a frame,
 * pauseRequest pauses it, hideControls hides the bottom bar.
 *
 * WEB / MOBILE VIEW (switch in the top bar, remembered in this browser):
 *   Web     the caption shows the whole description (as always).
 *   Mobile  as the Mobile video download: a long description is shown in
 *           parts, each while the voice says it (utils/captionParts), in a
 *           smaller font, never cut off; the picture gets the whole area
 *           (almost no padding around the stage).
 *
 * KEYBOARD: Space play/pause · ← → jump a step · Esc exit (ignored while typing)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, X, Maximize2, Minimize2, Monitor, Smartphone } from 'lucide-react';
import { useElementSize } from '@/hooks/useElementSize';
import { useImageAspectRatios } from '@/hooks/useImageAspectRatios';
import { hasNarration, useAiVoicePrefetch, useNarration } from '@/hooks/useNarration';
import { Spinner } from '@/components/ui/Spinner';
import { WALKTHROUGH_TIMING } from '@/constants';
import { CaptionContent, TextOnlyStage, WalkthroughStage } from './WalkthroughStage';
import { clickOrigin, isClickAction } from '@/utils/course';
import { readingPartMs, splitCaptionParts } from '@/utils/captionParts';
import { StepList, StepsToggle, Timeline } from './Timeline';
import { OutroCard } from './OutroCard';
import { clickCount, transitionFor } from '@/services/video/timeline';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

/** Phase durations, shared with the video export. */
const DURATION = WALKTHROUGH_TIMING;

/** The step whose screenshot sets the frame: the first sub-step of the same Global Step. */
function frameRefId(steps, index) {
  const groupId = steps[index]?.groupId;
  if (!groupId) return steps[index]?.id;
  let i = index;
  while (i > 0 && steps[i - 1].groupId === groupId && steps[i - 1].imageData) i--;
  return steps[i].id;
}

/** Screens narrower than this show the caption under the stage instead of floating. */
const FLOATING_CAPTION_MIN_WIDTH = 640;
/** Space reserved under the stage for a docked caption (px). */
const DOCKED_CAPTION_SPACE = 150;
/** Players shorter than this (px) switch to the compact layout (small embeds). */
const COMPACT_MAX_HEIGHT = 480;
/** Compact layout: height of the control bar over the picture (h-12) minus the
 *  stage area's padding — the caption keeps out of it. */
const COMPACT_CONTROL_BAR_PX = 42;
const SILENT_NARRATION = { mode: 'none', speaking: false, current: 0, duration: 0, part: 0 };
const VIEW_KEY = 'walkthroughView';
function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'mobile' ? 'mobile' : 'web';
  } catch {
    return 'web';
  }
}
function saveView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // private mode: just not remembered
  }
}

/** How long the previous screen stays on stage while the next one enters (ms). */
const LEAVE_MS = 650;

/** Compact control bar sits on a dark gradient, so its buttons are always light. */
const COMPACT_ICON_BUTTON_CLASS_DARK =
  'w-8 h-8 rounded-full flex items-center justify-center text-white/90 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0';

/**
 * @param {{
 *   steps: WalkthroughStep[],
 *   title: string,
 *   onExit: () => void,
 *   embedded?: boolean,   // inside an iframe: no exit button, Esc does nothing
 *   variant?: 'fullscreen' | 'inline',
 *   onIndexChange?: (index: number) => void,          // e.g. the preview filmstrip
 *   requestedIndex?: { index: number, nonce: number } | null, // jump there (new nonce = new request)
 *   onPlayingChange?: (playing: boolean) => void,       // e.g. open the editor when paused
 *   onInsertStep?: (position: number) => void,          // edit mode: "+" on the timeline boundaries
 *   pauseRequest?: number,                              // a new non-zero value pauses (e.g. "Edit" pressed)
 *   hideControls?: boolean,                             // the host renders its own progress UI
 *   hideStepList?: boolean,                             // no side list of steps: more room for the picture
 *   dockCaption?: boolean,                              // caption always UNDER the picture, never over it
 *   holdMs?: number,                                    // extra time on each step after it is read (tutorials: time to look)
 * }} props
 */
export function WalkthroughPlayer({
  steps,
  title,
  onExit,
  embedded = false,
  variant = 'fullscreen',
  onIndexChange,
  onPlayingChange,
  onInsertStep,
  requestedIndex = null,
  pauseRequest = 0,
  hideControls = false,
  hideStepList = false,
  dockCaption = false,
  holdMs = 0,
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('enter');
  const [runId, setRunId] = useState(0);
  const [playing, setPlaying] = useState(false); // never autoplay
  // False until the viewer presses Play the first time → shows the big ▶ overlay.
  const [hasStarted, setHasStarted] = useState(false);
  // Once started, the walkthrough flows through every step as one piece; the
  // viewer can pause at any time. (Nothing ever starts before the first ▶.)
  const autoAdvance = true;
  const [enterOrigin, setEnterOrigin] = useState(null);
  // Stage identity: bumps only when the SCREENSHOT changes. Consecutive steps on
  // the same screenshot keep the same stage, so the camera glides between areas.
  const [stageKey, setStageKey] = useState(0);
  const [continued, setContinued] = useState(false); // current step reuses the previous screenshot
  // The previous screen, kept on stage for LEAVE_MS while the next one enters,
  // so there's never a gap between steps.
  const [leaving, setLeaving] = useState(null);
  // Recording lengths by step id, learned as they play (makes the Timeline exact).
  const [voiceMs, setVoiceMs] = useState({});
  // After a timeline seek: where inside the step / phase playback continues.
  const [startOffset, setStartOffset] = useState(0); // ms into the step (playhead)
  const phaseSkipRef = useRef(0); // ms of the current timed phase already "watched"
  const narrationOffsetRef = useRef(0); // ms into the voice to start from

  const narration = useNarration();
  const { start: startNarration, stop: stopNarration, pause: pauseNarration } = narration;
  const { resume: resumeNarration } = narration;
  // The AI voice for every step is prepared while the player waits for ▶.
  const [view, setView] = useState(readView);
  const mobileView = view === 'mobile';
  const changeView = (next) => {
    setView(next);
    saveView(next);
  };
  useAiVoicePrefetch(steps, { captionParts: mobileView });
  const ratios = useImageAspectRatios(steps);
  const [stageAreaRef, stageArea] = useElementSize();
  const [rootRef, rootSize, rootNode] = useElementSize();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const hasImage = !!step?.imageData;
  const region = hasImage ? step.region : null;
  const isClick = !!region && isClickAction(step);
  const stepHasNarration = hasNarration(step);
  // The caption style follows the view, but never in the middle of a voice
  // (its text must keep matching what is being said): a switch made while a
  // step is narrated applies once that narration is over.
  const [captionMobile, setCaptionMobile] = useState(mobileView);
  useEffect(() => {
    if (phase !== 'narrate') setCaptionMobile(mobileView);
  }, [phase, mobileView]);
  // Mobile view: a long description is shown in parts, each while the voice
  // says it (utils/captionParts); without a voice, each part stays up for its
  // reading time. Web view: the whole description, as always.
  const captionParts = captionMobile ? splitCaptionParts(step?.text) : [];
  const [silentPart, setSilentPart] = useState(0);
  // Wait for the screenshot's real ratio before animating (camera math needs it).
  const ready = !!step && (!hasImage || ratios[step.id] != null);

  // ── Navigation ─────────────────────────────────────────────────────────────

  /**
   * Shows step `i`.
   * smooth = true (Next, auto-advance): the previous screen animates OUT while
   *   the next animates IN — out of the clicked button after a click step. If
   *   both steps use the same screenshot, nothing is swapped: the camera and
   *   pointer glide straight from the old area to the new one.
   * smooth = false (Prev, jumping via the progress bar): quick fade-in.
   */
  const goTo = useCallback(
    (i, { smooth = false } = {}) => {
      stopNarration();
      setStartOffset(0);
      phaseSkipRef.current = 0;
      narrationOffsetRef.current = 0;
      const from = steps[index];
      const to = steps[i];
      if (!to) return;
      const fromClick = !!from?.imageData && !!from.region && isClickAction(from);

      // Same screenshot — or another screenshot of the SAME Global Step (the same
      // page in another state): the camera glides straight on; a new screenshot
      // crossfades in inside the moving camera (WalkthroughStage), so all its
      // sub-steps feel like one page.
      const samePage =
        from?.imageData &&
        to.imageData &&
        (from.imageData === to.imageData || (from.groupId && from.groupId === to.groupId));
      if (smooth && i !== index && samePage) {
        setContinued(true);
        setLeaving(null);
        setEnterOrigin(null);
        setIndex(i);
        setPhase(to.region ? 'focus' : 'narrate');
        setRunId((r) => r + 1);
        return;
      }

      setContinued(false);
      setLeaving(
        smooth && from && i !== index
          ? { step: from, number: index + 1, key: stageKey, kind: fromClick ? 'click' : 'look' }
          : null,
      );
      setEnterOrigin(smooth && fromClick ? clickOrigin(from) : null);
      setStageKey((k) => k + 1);
      setIndex(i);
      setPhase('enter');
      setRunId((r) => r + 1);
    },
    [stopNarration, steps, index, stageKey],
  );

  const goNext = useCallback(() => {
    if (!isLast) goTo(index + 1, { smooth: true });
  }, [goTo, index, isLast]);

  const goPrev = useCallback(() => {
    if (index > 0) goTo(index - 1);
  }, [goTo, index]);

  // The leaving screen is removed once its exit animation has finished.
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  /** First click on ▶ (overlay or control bar). */
  const startPlayback = () => {
    setHasStarted(true);
    setPlaying(true);
  };

  /**
   * Timeline click: continue from that exact moment — even inside the step
   * that is playing. Keeps playing (or stays paused). The stage is remounted in
   * the target phase, so the camera shows exactly that moment.
   * @param {import('./Timeline').Moment} moment
   */
  const seekTo = (moment) => {
    const to = steps[moment.index];
    if (!to) return;
    stopNarration();
    const prev = steps[moment.index - 1];
    const prevClick = !!prev?.imageData && !!prev.region && isClickAction(prev);
    const early = moment.phase === 'enter' || moment.phase === 'overview';
    const entering = transitionFor(steps, moment.index) === 'enter';
    setLeaving(null);
    setContinued(!entering);
    setEnterOrigin(early && prevClick && entering ? clickOrigin(prev) : null);
    setStageKey((k) => k + 1);
    setIndex(moment.index);
    setPhase(moment.phase);
    phaseSkipRef.current = moment.phaseOffset;
    narrationOffsetRef.current = moment.phase === 'narrate' ? moment.phaseOffset : 0;
    setStartOffset(moment.stepOffset);
    setRunId((r) => r + 1);
  };

  const restart = () => {
    goTo(0);
    startPlayback();
  };

  const togglePlay = () => {
    if (!hasStarted) {
      startPlayback();
      return;
    }
    if (phase === 'done') {
      if (isLast) restart();
      else {
        goNext();
        setPlaying(true);
      }
      return;
    }
    setPlaying((p) => !p);
  };

  // Host requests (e.g. the preview filmstrip): jump to a frame. A request can
  // arrive before the frame exists (a step was just inserted and the steps are
  // still being rebuilt), so it stays pending until that frame is there.
  const handledJumpRef = useRef(null);
  useEffect(() => {
    if (!requestedIndex || handledJumpRef.current === requestedIndex.nonce) return;
    if (!steps[requestedIndex.index]) return; // not built yet — retry when steps change
    handledJumpRef.current = requestedIndex.nonce;
    if (requestedIndex.index !== index) goTo(requestedIndex.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedIndex?.nonce, steps]);

  // Tell the host which frame is showing.
  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  // Host can pause the player (e.g. the studio's Edit button).
  useEffect(() => {
    if (pauseRequest) setPlaying(false);
  }, [pauseRequest]);

  // ── Phase machine ──────────────────────────────────────────────────────────

  /** Moves from the current phase to the next one (see diagram in the header). */
  const advancePhase = useCallback(() => {
    switch (phase) {
      case 'enter':
        setPhase('overview');
        break;
      case 'overview':
        setPhase(region ? 'focus' : 'narrate');
        break;
      case 'focus':
        // On a continued screenshot the pointer already travelled with the camera.
        setPhase(isClick && !continued ? 'point' : 'narrate');
        break;
      case 'point':
        setPhase('narrate');
        break;
      case 'narrate':
        setPhase('action');
        break;
      case 'action':
      case 'done':
        if (autoAdvance && !isLast) goNext();
        else setPhase('done');
        break;
      default:
        break;
    }
  }, [phase, region, isClick, continued, autoAdvance, isLast, goNext]);

  /** How long the current phase lasts, or null if something else ends it. */
  const phaseDuration = (() => {
    switch (phase) {
      case 'enter':
        return DURATION.enter;
      case 'overview':
        // The very first screen gets a moment; later screens flow straight on.
        return index === 0 && !enterOrigin ? DURATION.overviewFirst : DURATION.overview;
      case 'focus':
        return DURATION.focus;
      case 'point':
        return DURATION.point;
      case 'narrate':
        if (stepHasNarration) return null; // voice ends it
        return captionParts.length > 1
          ? captionParts.reduce((sum, p) => sum + readingPartMs(p), 0)
          : DURATION.silentNarrate;
      case 'action':
        return (isClick ? DURATION.clickAction * clickCount(step) : DURATION.lookAction) + holdMs;
      case 'done':
        return autoAdvance && !isLast ? DURATION.doneAutoResume : null; // user ends it
      default:
        return null;
    }
  })();

  // Timed phases. Re-runs on every phase change; the cleanup cancels the
  // pending timer, so pausing or navigating can never fire a stale transition.
  useEffect(() => {
    if (!playing || !ready || phaseDuration == null) return;
    // After a seek the first timed phase is already partly watched.
    const skip = phaseSkipRef.current;
    phaseSkipRef.current = 0;
    const timer = setTimeout(advancePhase, Math.max(0, phaseDuration - skip));
    return () => clearTimeout(timer);
  }, [playing, ready, phaseDuration, advancePhase, runId]);

  // Narration: start once when a step enters "narrate"; it ends the phase.
  // Deliberately NOT depending on `playing` — pause/resume is handled below so
  // a paused recording continues where it stopped instead of restarting.
  useEffect(() => {
    if (phase !== 'narrate' || !stepHasNarration) return;
    const offsetMs = narrationOffsetRef.current;
    narrationOffsetRef.current = 0;
    startNarration(step, {
      offsetMs,
      captionParts: captionMobile,
      onEnd: () => setPhase('action'),
      onBlocked: () => setPlaying(false), // browser blocked autoplay → wait for Play
    });
    return () => stopNarration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, runId]);

  // No voice: step through the caption parts at reading speed.
  useEffect(() => setSilentPart(0), [phase, runId]);
  const silentPartText = captionParts[silentPart];
  const hasNextSilentPart = silentPart < captionParts.length - 1;
  useEffect(() => {
    if (phase !== 'narrate' || stepHasNarration || !playing || !hasNextSilentPart) return;
    const timer = setTimeout(() => setSilentPart((k) => k + 1), readingPartMs(silentPartText));
    return () => clearTimeout(timer);
  }, [phase, stepHasNarration, playing, hasNextSilentPart, silentPartText]);

  // Pause / resume the voice with the Play button.
  useEffect(() => {
    if (phase !== 'narrate') return;
    if (playing) resumeNarration();
    else pauseNarration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Remember a recording's real length once it is known.
  const knownDuration = narration.mode === 'recorded' ? narration.progress.duration : 0;
  useEffect(() => {
    if (!knownDuration || !step) return;
    const ms = Math.round(knownDuration * 1000);
    setVoiceMs((prev) => (prev[step.id] === ms ? prev : { ...prev, [step.id]: ms }));
  }, [knownDuration, step]);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  const canFullscreen =
    (embedded || variant === 'inline') &&
    typeof document !== 'undefined' &&
    !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  useEffect(() => {
    const sync = () =>
      setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    } else if (rootNode) {
      (rootNode.requestFullscreen || rootNode.webkitRequestFullscreen)?.call(rootNode);
    }
  };

  // ── Keyboard ───────────────────────────────────────────────────────────────
  // Registered once; reads the latest handlers through a ref so it never calls
  // an outdated closure.
  const keyHandlersRef = useRef(null);
  keyHandlersRef.current = { goNext, goPrev, togglePlay, onExit, embedded };

  useEffect(() => {
    const handleKeyDown = (e) => {
      const handlers = keyHandlersRef.current;
      // Never steal keys while someone is typing (e.g. the studio edit panel).
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      if (e.key === 'ArrowRight') handlers.goNext();
      if (e.key === 'ArrowLeft') handlers.goPrev();
      if (e.key === 'Escape' && !handlers.embedded) handlers.onExit?.();
      if (e.key === ' ') {
        e.preventDefault(); // don't scroll the page
        handlers.togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const isInline = variant === 'inline';
  const rootClass = isInline
    ? 'relative w-full h-full flex flex-col rounded-3xl overflow-hidden border border-line dark:border-line-dark bg-paper dark:bg-paper-dark shadow-premium'
    : 'fixed inset-0 z-50 bg-paper dark:bg-paper-dark flex flex-col';

  if (steps.length === 0) {
    return (
      <div className={`${rootClass} items-center justify-center`}>
        <div className="text-center">
          <p className="text-ink-soft dark:text-ink-soft-dark mb-4">No walkthrough steps yet.</p>
          {!embedded && onExit && (
            <button
              onClick={onExit}
              className="px-4 py-2 rounded-lg bg-accent text-white font-semibold"
            >
              Go back
            </button>
          )}
        </div>
      </div>
    );
  }

  const compact = rootSize.height > 0 && rootSize.height < COMPACT_MAX_HEIGHT;
  const canExit = !embedded && !isInline && !!onExit;

  // Fit a box with the screenshot's exact ratio into the available area.
  const floatingCaption = !compact && !dockCaption && stageArea.width >= FLOATING_CAPTION_MIN_WIDTH;
  const reserveDocked = !compact && !floatingCaption;
  // Sub-steps of one Global Step share its frame (the first screenshot's
  // proportions), so a screenshot change never resizes the stage.
  const ratio = ratios[frameRefId(steps, index)] ?? ratios[step.id] ?? 16 / 10;
  // The docked caption lives in its own fixed slot UNDER the measured area
  // (always rendered while docked), so the area never shrinks when it shows:
  // no need to subtract its space here (subtracting it too shrank the picture twice).
  const usableHeight = stageArea.height;
  const stageWidth = Math.max(0, Math.min(stageArea.width, usableHeight * ratio));
  const stageHeight = stageWidth / ratio;

  const narrationInfo = {
    mode: narration.mode,
    speaking: playing && phase === 'narrate' && narration.mode !== 'none',
    current: narration.progress.current,
    duration: narration.progress.duration,
    // Mobile view: the caption in parts; `part` = the one being said, after
    // the voice the last. (Web view: the whole text, `part` unused.)
    captionParts: captionMobile,
    part:
      phase === 'narrate'
        ? stepHasNarration
          ? narration.part
          : silentPart
        : Math.max(0, captionParts.length - 1),
  };
  const captionPhase = ['narrate', 'action', 'done'].includes(phase);
  const showDockedCaption = hasImage && reserveDocked && captionPhase;
  const showCompactCaption = hasImage && compact && captionPhase;
  const isFinished = phase === 'done' && isLast;
  const timelineProps = {
    steps,
    index,
    runKey: runId,
    startOffset,
    playing: playing && hasStarted && ready && !isFinished,
    finished: isFinished,
    voiceMs,
    onSeek: seekTo,
    onInsert: onInsertStep,
  };

  // The previous screen, animating out underneath the entering one.
  let leavingNode = null;
  if (leaving?.step.imageData && stageArea.width > 0) {
    const leavingRatio = ratios[leaving.step.id] ?? 16 / 10;
    const leavingWidth = Math.max(0, Math.min(stageArea.width, usableHeight * leavingRatio));
    leavingNode = (
      <div
        key={`leave-${leaving.key}`}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <WalkthroughStage
          step={leaving.step}
          stepNumber={leaving.number}
          phase="exit"
          width={leavingWidth}
          height={leavingWidth / leavingRatio}
          enterOrigin={null}
          narration={SILENT_NARRATION}
          floatingCaption={false}
        />
      </div>
    );
  }
  const FullscreenIcon = isFullscreen ? Minimize2 : Maximize2;

  // ── Compact layout (small embeds), YouTube-style ──────────────────────────
  if (compact) {
    return (
      <div
        ref={rootRef}
        className={`group/player ${isInline ? 'relative w-full h-full rounded-3xl' : 'fixed inset-0'} overflow-hidden bg-[#050507] text-white select-none`}
      >
        {/* Blurred copy of the screenshot fills the letterbox space */}
        {step.imageData && (
          <img
            src={step.imageData}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-40 pointer-events-none"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/70 pointer-events-none" />

        {/* Stage (above the control bar) */}
        <div
          ref={stageAreaRef}
          // Uses the full frame; the control bar floats over the picture.
          className="absolute inset-0 flex items-center justify-center p-1.5"
        >
          {leavingNode}
          {!ready || stageArea.width === 0 ? (
            <Spinner />
          ) : hasImage ? (
            <WalkthroughStage
              key={`stage-${stageKey}`}
              continued={continued}
              step={step}
              stepNumber={index + 1}
              phase={phase}
              width={stageWidth}
              height={stageHeight}
              enterOrigin={enterOrigin}
              narration={narrationInfo}
              // Placed next to the feature without covering it, and never
              // under the control bar (utils/captionPlacement).
              floatingCaption
              compactCaption
              areaSize={stageArea}
              reserveBottom={COMPACT_CONTROL_BAR_PX}
            />
          ) : (
            <TextOnlyStage
              key={`stage-${stageKey}`}
              step={step}
              stepNumber={index + 1}
              narration={narrationInfo}
            />
          )}
        </div>

        {/* Title + big ▶ before the first play */}
        {!hasStarted && ready && (
          <>
            <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-3 pt-2.5 pb-6 bg-gradient-to-b from-black/70 to-transparent">
              <span className="text-sm font-semibold truncate">{title}</span>
              <span className="flex-shrink-0 text-[11px] font-medium text-white/70 bg-white/10 rounded-full px-2 py-0.5">
                {steps.length} step{steps.length !== 1 ? 's' : ''}
              </span>
            </div>
            <button
              onClick={startPlayback}
              className="group absolute inset-0 z-20 flex items-center justify-center"
              aria-label="Play walkthrough"
            >
              <span className="w-16 h-16 rounded-full bg-accent flex items-center justify-center shadow-glow ring-8 ring-white/10 group-hover:scale-105 transition-transform duration-300">
                <Play className="w-7 h-7 ml-1" fill="currentColor" />
              </span>
            </button>
          </>
        )}

        {isFinished && (
          <OutroCard title={title} stepCount={steps.length} onRestart={restart} compact />
        )}

        {/* Control bar over the picture. While playing it fades out and comes
            back on hover/focus (like YouTube); when paused it always shows. */}
        <div
          className={`absolute inset-x-0 bottom-0 z-40 h-12 pt-2 flex items-center gap-1 px-1.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent transition-opacity duration-300 ${
            playing && hasStarted && phase !== 'done'
              ? 'opacity-0 group-hover/player:opacity-100 focus-within:opacity-100'
              : 'opacity-100'
          }`}
        >
          <button
            onClick={togglePlay}
            className={COMPACT_ICON_BUTTON_CLASS_DARK}
            aria-label={playing && phase !== 'done' ? 'Pause' : 'Play'}
          >
            {playing && phase !== 'done' ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
            )}
          </button>
          <Timeline {...timelineProps} dark className="flex-1 px-2" />
          {canFullscreen && (
            <button
              onClick={toggleFullscreen}
              className={COMPACT_ICON_BUTTON_CLASS_DARK}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              <FullscreenIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={rootClass}>
      {/* ── Top bar (hidden in compact embeds) ── */}
      {!compact && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 border-b border-line dark:border-line-dark flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {canExit && (
              <button
                onClick={onExit}
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
                aria-label="Exit walkthrough"
              >
                <X className="w-5 h-5 text-ink-soft dark:text-ink-soft-dark" />
              </button>
            )}
            <h2 className="text-sm font-semibold text-ink dark:text-ink-soft-dark truncate">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div
              role="radiogroup"
              aria-label="View"
              className="flex items-center p-0.5 rounded-lg border border-line dark:border-line-dark"
            >
              {[
                { value: 'web', label: 'Web', Icon: Monitor },
                { value: 'mobile', label: 'Mobile', Icon: Smartphone },
              ].map(({ value, label, Icon }) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={view === value}
                  onClick={() => changeView(value)}
                  title={
                    value === 'web'
                      ? 'Web view: the whole description in the caption'
                      : 'Mobile view: bigger picture, long descriptions in parts with the voice'
                  }
                  className={`h-7 px-2 rounded-md flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                    view === value
                      ? 'bg-accent text-white'
                      : 'text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            {canFullscreen && (
              <button
                onClick={toggleFullscreen}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                <FullscreenIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* ── Stage area (measured) ── */}
        <div
          className={`flex-1 min-h-0 min-w-0 flex flex-col items-center justify-center overflow-hidden ${
            compact ? 'p-2 gap-2' : mobileView ? 'p-1 sm:p-2 gap-2' : 'p-4 sm:p-8 gap-4'
          }`}
        >
          <div
            ref={stageAreaRef}
            className="relative w-full flex-1 min-h-0 flex items-center justify-center"
          >
            {leavingNode}
            {!ready || stageArea.width === 0 ? (
              <Spinner />
            ) : hasImage ? (
              <WalkthroughStage
                key={`stage-${stageKey}`}
                continued={continued}
                step={step}
                stepNumber={index + 1}
                phase={phase}
                width={stageWidth}
                height={stageHeight}
                enterOrigin={enterOrigin}
                narration={narrationInfo}
                floatingCaption={floatingCaption}
                areaSize={stageArea}
              />
            ) : (
              <TextOnlyStage
                key={`stage-${stageKey}`}
                step={step}
                stepNumber={index + 1}
                narration={narrationInfo}
              />
            )}

            {showCompactCaption && (
              <div className="hs-caption-in absolute left-2 right-2 bottom-2 z-20 flex justify-center pointer-events-none">
                <div className="w-[min(420px,100%)]">
                  <CaptionContent
                    step={step}
                    stepNumber={index + 1}
                    narration={narrationInfo}
                    compact
                  />
                </div>
              </div>
            )}

            {/* Big ▶ before the first play — nothing starts on its own */}
            {!hasStarted && ready && stageArea.width > 0 && (
              <div className="absolute inset-0 z-30 flex items-center justify-center">
                <button
                  onClick={startPlayback}
                  className="group flex flex-col items-center gap-3"
                  aria-label="Play walkthrough"
                >
                  <span
                    className={`rounded-full bg-accent text-white flex items-center justify-center shadow-glow ring-8 ring-accent/20 group-hover:scale-105 group-hover:ring-accent/30 transition-all duration-300 ${
                      compact ? 'w-14 h-14' : 'w-24 h-24'
                    }`}
                  >
                    <Play
                      className={compact ? 'w-6 h-6 ml-1' : 'w-10 h-10 ml-1.5'}
                      fill="currentColor"
                    />
                  </span>
                  {!compact && (
                    <span className="px-4 py-2 rounded-full bg-panel/90 dark:bg-panel-dark/90 backdrop-blur border border-line dark:border-line-dark shadow-premium text-sm font-semibold text-ink dark:text-ink-soft-dark">
                      Play walkthrough · {steps.length} step{steps.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </button>
              </div>
            )}

            {isFinished && (
              <OutroCard
                title={title}
                stepCount={steps.length}
                onRestart={restart}
                compact={compact}
              />
            )}
          </div>

          {reserveDocked && (
            <div
              className="w-[min(560px,100%)] flex-shrink-0"
              style={{ height: DOCKED_CAPTION_SPACE - 16 }}
            >
              {showDockedCaption && (
                <div className="hs-caption-in">
                  <CaptionContent step={step} stepNumber={index + 1} narration={narrationInfo} />
                </div>
              )}
            </div>
          )}
        </div>
        {!hideStepList && (
          <StepList
            steps={steps}
            index={index}
            voiceMs={voiceMs}
            onSeek={seekTo}
            // onClose={() => setStepsOpen(false)}
            className="hs-caption-in max-h-56 md:max-h-none md:w-72 lg:w-80 flex-shrink-0 border-t md:border-t-0 md:border-l border-line dark:border-line-dark"
          />
        )}
      </div>

      {/* ── Bottom controls ── */}
      <div className={`flex-shrink-0 px-4 sm:px-6 pb-5 pt-1 ${hideControls ? 'hidden' : ''}`}>
        <div className="max-w-4xl mx-auto flex items-center gap-3 sm:gap-4">
          <button
            onClick={togglePlay}
            className="w-11 h-11 flex-shrink-0 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent-dark transition-colors shadow-lg"
            aria-label={playing && phase !== 'done' ? 'Pause' : 'Play'}
          >
            {playing && phase !== 'done' ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </button>
          <Timeline {...timelineProps} className="flex-1" />
        </div>
      </div>
    </div>
  );
}
