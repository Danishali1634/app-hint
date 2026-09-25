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
 *   - EmbedPage           (#/embed/... — inside an <iframe>, `embedded`)
 *
 * NEVER AUTOPLAYS: the player always opens paused on step 1 with a big ▶
 * button over the screenshot (like a YouTube video). Nothing moves or speaks
 * until the viewer clicks it.
 *
 * THE VIEWER IS IN CONTROL
 *   Nothing ever starts without a click. Each step plays its story and then
 *   WAITS ("Manual" mode, the default): the Next button pulses until pressed.
 *   After the last step the player simply stops on "That's the whole feature!".
 *   The "Auto" toggle is optional for people who want it to continue by itself.
 * It receives ready-made WalkthroughStep[] (media resolved to data URLs), so it
 * never touches IndexedDB and works the same for local and shared courses.
 *
 * PHASE STATE MACHINE (per step)
 *
 *   enter ─► overview ─► focus ─► point ─► narrate ─► action ─► exit ─► next step
 *                          │  (look steps skip "point")     │
 *                          │                                └─(Manual mode or last step)─► done
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
 *   autoAdvance  "Auto" / "Manual" toggle (default Manual)
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
 * EDITOR PREVIEW EXTRAS: with onEditStep / onInsertAfter, the progress bar shows
 * numbered steps; pick one and use "Edit step N" / "Add step after N" in the top
 * bar to jump straight back into the editor at that point.
 *
 * KEYBOARD: ← previous · → next · Space play/pause · Esc exit
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  SkipBack,
  X,
  CheckCircle2,
  Pencil,
  Plus,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useElementSize } from '@/hooks/useElementSize';
import { useImageAspectRatios } from '@/hooks/useImageAspectRatios';
import { hasNarration, useNarration } from '@/hooks/useNarration';
import { Spinner } from '@/components/ui/Spinner';
import { WALKTHROUGH_TIMING } from '@/constants';
import { focusedCenter } from '@/utils/camera';
import { CaptionContent, TextOnlyStage, WalkthroughStage } from './WalkthroughStage';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

/** Phase durations, shared with the video export. */
const DURATION = WALKTHROUGH_TIMING;

/** Screens narrower than this show the caption under the stage instead of floating. */
const FLOATING_CAPTION_MIN_WIDTH = 640;
/** Space reserved under the stage for a docked caption (px). */
const DOCKED_CAPTION_SPACE = 150;
/** Players shorter than this (px) switch to the compact layout (small embeds). */
const COMPACT_MAX_HEIGHT = 480;

/** Compact control bar sits on a dark gradient, so its buttons are always light. */
const COMPACT_ICON_BUTTON_CLASS_DARK =
  'w-8 h-8 rounded-full flex items-center justify-center text-white/90 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0';
const COMPACT_ICON_BUTTON_CLASS =
  'w-8 h-8 rounded-full flex items-center justify-center text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors';
const ICON_BUTTON_CLASS =
  'w-10 h-10 rounded-full flex items-center justify-center text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors';

/**
 * @param {{
 *   steps: WalkthroughStep[],
 *   title: string,
 *   onExit: () => void,
 *   embedded?: boolean,   // inside an iframe: no exit button, Esc does nothing
 *   variant?: 'fullscreen' | 'inline',
 *   onEditStep?: (index: number) => void,     // editor preview only
 *   onInsertAfter?: (index: number) => void,  // editor preview only
 * }} props
 */
