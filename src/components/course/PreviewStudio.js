/**
 * @file Preview studio — watch the course like a video, and fix any moment of
 * it on the spot. Opened by "Preview" in the editor.
 *
 * TWO MODES, ONE BUTTON
 *   Watch (default)  the real player, full size, with its video timeline.
 *                    Top right: a single "Edit" button.
 *   Edit             the player pauses and an edit panel opens beside it for the
 *                    moment on screen (StepEditPanel). To pick another moment:
 *                    press ▶ and pause where you want, or click the timeline (it
 *                    jumps to that exact moment). "+" buttons on the timeline
 *                    insert a step before step 1, between any two, or at the end.
 *                    While it plays the panel just says "Pause to edit".
 *                    Beside the player: the steps (StudioStepList) — click one
 *                    to edit it, ▶ to play from it, drag to reorder, 🗑 delete.
 *                    The panel's ▶ Play replays the step being edited, so a
 *                    change is checked right where it was made.
 *                    A step made from a video can take another moment of it
 *                    ("Change moment"); steps on the same picture move with it.
 *
 * OPENED FROM: the editor ("Preview and edit") and the course's watch page
 * (#/preview/:id, "Edit here" / a step's ✎), which can start in Edit mode on a
 * given step (startInEdit, initialStepId).
 *
 * DRAFT, NOT AUTOSAVE
 *   Everything here edits a copy of the course. "Save" writes it (onSave →
 *   editor saves to IndexedDB) and confirms with a ✓ animation; "Discard"
 *   throws the copy away, so nothing goes live. Media is cleaned up:
 *     Save    → delete media the saved course no longer uses (replaced
 *               screenshots/recordings, removed steps, abandoned uploads)
 *     Discard → delete every Blob created since the last save
 *   Closing with unsaved changes asks first.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, Pencil, PauseCircle } from 'lucide-react';
import { deleteMedia, putMedia } from '@/services/storage/db';
import { buildWalkthroughSteps } from '@/services/sharing/share';
import { MAX_STEPS } from '@/constants';
import { nextId } from '@/utils';
import {
  collectMediaIds,
  getCourseVideos,
  getStepImageId,
  renumberDefaultLabels,
} from '@/utils/course';
import { WalkthroughPlayer } from '@/components/walkthrough/WalkthroughPlayer';
import { formatTime, stepTimings } from '@/components/walkthrough/Timeline';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { StepEditPanel } from '@/components/course/StepEditPanel';
import { StudioStepList } from '@/components/course/StudioStepList';
import { toast } from 'react-toastify';

/** @typedef {import('@/types').Course} Course */

/** Rebuild the player's steps this long after the last edit (typing). */
const REBUILD_DEBOUNCE_MS = 250;
/** How long the "Saved" confirmation stays on the button. */
const SAVED_FLASH_MS = 1800;

function newStep(number) {
  return {
    id: nextId('step'),
    label: `Step ${number}`,
    text: '',
    imageId: null,
    region: null,
    action: 'click',
    audioId: null,
  };
}

/**
 * @param {{
 *   course: Course,
 *   onSave: (course: Course) => void,
 *   onClose: (selectedStepId?: string) => void,
 *   startInEdit?: boolean,     // open in Edit mode (panel open, paused)
 *   initialStepId?: string,    // the step to show first
 * }} props
 */
