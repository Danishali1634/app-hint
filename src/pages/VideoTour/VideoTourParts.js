/**
 * @file Pieces of the video tour builder (pages/VideoTour/VideoTourPage):
 *
 *   GuideBar        the one "what to do now" line + a 1·2·3·4 progress pill
 *   VideoControls   play / pause · scrubber with one marker per picture · time;
 *                   cut parts striped (click → put back), the part being cut red
 *   VideoCutBar     "Cut a part" → drag the red handles → "Remove"
 *   QuickStepEditor Click / Look / Type + description, floating next to a new box
 *   VideoStepList   the steps as a playlist: title first, drag to reorder live
 *   VideoStepPanel  Click / Look / Type + description of the step being edited,
 *                   "Next step on this picture" and "Done, back to video"
 *
 * They only render and report; the page owns the steps and the video.
 */

import { useEffect, useRef } from 'react';
import { useSortableList } from '@/hooks/useSortableList';
import {
  Play,
  Pause,
  AlertCircle,
  Trash2,
  MousePointerClick,
  Eye,
  TextCursorInput,
  Check,
  Film,
  Plus,
  ArrowLeft,
  Loader2,
  Scissors,
  X,
  GripVertical,
} from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { DescriptionField } from '@/components/course/DescriptionField';
import { getStepAction, getStepTargets } from '@/utils/course';
import { formatDuration } from '@/utils';
import { keptDuration, MIN_CUT_SEC } from '@/services/video/cuts';

/** @typedef {import('@/types').Step} Step */
/** @typedef {import('@/services/video/cuts').VideoCut} VideoCut */

const SEEK_STEP_SEC = 5;
/** Removed parts of the scrubber (danger red). */
const CUT_STRIPES =
  'repeating-linear-gradient(45deg, rgba(229,72,77,0.75) 0 3px, transparent 3px 6px)';

const ACTIONS = [
  { value: 'click', Icon: MousePointerClick, text: 'Click', tip: 'The viewer clicks the box' },
  { value: 'look', Icon: Eye, text: 'Look', tip: 'Just point at it, no click' },
  { value: 'type', Icon: TextCursorInput, text: 'Type', tip: 'The viewer types into it' },
];

/** What the description box asks for, per action. */
const DESCRIBE_PLACEHOLDER = {
  click: 'What should the viewer click? e.g. "Click Save to keep your changes"',
  look: 'What should the viewer notice? e.g. "Your total shows here"',
  type: 'What should the viewer type? e.g. "Type your email address"',
};

/** The numbered stages of making one step (shown in the GuideBar pill). */
const STAGES = ['Find the moment', 'Add a feature', 'Draw a box', 'Describe it'];

/**
 * Runs of consecutive steps that share a picture (same imageId).
 * @param {Step[]} steps  in video order
 * @returns {{ imageId: string | null, videoTime: number, items: { step: Step, number: number }[] }[]}
 */
export function groupByPicture(steps) {
  const groups = [];
  steps.forEach((step, i) => {
    const last = groups[groups.length - 1];
    const item = { step, number: i + 1 };
    if (last && step.imageId && last.imageId === step.imageId) last.items.push(item);
    else groups.push({ imageId: step.imageId || null, videoTime: step.videoTime, items: [item] });
  });
  return groups;
}

/** "Feature 2" or "Features 2–3". */
const stepsLabel = (items) =>
  items.length === 1
    ? `Feature ${items[0].number}`
    : `Features ${items[0].number}–${items[items.length - 1].number}`;

/**
 * The single "what to do now" line above the video / picture.
 * @param {{
 *   stage: number | null,             // 1–4: current stage; 5 = all done; null = no pill
 *   text: string,
 *   tone?: 'info' | 'done' | 'problem' | 'busy',
 *   action?: import('react').ReactNode, // a small button on the right
 * }} props
 */