export function WalkthroughPlayer({
  steps,
  title,
  onExit,
  embedded = false,
  variant = 'fullscreen',
  onEditStep,
  onInsertAfter,
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('enter');
  const [runId, setRunId] = useState(0);
  const [playing, setPlaying] = useState(false); // never autoplay
  // False until the viewer presses Play the first time → shows the big ▶ overlay.
  const [hasStarted, setHasStarted] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false); // viewer decides when to continue
  const [enterOrigin, setEnterOrigin] = useState(null);

  const narration = useNarration();
  const { start: startNarration, stop: stopNarration, pause: pauseNarration } = narration;
  const { resume: resumeNarration } = narration;
  const ratios = useImageAspectRatios(steps);
  const [stageAreaRef, stageArea] = useElementSize();
  const [rootRef, rootSize, rootNode] = useElementSize();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const hasImage = !!step?.imageData;
  const region = hasImage ? step.region : null;
  const isClick = !!region && step.action !== 'look';
  const stepHasNarration = hasNarration(step);
  // Wait for the screenshot's real ratio before animating (camera math needs it).
  const ready = !!step && (!hasImage || ratios[step.id] != null);

  // ── Navigation ─────────────────────────────────────────────────────────────

  /** (Re)starts step `i` from its enter phase. `origin` = where it grows from. */
  const goTo = useCallback(
    (i, origin = null) => {
      stopNarration();
      setIndex(i);
      setPhase('enter');
      setEnterOrigin(origin);
      setRunId((r) => r + 1);
    },
    [stopNarration],
  );

  /** Next step; after a click step the next screen opens out of the clicked spot. */
  const goNext = useCallback(() => {
    if (isLast) return;
    goTo(index + 1, isClick ? focusedCenter(region) : null);
  }, [goTo, index, isLast, isClick, region]);

  const goPrev = useCallback(() => {
    if (index > 0) goTo(index - 1);
  }, [goTo, index]);

  /** First click on ▶ (overlay or control bar). */
  const startPlayback = () => {
    setHasStarted(true);
    setPlaying(true);
  };

  const replayStep = () => {
    goTo(index);
    startPlayback();
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
      // Finished waiting: Play means "continue".
      if (isLast) restart();
      else {
        goNext();
        setPlaying(true);
      }
      return;
    }
    setPlaying((p) => !p);
  };

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
        setPhase(isClick ? 'point' : 'narrate');
        break;
      case 'point':
        setPhase('narrate');
        break;
      case 'narrate':
        setPhase('action');
        break;
      case 'action':
        setPhase(autoAdvance && !isLast ? 'exit' : 'done');
        break;
      case 'exit':
        goNext();
        break;
      case 'done':
        if (autoAdvance && !isLast) setPhase('exit');
        break;
      default:
        break;
    }
  }, [phase, region, isClick, autoAdvance, isLast, goNext]);

  /** How long the current phase lasts, or null if something else ends it. */
  const phaseDuration = (() => {
    switch (phase) {
      case 'enter':
        return DURATION.enter;
      case 'overview':
        return index === 0 || !enterOrigin ? DURATION.overviewFirst : DURATION.overview;
      case 'focus':
        return DURATION.focus;
      case 'point':
        return DURATION.point;
      case 'narrate':
        return stepHasNarration ? null : DURATION.silentNarrate; // voice ends it
      case 'action':
        return isClick ? DURATION.clickAction : DURATION.lookAction;
      case 'exit':
        return isClick ? DURATION.exitClick : DURATION.exitLook;
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
    const timer = setTimeout(advancePhase, phaseDuration);
    return () => clearTimeout(timer);
  }, [playing, ready, phaseDuration, advancePhase, runId]);

  // Narration: start once when a step enters "narrate"; it ends the phase.
  // Deliberately NOT depending on `playing` — pause/resume is handled below so
  // a paused recording continues where it stopped instead of restarting.
  useEffect(() => {
    if (phase !== 'narrate' || !stepHasNarration) return;
    startNarration(step, {
      onEnd: () => setPhase('action'),
      onBlocked: () => setPlaying(false), // browser blocked autoplay → wait for Play
    });
    return () => stopNarration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, runId]);

  // Pause / resume the voice with the Play button.
  useEffect(() => {
    if (phase !== 'narrate') return;
    if (playing) resumeNarration();
    else pauseNarration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

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
      if (e.key === 'ArrowRight') handlers.goNext();
      if (e.key === 'ArrowLeft') handlers.goPrev();
      if (e.key === 'Escape' && !handlers.embedded) handlers.onExit();
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
  const canEdit = !!onEditStep && !compact;

  // Fit a box with the screenshot's exact ratio into the available area.
  const floatingCaption = !compact && stageArea.width >= FLOATING_CAPTION_MIN_WIDTH;
  const reserveDocked = !compact && !floatingCaption;
  const ratio = ratios[step.id] ?? 16 / 10;
  const usableHeight = stageArea.height - (reserveDocked ? DOCKED_CAPTION_SPACE : 0);
  const stageWidth = Math.max(0, Math.min(stageArea.width, usableHeight * ratio));
  const stageHeight = stageWidth / ratio;

  const narrationInfo = {
    mode: narration.mode,
    speaking: playing && phase === 'narrate' && narration.mode !== 'none',
    current: narration.progress.current,
    duration: narration.progress.duration,
  };
  const captionPhase = ['narrate', 'action', 'done'].includes(phase);
  const showDockedCaption = hasImage && reserveDocked && captionPhase;
  const showCompactCaption = hasImage && compact && captionPhase;
  const isFinished = phase === 'done' && isLast;
  const waitingForNext = phase === 'done' && !isLast;
  const iconButton = compact ? COMPACT_ICON_BUTTON_CLASS : ICON_BUTTON_CLASS;
  const FullscreenIcon = isFullscreen ? Minimize2 : Maximize2;

  // ── Compact layout (small embeds), YouTube-style ──────────────────────────
  if (compact) {
    return (
      <div
        ref={rootRef}
        className={`${isInline ? 'relative w-full h-full rounded-3xl' : 'fixed inset-0'} overflow-hidden bg-[#050507] text-white select-none`}
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
          className="absolute inset-x-0 top-0 bottom-10 flex items-center justify-center px-2 pt-2 pb-1"
        >
          {!ready || stageArea.width === 0 ? (
            <Spinner />
          ) : hasImage ? (
            <WalkthroughStage
              key={`${index}-${runId}`}
              step={step}
              stepNumber={index + 1}
              phase={phase}
              width={stageWidth}
              height={stageHeight}
              enterOrigin={enterOrigin}
              narration={narrationInfo}
              floatingCaption={false}
            />
          ) : (
            <TextOnlyStage
              key={`${index}-${runId}`}
              step={step}
              stepNumber={index + 1}
              narration={narrationInfo}
            />
          )}
          {showCompactCaption && (
            <div className="hs-caption-in absolute left-2 right-2 bottom-2 z-20 flex justify-center pointer-events-none">
              <div className="w-[min(460px,100%)]">
                <CaptionContent
                  step={step}
                  stepNumber={index + 1}
                  narration={narrationInfo}
                  compact
                />
              </div>
            </div>
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
          <div className="hs-caption-in absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-black/70 backdrop-blur border border-white/10 pl-3 pr-1.5 py-1.5">
            <CheckCircle2 className="w-4 h-4 text-teal-dark flex-shrink-0" />
            <span className="text-xs font-semibold whitespace-nowrap">That&apos;s it!</span>
            <button
              onClick={restart}
              className="px-2.5 py-1 rounded-full bg-accent text-xs font-semibold hover:bg-accent-dark transition-colors whitespace-nowrap"
            >
              Watch again
            </button>
          </div>
        )}

        {/* Control bar over the picture */}
        <div className="absolute inset-x-0 bottom-0 z-40 h-10 flex items-center gap-1 px-1.5 bg-gradient-to-t from-black/90 to-black/50 backdrop-blur-sm">
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
          <button
            onClick={goPrev}
            disabled={index === 0}
            className={COMPACT_ICON_BUTTON_CLASS_DARK}
            aria-label="Previous step"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goNext}
            disabled={isLast}
            className={`${COMPACT_ICON_BUTTON_CLASS_DARK} ${waitingForNext ? 'hs-attention text-accent-ink-dark' : ''}`}
            aria-label="Next step"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {/* Segmented progress: one segment per step, click to jump */}
          <div className="flex-1 flex items-center gap-1 px-2 min-w-0">
            {steps.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                className="flex-1 h-4 flex items-center group"
                aria-label={`Go to step ${i + 1}`}
                title={`Step ${i + 1}${s.label ? `: ${s.label}` : ''}`}
              >
                <span
                  className={`w-full h-1 rounded-full transition-colors group-hover:h-1.5 ${
                    i < index ? 'bg-accent/70' : i === index ? 'bg-accent' : 'bg-white/25'
                  }`}
                />
              </button>
            ))}
          </div>
          <span className="text-[11px] font-mono text-white/70 px-1">
            {index + 1}/{steps.length}
          </span>
          <button
            onClick={replayStep}
            className={COMPACT_ICON_BUTTON_CLASS_DARK}
            aria-label="Replay this step"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
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
            {canEdit && (
              <>
                <button
                  onClick={() => onEditStep(index)}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-line dark:border-line-dark text-xs font-semibold text-ink dark:text-ink-soft-dark hover:border-accent hover:text-accent transition-colors"
                  title="Close the preview and edit this step"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit step {index + 1}
                </button>
                {onInsertAfter && (
                  <button
                    onClick={() => onInsertAfter(index)}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/15 transition-colors"
                    title="Close the preview and add a new step right after this one"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add step after {index + 1}
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => setAutoAdvance(!autoAdvance)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                autoAdvance
                  ? 'bg-teal text-white'
                  : 'bg-paper-2 dark:bg-paper-2-dark text-ink-soft dark:text-ink-soft-dark'
              }`}
              title="Auto: go to the next step by itself. Manual: wait for Next."
            >
              {autoAdvance ? 'Auto' : 'Manual'}
            </button>
            <span className="hidden sm:inline text-xs text-ink-faint dark:text-ink-faint-dark font-mono">
              {index + 1} / {steps.length}
            </span>
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

      {/* ── Stage area (measured) ── */}
      <div
        className={`flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden ${
          compact ? 'p-2 gap-2' : 'p-4 sm:p-8 gap-4'
        }`}
      >
        <div
          ref={stageAreaRef}
          className="relative w-full flex-1 min-h-0 flex items-center justify-center"
        >
          {!ready || stageArea.width === 0 ? (
            <Spinner />
          ) : hasImage ? (
            <WalkthroughStage
              key={`${index}-${runId}`}
              step={step}
              stepNumber={index + 1}
              phase={phase}
              width={stageWidth}
              height={stageHeight}
              enterOrigin={enterOrigin}
              narration={narrationInfo}
              floatingCaption={floatingCaption}
            />
          ) : (
            <TextOnlyStage
              key={`${index}-${runId}`}
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
            <div
              className={`hs-caption-in absolute top-0 left-1/2 -translate-x-1/2 z-30 flex items-center rounded-2xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark shadow-2xl ${
                compact ? 'gap-2 px-3 py-2' : 'gap-3 px-4 py-3'
              }`}
            >
              <CheckCircle2 className="w-5 h-5 text-teal dark:text-teal-dark flex-shrink-0" />
              {!compact && (
                <span className="text-sm font-semibold text-ink dark:text-ink-soft-dark whitespace-nowrap">
                  That&apos;s the whole feature!
                </span>
              )}
              <button
                onClick={restart}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs sm:text-sm font-semibold hover:bg-accent-dark transition-colors whitespace-nowrap"
              >
                Watch again
              </button>
            </div>
          )}
        </div>

        {showDockedCaption && (
          <div className="hs-caption-in w-[min(560px,100%)] flex-shrink-0">
            <CaptionContent step={step} stepNumber={index + 1} narration={narrationInfo} />
          </div>
        )}
      </div>

      {/* ── Bottom controls ── */}
      <div className={`flex-shrink-0 ${compact ? 'px-2 pb-2' : 'px-4 sm:px-6 pb-6 pt-2'}`}>
        <div
          className={
            compact
              ? 'flex items-center justify-between gap-2'
              : 'max-w-4xl mx-auto flex flex-col items-center gap-4'
          }
        >
          {/* Progress: numbered steps in the editor preview, dots elsewhere */}
          <div className="flex items-center justify-center gap-2">
            {steps.map((s, i) =>
              canEdit ? (
                <button
                  key={s.id}
                  onClick={() => goTo(i)}
                  className={`h-7 min-w-7 px-2 rounded-full text-xs font-semibold transition-all ${
                    i === index
                      ? 'bg-accent text-white shadow-glow'
                      : 'bg-paper-2 dark:bg-paper-2-dark text-ink-soft dark:text-ink-faint-dark hover:text-accent'
                  }`}
                  title={`Step ${i + 1}${s.label ? `: ${s.label}` : ''}`}
                  aria-label={`Go to step ${i + 1}`}
                >
                  {i + 1}
                </button>
              ) : (
                <button
                  key={s.id}
                  onClick={() => goTo(i)}
                  className={`h-2 rounded-full transition-all duration-500 ${
                    i === index
                      ? 'w-8 bg-accent'
                      : i < index
                        ? 'w-2 bg-accent/50'
                        : 'w-2 bg-line dark:bg-line-dark hover:bg-ink-faint'
                  }`}
                  aria-label={`Go to step ${i + 1}`}
                />
              ),
            )}
          </div>

          <div className="flex items-center justify-center gap-1 sm:gap-3">
            {!compact && (
              <button onClick={restart} className={iconButton} aria-label="Start over">
                <SkipBack className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={goPrev}
              disabled={index === 0}
              className={iconButton}
              aria-label="Previous step"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={togglePlay}
              className={`rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent-dark transition-colors shadow-lg ${
                compact ? 'w-9 h-9' : 'w-14 h-14'
              }`}
              aria-label={playing && phase !== 'done' ? 'Pause' : 'Play'}
            >
              {playing && phase !== 'done' ? (
                <Pause className={compact ? 'w-4 h-4' : 'w-6 h-6'} />
              ) : (
                <Play className={compact ? 'w-4 h-4 ml-0.5' : 'w-6 h-6 ml-1'} />
              )}
            </button>
            <button
              onClick={goNext}
              disabled={isLast}
              className={`${iconButton} ${waitingForNext ? 'hs-attention text-accent' : ''}`}
              aria-label="Next step"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button onClick={replayStep} className={iconButton} aria-label="Replay this step">
              <RotateCcw className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
            </button>
          </div>

          {compact && (
            <span className="text-[11px] text-ink-faint dark:text-ink-faint-dark font-mono">
              {index + 1}/{steps.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