export function PreviewStudio({ course, onSave, onClose, startInEdit = false, initialStepId }) {
  const [saved, setSaved] = useState(course); // last saved version
  const [draft, setDraft] = useState(course);
  const [walkSteps, setWalkSteps] = useState(null);
  const firstIndex = Math.max(
    0,
    course.steps.findIndex((s) => s.id === initialStepId),
  );
  const [current, setCurrent] = useState(firstIndex); // frame showing in the player
  const [playing, setPlaying] = useState(false);
  const [editMode, setEditMode] = useState(startInEdit);
  const [panelHidden, setPanelHidden] = useState(false); // closed with ✕ until the next pause
  const [pauseRequest, setPauseRequest] = useState(0);
  // { index, nonce, play? } → player
  const [jump, setJump] = useState(() =>
    firstIndex > 0 ? { index: firstIndex, nonce: Date.now() } : null,
  );
  const [justSaved, setJustSaved] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const createdMedia = useRef(new Set()); // Blobs written since the last save

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  // Rebuild what the player shows whenever the draft changes.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        // One frame per step: the edit panel edits frames by step position.
        const built = await buildWalkthroughSteps(draft, { expandTargets: false });
        if (!cancelled) setWalkSteps(built);
      },
      walkSteps ? REBUILD_DEBOUNCE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), SAVED_FLASH_MS);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const frame = Math.min(current, draft.steps.length - 1);
  const panelOpen = editMode && !playing && !panelHidden;

  const jumpTo = (index) => {
    setCurrent(index);
    setJump({ index, nonce: Date.now() });
  };

  // ── Player → studio ──
  const onIndexChange = useCallback((i) => setCurrent(i), []);
  const onPlayingChange = useCallback((isPlaying) => {
    setPlaying(isPlaying);
    if (!isPlaying) setPanelHidden(false); // paused → edit this moment
  }, []);

  // ── Modes ──
  const startEditing = () => {
    setEditMode(true);
    setPanelHidden(false);
    setPauseRequest((n) => n + 1);
  };

  // ── Draft edits ──
  const updateStep = (index, patch) =>
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));

  /** Inserts a blank step at `position` (0 = before step 1) and opens it. */
  const insertStepAt = (position) => {
    if (draft.steps.length >= MAX_STEPS) {
      toast.error(`A course can have up to ${MAX_STEPS} steps`);
      return;
    }
    setDraft((d) => {
      const steps = [...d.steps];
      steps.splice(position, 0, newStep(position + 1));
      return { ...d, steps: renumberDefaultLabels(steps) };
    });
    setPanelHidden(false);
    setPauseRequest((n) => n + 1);
    jumpTo(position);
  };

  /** Click in the step list: edit that step (paused, panel open). */
  const selectStep = (index) => {
    setEditMode(true);
    setPanelHidden(false);
    setPauseRequest((n) => n + 1);
    jumpTo(index);
  };

  /** ▶ in the list or the panel: play the walkthrough from this step's start. */
  const playFrom = (index) => {
    setCurrent(index);
    setJump({ index, nonce: Date.now(), play: true });
  };

  /** Drag & drop in the step list; the step on screen stays on screen. */
  const moveStep = (from, to) => {
    if (from === to) return;
    const showing = draft.steps[frame]?.id;
    const steps = [...draft.steps];
    const [moved] = steps.splice(from, 1);
    steps.splice(to, 0, moved);
    setDraft((d) => ({ ...d, steps: renumberDefaultLabels(steps) }));
    const at = steps.findIndex((s) => s.id === showing);
    if (at >= 0 && at !== frame) jumpTo(at);
  };

  /**
   * "Change moment": the new frame becomes this step's screenshot — and that of
   * every step sharing its picture (they showed the same frame).
   */
  const changeFrame = async (index, frameBlob, seconds) => {
    const target = draft.steps[index];
    if (!target) return;
    const mediaId = nextId('media');
    try {
      await putMedia(mediaId, frameBlob);
    } catch (error) {
      toast.error("Couldn't save the new frame. Please try again.");
      throw error;
    }
    createdMedia.current.add(mediaId);
    const oldImage = target.imageId;
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s) =>
        s.id === target.id ||
        (oldImage && s.imageId === oldImage && typeof s.videoTime === 'number')
          ? { ...s, imageId: mediaId, videoTime: seconds }
          : s,
      ),
    }));
    toast.success('New frame in place. Press ▶ Play to check it');
  };

  const deleteStep = (index) => {
    setDraft((d) => ({
      ...d,
      steps: renumberDefaultLabels(d.steps.filter((_, i) => i !== index)),
    }));
    jumpTo(Math.max(0, index - 1));
  };

  /** Deletes Blobs that `keep` doesn't reference (nor its unsaved video draft). */
  const cleanupMedia = async (candidates, keep) => {
    const used = new Set([
      ...collectMediaIds(keep),
      ...(keep.videoDraftSteps || []).map((s) => s.imageId),
    ]);
    for (const id of candidates) if (!used.has(id)) await deleteMedia(id);
  };

  const save = async () => {
    const next = { ...draft, updatedAt: Date.now() };
    onSave(next);
    await cleanupMedia([...collectMediaIds(saved), ...createdMedia.current], next);
    createdMedia.current = new Set();
    setSaved(next);
    setDraft(next);
    setJustSaved(true);
    toast.success('Saved — your walkthrough is updated');
  };

  const discard = async () => {
    await cleanupMedia([...createdMedia.current], saved);
    createdMedia.current = new Set();
    setDraft(saved);
    setCurrent((c) => Math.min(c, saved.steps.length - 1));
    setEditMode(false);
    toast('Changes discarded — nothing went live');
  };

  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else onClose(draft.steps[frame]?.id);
  };

  // Esc: close the panel → leave Edit mode → close the studio.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape' || confirmClose) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      e.stopPropagation();
      if (panelOpen) setPanelHidden(true);
      else if (editMode && !dirty) setEditMode(false);
      else requestClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  });

  const step = draft.steps[frame];
  const stepImageId = step ? getStepImageId(draft, step) : null;
  const stepImageUrl = walkSteps?.find((w) => w.id === step?.id)?.imageData ?? null;
  let reuseFrom = null;
  for (let i = frame - 1; i >= 0; i--) {
    const id = getStepImageId(draft, draft.steps[i]);
    if (id) {
      reuseFrom = { number: i + 1, imageId: id };
      break;
    }
  }
  const timings = useMemo(
    () => (walkSteps ? stepTimings(walkSteps, {}, draft.pace) : null),
    [walkSteps, draft.pace],
  );
  const timeLabel = timings?.spans[frame] ? formatTime(timings.spans[frame].start) : undefined;

  // The recording this step's picture came from ("Create by video"), if it is still there.
  const videos = getCourseVideos(draft);
  const stepVideoIndex =
    step && typeof step.videoTime === 'number'
      ? videos.findIndex((v) => v.id === (step.videoId ?? videos[0]?.id))
      : -1;
  const stepVideo =
    stepVideoIndex >= 0
      ? {
          id: videos[stepVideoIndex].id,
          time: step.videoTime,
          duration: videos[stepVideoIndex].duration,
          number: videos.length > 1 ? stepVideoIndex + 1 : undefined,
        }
      : null;
  const sharedWith = step?.imageId
    ? draft.steps.filter((s) => s.id !== step.id && s.imageId === step.imageId).length
    : 0;
  const thumbs = useMemo(
    () => Object.fromEntries((walkSteps || []).map((w) => [w.id, w.imageData])),
    [walkSteps],
  );

  return (
    <div className="fixed inset-0 z-50 bg-paper dark:bg-paper-dark flex flex-col">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-3 sm:px-5 h-14 border-b border-line dark:border-line-dark flex-shrink-0">
        <button
          onClick={requestClose}
          className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-paper-2 dark:hover:bg-paper-2-dark"
          aria-label="Close preview"
        >
          <X className="w-5 h-5 text-ink-soft dark:text-ink-soft-dark" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink dark:text-white truncate">{draft.title}</p>
          {editMode && (
            <p className="text-[11px] text-ink-faint dark:text-ink-faint-dark truncate">
              Pause or click the timeline to edit that moment
            </p>
          )}
        </div>

        {!editMode && (
          <button
            onClick={startEditing}
            className="flex items-center gap-1.5 px-4 h-9 rounded-xl bg-accent text-white text-sm font-semibold shadow-glow hover:bg-accent-dark"
          >
            <Pencil className="w-4 h-4" /> Edit
          </button>
        )}
        {editMode && (
          <>
            {dirty && (
              <span className="flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                <span className="hidden sm:inline">Unsaved changes</span>
                <span className="sm:hidden">Unsaved</span>
              </span>
            )}
            {dirty && (
              <button
                onClick={discard}
                className="px-3 h-10 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark"
              >
                Discard
              </button>
            )}
            {dirty ? (
              <button
                onClick={save}
                className="flex items-center gap-1.5 px-5 h-10 rounded-xl bg-accent text-white text-sm font-bold shadow-glow hover:bg-accent-dark"
              >
                <Check className="w-4 h-4" /> Save changes
              </button>
            ) : (
              <span
                key={justSaved ? 'saved' : 'clean'}
                className={`${justSaved ? 'hs-saved-pop bg-teal/10 text-teal dark:text-teal-dark' : 'text-ink-faint dark:text-ink-faint-dark'} flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-semibold`}
              >
                <Check className="w-4 h-4" /> {justSaved ? 'Changes saved' : 'All saved'}
              </span>
            )}
            {!dirty && (
              <button
                onClick={() => setEditMode(false)}
                className="px-4 h-10 rounded-xl border border-line dark:border-line-dark text-sm font-semibold text-ink dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark"
              >
                Done
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* ── Steps: click to edit, ▶ to play from, drag to reorder ── */}
        {editMode && (
          <aside className="hidden lg:block w-[280px] flex-shrink-0 border-r border-line dark:border-line-dark bg-panel dark:bg-panel-dark">
            <StudioStepList
              steps={draft.steps}
              thumbs={thumbs}
              activeIndex={frame}
              canDelete={draft.steps.length > 1}
              onSelect={selectStep}
              onPlay={playFrom}
              onMove={moveStep}
              onDelete={deleteStep}
            />
          </aside>
        )}
        {/* ── Player ── */}
        <div className="flex-1 min-w-0 p-3 sm:p-5">
          <div
            className={`h-full rounded-3xl transition-shadow duration-300 ${
              editMode
                ? 'ring-2 ring-accent/40 ring-offset-4 ring-offset-paper dark:ring-offset-paper-dark'
                : ''
            }`}
          >
            {walkSteps ? (
              <WalkthroughPlayer
                steps={walkSteps}
                title={draft.title}
                pace={draft.pace}
                variant="inline"
                onIndexChange={onIndexChange}
                onPlayingChange={onPlayingChange}
                requestedIndex={jump}
                pauseRequest={pauseRequest}
                onInsertStep={editMode ? insertStepAt : undefined}
                hideStepList={editMode}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <Spinner />
              </div>
            )}
          </div>
        </div>

        {/* ── Edit panel ── */}
        {editMode && step && (panelOpen || playing) && (
          <aside
            className={`hs-panel-in w-full sm:w-[420px] flex-shrink-0 border-l border-line dark:border-line-dark bg-panel dark:bg-panel-dark ${
              panelOpen ? 'fixed sm:static inset-0 top-14 z-10' : 'hidden sm:block'
            }`}
          >
            {panelOpen ? (
              <StepEditPanel
                key={step.id}
                step={step}
                index={frame}
                total={draft.steps.length}
                timeLabel={timeLabel}
                imageId={stepImageId}
                imageUrl={stepImageUrl}
                reuseFrom={reuseFrom}
                pageName={draft.pageName}
                canAdd={draft.steps.length < MAX_STEPS}
                canDelete={draft.steps.length > 1}
                onChange={(patch) => updateStep(frame, patch)}
                onMediaCreated={(id) => createdMedia.current.add(id)}
                onAddBefore={() => insertStepAt(frame)}
                onAddAfter={() => insertStepAt(frame + 1)}
                onDelete={() => deleteStep(frame)}
                onClose={() => setPanelHidden(true)}
                onPlay={() => playFrom(frame)}
                video={stepVideo}
                sharedWith={sharedWith}
                onFrameChange={(frameBlob, seconds) => changeFrame(frame, frameBlob, seconds)}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-3">
                <PauseCircle className="w-10 h-10 text-accent" />
                <p className="text-sm font-semibold text-ink dark:text-white">
                  Pause at the moment you want to change
                </p>
                <p className="text-xs text-ink-faint dark:text-ink-faint-dark">
                  Now playing: step {frame + 1} · {step.label || `Step ${frame + 1}`}
                </p>
              </div>
            )}
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={confirmClose}
        title="Discard unsaved changes?"
        message="You changed this course in the preview but didn't save. Close without saving?"
        confirmLabel="Discard & close"
        danger
        onConfirm={async () => {
          setConfirmClose(false);
          await discard();
          onClose();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </div>
  );
}