export function GuideBar({ stage, text, tone = 'info', action = null }) {
  const toneClass = {
    info: 'border-accent/30 bg-accent-soft/70 dark:bg-accent-soft-dark/40 text-ink dark:text-ink-soft-dark',
    done: 'border-teal/30 bg-teal-soft dark:bg-teal-soft-dark text-ink dark:text-ink-soft-dark',
    problem: 'border-danger/40 bg-danger/10 text-ink dark:text-ink-soft-dark',
    busy: 'border-line dark:border-line-dark bg-paper-2 dark:bg-paper-2-dark text-ink-soft dark:text-ink-soft-dark',
  }[tone];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 px-3 py-2 rounded-xl border flex-shrink-0 min-h-[44px] ${toneClass}`}
    >
      {stage && (
        <ol
          className="flex items-center gap-1 flex-shrink-0"
          aria-label={`Stage ${Math.min(stage, 4)} of 4`}
        >
          {STAGES.map((name, i) => {
            const n = i + 1;
            const done = n < stage;
            const current = n === stage;
            return (
              <li
                key={name}
                title={name}
                className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  current
                    ? 'bg-accent text-white'
                    : done
                      ? 'bg-teal dark:bg-teal-dark text-white'
                      : 'bg-panel dark:bg-panel-dark text-ink-faint dark:text-ink-faint-dark border border-line dark:border-line-dark'
                }`}
              >
                {done ? <Check className="w-3 h-3" /> : n}
              </li>
            );
          })}
        </ol>
      )}
      <p className="flex items-center gap-1.5 text-sm font-semibold mr-auto min-w-0">
        {tone === 'problem' && <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />}
        {tone === 'busy' && <Loader2 className="w-4 h-4 animate-spin text-accent flex-shrink-0" />}
        <span>{text}</span>
      </p>
      {action}
    </div>
  );
}

/** Small "← Video" button for the GuideBar. */
export function BackToVideoButton({ onClick }) {
  return (
    <Tooltip label="Back to the video">
      <button
        onClick={onClick}
        className="flex items-center gap-1 px-2 h-7 rounded-lg text-xs font-semibold text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark flex-shrink-0"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Video
      </button>
    </Tooltip>
  );
}

/** First few words of a description. */
function firstWords(text, count = 8) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  return words.length > count ? `${words.slice(0, count).join(' ')}…` : words.join(' ');
}

/**
 * @param {{
 *   duration: number,
 *   time: number,
 *   playing: boolean,
 *   steps: Step[],
 *   activeId: string | null,
 *   cuts?: VideoCut[],                 // removed parts (striped; click one to put it back)
 *   cutRange?: VideoCut | null,        // the part being chosen for cutting (red, two handles)
 *   onCutRangeChange?: (range: VideoCut, moved: 'start' | 'end') => void,
 *   onRestoreCut?: (index: number) => void,
 *   onTogglePlay: () => void,
 *   onSeek: (seconds: number) => void,
 *   onPickStep: (step: Step) => void,
 * }} props
 */
