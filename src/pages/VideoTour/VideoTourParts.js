/**
 * @file Pieces of the video tour builder (pages/VideoTour/VideoTourPage):
 *
 *   GuideBar        the one "what to do now" line + a 1·2·3·4 progress pill
 *   VideoControls   play / pause · scrubber with one marker per picture · time
 *   VideoStepList   the steps in video order, grouped by picture
 *   VideoStepPanel  Click / Look / Type + description of the step being edited,
 *                   "Next step on this picture" and "Done, back to video"
 *
 * They only render and report; the page owns the steps and the video.
 */

import { useRef } from 'react';
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
} from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { DescriptionField } from '@/components/course/DescriptionField';
import { getStepAction, getStepTargets } from '@/utils/course';
import { formatDuration } from '@/utils';

/** @typedef {import('@/types').Step} Step */

const SEEK_STEP_SEC = 5;

const ACTIONS = [
  { value: 'click', Icon: MousePointerClick, text: 'Click', tip: 'The viewer clicks the box' },
  { value: 'look', Icon: Eye, text: 'Look', tip: 'Just point at it, no click' },
  { value: 'type', Icon: TextCursorInput, text: 'Type', tip: 'The viewer types into it' },
];

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
  onTogglePlay,
  onSeek,
  onPickStep,
}) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const pct = (t) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);

  const seekFromPointer = (clientX) => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || !duration) return;
    onSeek(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * duration);
  };

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
          className="relative h-5 flex items-center cursor-pointer touch-none outline-none group focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
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
          <div
            className="absolute w-3.5 h-3.5 -ml-[7px] rounded-full bg-accent border-2 border-white dark:border-panel-dark shadow group-hover:scale-110 transition-transform"
            style={{ left: `${pct(time)}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      <span className="text-xs font-semibold tabular-nums text-ink-soft dark:text-ink-soft-dark whitespace-nowrap flex-shrink-0">
        {formatDuration(time)} / {formatDuration(duration)}
      </span>
    </div>
  );
}

/**
 * @param {{
 *   steps: Step[],                    // in video order
 *   frameUrls: Record<string, string>, // imageId → object URL
 *   activeId: string | null,
 *   onOpen: (step: Step) => void,
 *   onDelete: (step: Step) => void,
 * }} props
 */
export function VideoStepList({ steps, frameUrls, activeId, onOpen, onDelete }) {
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
  const row = ({ step, number }) => {
    const url = step.imageId && frameUrls[step.imageId];
    const noBox = getStepTargets(step).length === 0;
    const active = step.id === activeId;
    return (
      <li
        key={step.id}
        className={`group relative flex items-center rounded-xl border transition-colors ${
          active
            ? 'border-accent bg-accent-soft/60 dark:bg-accent-soft-dark/30'
            : 'border-transparent hover:bg-paper-2 dark:hover:bg-paper-2-dark'
        }`}
      >
        <Tooltip label="Open this feature" className="flex-1 min-w-0">
          <button
            onClick={() => onOpen(step)}
            className="w-full flex items-center gap-2.5 p-1.5 pr-9 text-left"
          >
            <span className="w-16 h-10 flex-shrink-0 rounded-md overflow-hidden bg-paper-2 dark:bg-paper-2-dark border border-line dark:border-line-dark">
              {url && (
                <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink dark:text-ink-soft-dark">
                Feature {number}
                <span className="text-xs font-medium text-ink-faint dark:text-ink-faint-dark tabular-nums">
                  {formatDuration(step.videoTime)}
                </span>
              </span>
              <span className="block text-xs text-ink-soft dark:text-ink-faint-dark truncate">
                {firstWords(step.text) || '…'}
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
              aria-label={`Delete feature ${number}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </Tooltip>
        </span>
      </li>
    );
  };

  return (
    <ul className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
      {groupByPicture(steps).map((group) =>
        group.items.length === 1 ? (
          row(group.items[0])
        ) : (
          // Several steps on one picture: one card with a small heading.
          <li
            key={`pic-${group.items[0].step.id}`}
            className="rounded-xl border border-line dark:border-line-dark p-1"
          >
            <p className="px-1.5 pt-0.5 pb-1 text-[11px] font-semibold text-ink-faint dark:text-ink-faint-dark">
              Picture at <span className="tabular-nums">{formatDuration(group.videoTime)}</span> ·{' '}
              {group.items.length} features
            </p>
            <ul className="space-y-1">{group.items.map(row)}</ul>
          </li>
        ),
      )}
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