export function VideoControls({
  duration,
  time,
  playing,
  steps,
  activeId,
  cuts = [],
  cutRange = null,
  onCutRangeChange,
  onRestoreCut,
  onTogglePlay,
  onSeek,
  onPickStep,
}) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const handleRef = useRef(null); // 'start' | 'end' while dragging a cut handle
  const pct = (t) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);

  const timeFromPointer = (clientX) => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || !duration) return null;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * duration;
  };
  const seekFromPointer = (clientX) => {
    const t = timeFromPointer(clientX);
    if (t !== null) onSeek(t);
  };

  // Dragging a handle of the red part: it never crosses the other handle.
  const moveHandle = (clientX) => {
    const which = handleRef.current;
    const t = timeFromPointer(clientX);
    if (!which || t === null || !cutRange) return;
    const range =
      which === 'start'
        ? { start: Math.min(t, cutRange.end - MIN_CUT_SEC), end: cutRange.end }
        : { start: cutRange.start, end: Math.max(t, cutRange.start + MIN_CUT_SEC) };
    onCutRangeChange?.(
      { start: Math.max(0, range.start), end: Math.min(duration, range.end) },
      which,
    );
  };

  const cutHandle = (which) => (
    <div
      role="slider"
      tabIndex={0}
      aria-label={which === 'start' ? 'Start of the part to cut' : 'End of the part to cut'}
      aria-valuetext={formatDuration(cutRange[which])}
      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-7 rounded-md bg-danger border-2 border-white dark:border-panel-dark shadow cursor-ew-resize touch-none flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-danger/40 z-10"
      style={{ left: `${pct(cutRange[which])}%` }}
      onPointerDown={(e) => {
        e.stopPropagation();
        handleRef.current = which;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => handleRef.current === which && moveHandle(e.clientX)}
      onPointerUp={() => (handleRef.current = null)}
      onPointerCancel={() => (handleRef.current = null)}
      onKeyDown={(e) => {
        const delta = e.key === 'ArrowRight' ? 0.5 : e.key === 'ArrowLeft' ? -0.5 : 0;
        if (!delta) return;
        e.preventDefault();
        const t = cutRange[which] + delta;
        const range =
          which === 'start'
            ? { start: Math.max(0, Math.min(t, cutRange.end - MIN_CUT_SEC)), end: cutRange.end }
            : {
                start: cutRange.start,
                end: Math.min(duration, Math.max(t, cutRange.start + MIN_CUT_SEC)),
              };
        onCutRangeChange?.(range, which);
      }}
    >
      <span className="w-0.5 h-3 rounded bg-white/80" aria-hidden="true" />
    </div>
  );

  return (
    <div className="flex items-center gap-3 px-1">
      <Tooltip label={playing ? 'Pause' : 'Play'} shortcut="Space">
        <button
          onClick={onTogglePlay}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-accent text-white hover:bg-accent-dark transition-colors flex-shrink-0"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
      </Tooltip>

      <div className="flex-1 min-w-0">
        {/* One marker per picture (steps on the same picture share it) */}
        <div className="relative h-4">
          {groupByPicture(steps).map((group) => {
            const first = group.items[0].step;
            const active = group.items.some((item) => item.step.id === activeId);
            return (
              <div
                key={first.id}
                className="absolute top-0 -translate-x-1/2"
                style={{ left: `${pct(group.videoTime)}%` }}
              >
                <Tooltip label={`${stepsLabel(group.items)} · ${formatDuration(group.videoTime)}`}>
                  <button
                    onClick={() => onPickStep(first)}
                    className={`w-2.5 h-3.5 rounded-sm transition-transform hover:scale-125 ${
                      active ? 'bg-accent ring-2 ring-accent/30' : 'bg-accent/60 hover:bg-accent'
                    }`}
                    aria-label={`Go to ${stepsLabel(group.items).toLowerCase()}`}
                  />
                </Tooltip>
              </div>
            );
          })}
        </div>
        {/* Scrubber */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Video position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={formatDuration(time)}
          className={`relative flex items-center cursor-pointer touch-none outline-none group focus-visible:ring-2 focus-visible:ring-accent/40 rounded ${
            cuts.length || cutRange ? 'h-7' : 'h-5'
          }`}
          onPointerDown={(e) => {
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromPointer(e.clientX);
          }}
          onPointerMove={(e) => draggingRef.current && seekFromPointer(e.clientX)}
          onPointerUp={() => (draggingRef.current = false)}
          onPointerCancel={() => (draggingRef.current = false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') onSeek(Math.min(duration, time + SEEK_STEP_SEC));
            else if (e.key === 'ArrowLeft') onSeek(Math.max(0, time - SEEK_STEP_SEC));
            else return;
            e.preventDefault();
          }}
        >
          <div className="w-full h-1.5 rounded-full bg-line dark:bg-line-dark overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${pct(time)}%` }} />
          </div>
          {/* Removed parts: striped blocks; clicking one puts it back */}
          {cuts.map((cut, i) => (
            <div
              key={`${cut.start}-${cut.end}`}
              className="absolute inset-y-1"
              style={{ left: `${pct(cut.start)}%`, width: `${pct(cut.end) - pct(cut.start)}%` }}
            >
              <Tooltip
                label={`Cut ${formatDuration(cut.start)}–${formatDuration(cut.end)} · click to put it back`}
                className="block w-full h-full"
              >
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onRestoreCut?.(i)}
                  className="block w-full h-full min-w-[6px] rounded bg-danger/15 ring-1 ring-danger/40 hover:bg-danger/30"
                  style={{ backgroundImage: CUT_STRIPES }}
                  aria-label={`Put back ${formatDuration(cut.start)} to ${formatDuration(cut.end)}`}
                />
              </Tooltip>
            </div>
          ))}
          {/* The part being chosen: red, with a handle at each end */}
          {cutRange && (
            <>
              <div
                className="absolute inset-y-1 rounded bg-danger/30 ring-2 ring-danger pointer-events-none"
                style={{
                  left: `${pct(cutRange.start)}%`,
                  width: `${pct(cutRange.end) - pct(cutRange.start)}%`,
                }}
                aria-hidden="true"
              />
              {cutHandle('start')}
              {cutHandle('end')}
            </>
          )}
          {!cutRange && (
            <div
              className="absolute w-3.5 h-3.5 -ml-[7px] rounded-full bg-accent border-2 border-white dark:border-panel-dark shadow group-hover:scale-110 transition-transform pointer-events-none"
              style={{ left: `${pct(time)}%` }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      <span className="text-xs font-semibold tabular-nums text-ink-soft dark:text-ink-soft-dark whitespace-nowrap flex-shrink-0">
        {formatDuration(time)} / {formatDuration(duration)}
      </span>
    </div>
  );
}

/**
 * Cutting the video in one go: "Cut a part" puts a red part on the scrubber
 * at the current moment; drag its two handles over what should go (the video
 * shows the frame under the handle), then "Remove this part". Parts already
 * cut are striped on the scrubber; clicking one puts it back.
 * @param {{
 *   duration: number,
 *   cuts: VideoCut[],
 *   cutRange: VideoCut | null,
 *   disabled?: boolean,
 *   onStartCut: () => void,
 *   onApplyCut: () => void,
 *   onCancelCut: () => void,
 * }} props
 */
export function VideoCutBar({
  duration,
  cuts,
  cutRange,
  disabled = false,
  onStartCut,
  onApplyCut,
  onCancelCut,
}) {
  const buttonClass =
    'flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  if (cutRange) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-1">
        <button
          onClick={onApplyCut}
          disabled={disabled}
          className={`${buttonClass} bg-danger text-white hover:bg-danger/90`}
        >
          <Scissors className="w-3.5 h-3.5" /> Remove {formatDuration(cutRange.start)}–
          {formatDuration(cutRange.end)}
        </button>
        <Tooltip label="Keep the video as it is" shortcut="Esc">
          <button
            onClick={onCancelCut}
            className={`${buttonClass} text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark`}
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      <Tooltip label="Remove a part of the video you don't need">
        <button
          onClick={onStartCut}
          disabled={disabled}
          className={`${buttonClass} border border-line dark:border-line-dark text-ink dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark`}
        >
          <Scissors className="w-3.5 h-3.5" /> Cut a part
        </button>
      </Tooltip>
      {cuts.length > 0 && (
        <span className="text-xs text-ink-faint dark:text-ink-faint-dark tabular-nums">
          {cuts.length === 1 ? '1 part cut' : `${cuts.length} parts cut`} ·{' '}
          {formatDuration(keptDuration(cuts, duration))} left · click a striped part to put it back
        </span>
      )}
    </div>
  );
}

/**
 * The small card that floats next to a freshly drawn box (TargetCanvas
 * `boxEditor`): pick what the viewer does and write it, right there. It edits
 * the same step as the side panel, so both always show the same.
 *   Enter (in the text) or ✓ → done; Shift+Enter → new line; Esc → done.
 * @param {{
 *   step: Step,
 *   number: number,
 *   onUpdate: (patch: Partial<Step>) => void,
 *   onDone: () => void,
 * }} props
 */
export function QuickStepEditor({ step, number, onUpdate, onDone }) {
  const action = getStepAction(step);
  const textRef = useRef(null);

  // Ready to type right away (the pointer can stay where the box was drawn).
  useEffect(() => {
    textRef.current?.focus({ preventScroll: true });
  }, [step.id]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing)) {
      e.preventDefault();
      e.stopPropagation();
      onDone();
    }
  };

  return (
    <div
      className="rounded-2xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark shadow-premium p-2.5 space-y-2"
      onKeyDown={onKeyDown}
      role="dialog"
      aria-label={`Feature ${number}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
          {number}
        </span>
        <div className="flex-1 grid grid-cols-3 gap-0.5 rounded-lg p-0.5 bg-paper-2 dark:bg-paper-2-dark">
          {ACTIONS.map(({ value, Icon, text, tip }) => (
            <button
              key={value}
              onClick={() => {
                onUpdate({ action: value });
                textRef.current?.focus({ preventScroll: true });
              }}
              title={tip}
              className={`flex items-center justify-center gap-1 h-7 rounded-md text-xs font-semibold transition-colors ${
                action === value
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-ink-soft dark:text-ink-soft-dark hover:bg-panel dark:hover:bg-panel-dark'
              }`}
              aria-pressed={action === value}
            >
              <Icon className="w-3.5 h-3.5" /> {text}
            </button>
          ))}
        </div>
      </div>
      {action === 'type' && (
        <input
          type="text"
          value={step.typeValue || ''}
          onChange={(e) => onUpdate({ typeValue: e.target.value })}
          placeholder="Text to type (optional)"
          className="w-full px-2.5 py-1.5 rounded-lg bg-panel dark:bg-panel-dark border border-line dark:border-line-dark text-xs text-ink dark:text-ink-soft-dark outline-none focus:border-accent"
          aria-label={`Text typed in feature ${number}`}
        />
      )}
      <textarea
        ref={textRef}
        value={step.text || ''}
        onChange={(e) => onUpdate({ text: e.target.value })}
        rows={2}
        placeholder={DESCRIBE_PLACEHOLDER[action]}
        className="w-full resize-none px-2.5 py-2 rounded-lg bg-panel dark:bg-panel-dark border border-line dark:border-line-dark text-sm text-ink dark:text-ink-soft-dark outline-none focus:border-accent"
        aria-label={`What the viewer does in feature ${number}`}
      />
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[11px] text-ink-faint dark:text-ink-faint-dark">
          Enter to finish · draw another box for the next feature
        </span>
        <button
          onClick={onDone}
          className="flex items-center gap-1 h-8 px-3 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-dark transition-colors"
        >
          <Check className="w-3.5 h-3.5" /> Done
        </button>
      </div>
    </div>
  );
}

/**
 * The features as a playlist: drag a row (or its handle, on touch) and the
 * others make room live; release to drop it there. Each row leads with its
 * title (the first words of its description); the number shows its place.
 * Neighbouring rows on the same picture are joined by a line on the left.
 * @param {{
 *   steps: Step[],                    // in list order
 *   frameUrls: Record<string, string>, // imageId → object URL
 *   activeId: string | null,
 *   onOpen: (step: Step) => void,
 *   onDelete: (step: Step) => void,
 *   onMove: (from: number, to: number) => void,  // drag & drop, positions in `steps`
 * }} props
 */
export function VideoStepList({ steps, frameUrls, activeId, onOpen, onDelete, onMove }) {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const { order, draggingId, rowProps } = useSortableList({
    ids: steps.map((step) => step.id),
    onMove,
  });

  if (!steps.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <Film className="w-7 h-7 text-ink-faint dark:text-ink-faint-dark" />
        <p className="text-sm text-ink-soft dark:text-ink-soft-dark">
          No features yet. Pause the video and press <b>Add feature here</b>.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
      {order.map((id, i) => {
        const step = byId.get(id);
        if (!step) return null;
        const number = i + 1;
        const url = step.imageId && frameUrls[step.imageId];
        const noBox = getStepTargets(step).length === 0;
        const active = step.id === activeId;
        const dragging = step.id === draggingId;
        const title = firstWords(step.text);
        const samePicture = (other) => !!other && !!step.imageId && other.imageId === step.imageId;
        const joinUp = !draggingId && samePicture(byId.get(order[i - 1]));
        const joinDown = !draggingId && samePicture(byId.get(order[i + 1]));
        return (
          <li
            key={step.id}
            {...rowProps(step.id)}
            className={`group relative flex items-center rounded-xl border select-none ${
              dragging
                ? 'border-accent bg-panel dark:bg-panel-dark shadow-xl ring-1 ring-accent/30'
                : active
                  ? 'border-accent bg-accent-soft/60 dark:bg-accent-soft-dark/30'
                  : 'border-transparent hover:bg-paper-2 dark:hover:bg-paper-2-dark'
            }`}
          >
            {(joinUp || joinDown) && (
              <span
                aria-hidden
                className={`absolute left-0 w-0.5 bg-accent/40 rounded-full ${
                  joinUp ? '-top-1' : 'top-2'
                } ${joinDown ? '-bottom-1' : 'bottom-2'}`}
              />
            )}
            <Tooltip label="Drag to move this feature">
              <span
                data-drag-handle
                className={`w-6 h-10 flex-shrink-0 flex items-center justify-center touch-none text-ink-faint dark:text-ink-faint-dark ${
                  dragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              >
                <GripVertical className="w-4 h-4" />
              </span>
            </Tooltip>
            <Tooltip label="Open this feature" className="flex-1 min-w-0">
              <button
                onClick={() => onOpen(step)}
                className="w-full flex items-center gap-2.5 py-1.5 pr-9 text-left"
              >
                <span className="relative w-16 h-10 flex-shrink-0 rounded-md overflow-hidden bg-paper-2 dark:bg-paper-2-dark border border-line dark:border-line-dark">
                  {url && (
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  )}
                  <span className="absolute left-0.5 top-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-ink/80 text-white text-[10px] font-bold leading-[18px] text-center tabular-nums">
                    {number}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-semibold truncate ${
                      title
                        ? 'text-ink dark:text-ink-soft-dark'
                        : 'italic font-medium text-ink-faint dark:text-ink-faint-dark'
                    }`}
                  >
                    {title || 'No title yet'}
                  </span>
                  <span className="block text-xs text-ink-faint dark:text-ink-faint-dark tabular-nums">
                    {formatDuration(step.videoTime)}
                  </span>
                </span>
              </button>
            </Tooltip>
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
              {noBox && (
                <Tooltip label="No box yet: open it and drag a box">
                  <AlertCircle className="w-4 h-4 text-danger" aria-label="No box yet" />
                </Tooltip>
              )}
              <Tooltip label="Delete this feature">
                <button
                  onClick={() => onDelete(step)}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-ink-faint dark:text-ink-faint-dark hover:text-danger hover:bg-danger/10"
                  aria-label={`Delete ${title || `feature ${number}`}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </Tooltip>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * @param {{
 *   step: Step,
 *   number: number,
 *   pageName?: string,
 *   onUpdate: (patch: Partial<Step>) => void,
 *   onNextOnPicture: () => void,   // a new step on this same picture
 *   onDone: () => void,
 * }} props
 */
export function VideoStepPanel({ step, number, pageName, onUpdate, onNextOnPicture, onDone }) {
  const action = getStepAction(step);
  return (
    <div className="p-3 space-y-3 border-b border-line dark:border-line-dark">
      <p className="text-sm font-semibold text-ink dark:text-ink-soft-dark">
        Feature {number}{' '}
        <span className="text-xs font-medium text-ink-faint dark:text-ink-faint-dark tabular-nums">
          {formatDuration(step.videoTime)}
        </span>
      </p>

      <div className="inline-flex items-center gap-0.5 border border-line dark:border-line-dark rounded-lg p-0.5 bg-panel dark:bg-panel-dark">
        {ACTIONS.map(({ value, Icon, text, tip }) => (
          <Tooltip key={value} label={tip}>
            <button
              onClick={() => onUpdate({ action: value })}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                action === value
                  ? 'bg-accent text-white'
                  : 'text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark'
              }`}
              aria-pressed={action === value}
            >
              <Icon className="w-3.5 h-3.5" /> {text}
            </button>
          </Tooltip>
        ))}
      </div>
      {action === 'type' && (
        <input
          type="text"
          value={step.typeValue || ''}
          onChange={(e) => onUpdate({ typeValue: e.target.value })}
          placeholder="Text to type (optional)"
          className="w-full px-2.5 py-1.5 rounded-lg bg-panel dark:bg-panel-dark border border-line dark:border-line-dark text-xs text-ink dark:text-ink-soft-dark outline-none focus:border-accent"
          aria-label={`Text typed in feature ${number}`}
        />
      )}

      <DescriptionField
        id={`video-step-desc-${step.id}`}
        value={step.text}
        onChange={(text) => onUpdate({ text })}
        label={step.label}
        pageName={pageName}
        action={action}
        rows={3}
      />

      <div className="space-y-2">
        <Tooltip label="Highlight something else on this same picture" className="w-full">
          <button
            onClick={onNextOnPicture}
            className="w-full flex items-center justify-center gap-1.5 h-10 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> Next feature on this picture
          </button>
        </Tooltip>
        <Tooltip label="Go back to the video to find the next moment" className="w-full">
          <button
            onClick={onDone}
            className="w-full flex items-center justify-center gap-1.5 h-10 rounded-xl border border-line dark:border-line-dark text-ink dark:text-ink-soft-dark text-sm font-semibold hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
          >
            <Check className="w-4 h-4" /> Done, back to video
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
