/**
 * @file Route #/video/:courseId — "Create by video": build a walkthrough from
 * a screen recording.
 *
 * PHASE A (no course.sourceVideoId yet) → GetVideo: record the screen or
 *   upload a video. The blob is stored in the media store and the course gets
 *   `sourceVideoId`; phase B then opens by itself.
 *
 * PHASE B → the builder:
 *   - Watch the video (own controls: play/pause, scrubber with a marker per
 *     step, Space toggles play). Whenever it is paused, "Add step here" takes
 *     a picture of the current frame (JPEG in the media store) and opens it in
 *     the existing highlight tool (components/course/TargetCanvas) to drag a
 *     box, then Click / Look / Type and a description (DescriptionField).
 *     "Next step on this picture" adds another step on the SAME frame (same
 *     imageId and moment) and opens it right away; "Done, back to video"
 *     returns to the video at that moment.
 *   - ORDER: the order of the steps list (right). A new step goes in at its
 *     moment in the video (right after the other steps on the same picture);
 *     after that the author can drag any step anywhere in the list (e.g. the
 *     first to the end). The list is renumbered and grouped by picture (runs
 *     of neighbouring steps on the same picture).
 *   - A GuideBar above the video / picture always names the ONE next action.
 *   - A guided tour (components/tutorial/GuidedTour) explains the page the
 *     first time, and again from the "?" button.
 *
 * DRAFT vs SAVE: work in progress is autosaved (debounced) to
 * `course.videoDraftSteps`, so a refresh loses nothing, but `course.steps` is
 * only written by "Save walkthrough", the one explicit finish action. Save puts
 * the steps in list order as ONE screen: every step is a nested step of it
 * (one groupId, see utils/course), each keeping its own frame as that step's
 * screenshot. So the player glides from step to step (focus shift) instead of
 * opening a new screen each time. Save refuses while a step has no box (that
 * step opens and the GuideBar says so). Then the builder closes and the saved
 * walkthrough opens on its watch page (#/preview/:id?saved=1), replacing the
 * builder in history so Back never returns into it.
 *
 * QUICK EDIT: right after a box is drawn, a small card floats next to it
 *   (VideoTourParts QuickStepEditor via TargetCanvas `boxEditor`): Click /
 *   Look / Type and the description, typed right there, Enter to finish. It
 *   edits the same step as the side panel, which stays in sync and keeps
 *   everything else (Improve, Listen, next feature…). Clicking the caption
 *   bubble opens the card again.
 *
 * CUTS: "Cut a part" puts a red part on the scrubber at the current moment;
 *   drag its two handles (the video previews the frame under the handle),
 *   then "Remove". Clicking a striped (cut) part puts it back
 *   (services/video/cuts). Non-destructive: the ranges are saved on
 *   `course.videoCuts`, the player skips them, seeking into one lands after it,
 *   and each can be restored. Features inside a new cut are removed with it
 *   (after a confirm). Replacing the video clears the cuts.
 *
 * LENGTH: the walkthrough is made from the captured frames plus their
 * descriptions, not from the video itself, so it ends at the last step and its
 * description. Anything recorded after the last step is simply not used.
 *
 * Reopening #/video/:courseId later loads the draft (or the saved steps that
 * have a `videoTime`) and the video, to add more steps. Steps added in the
 * editor without a video time are kept after the video steps on Save.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, HelpCircle, RefreshCw, Save, PlayCircle } from 'lucide-react';
import { getCourse, saveCourse, putMedia, getMedia, deleteMedia } from '@/services/storage/db';
import { resolveVideoDuration } from '@/services/video/screenRecorder';
import { addCut, cutAt, normalizeCuts, reachesEnd, snapOutOfCuts } from '@/services/video/cuts';
import { TargetCanvas } from '@/components/course/TargetCanvas';
import { GuidedTour } from '@/components/tutorial/GuidedTour';
import { TutorialDialog } from '@/components/tutorial/TutorialDialog';
import { WhatsNext } from '@/components/tutorial/WhatsNext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { PageSpinner } from '@/components/ui/Spinner';
import { toast } from 'react-toastify';
import { UndoToast } from '@/components/ui/Toast';
import { useMediaUrls } from '@/hooks/useMediaUrls';
import { nextId } from '@/utils';
import {
  collectMediaIds,
  getStepTargets,
  isMediaInUse,
  normalizeStepGroups,
  renumberDefaultLabels,
  targetTexts,
  withTargets,
} from '@/utils/course';
import { GetVideo } from './GetVideo';
import {
  BackToVideoButton,
  GuideBar,
  VideoControls,
  VideoCutBar,
  QuickStepEditor,
  VideoStepList,
  VideoStepPanel,
} from './VideoTourParts';

/** @typedef {import('@/types').Course} Course */
/** @typedef {import('@/types').Step} Step */

const AUTOSAVE_DELAY_MS = 800;
const TOUR_DONE_KEY = 'hs-video-tour-done';
/** The editor's first-visit tour; marked done so it doesn't cover the "ready" dialog. */
const EDITOR_TOUR_DONE_KEY = 'hs-editor-tour-done';
const FRAME_QUALITY = 0.92;
/** Length of the red part "Cut a part" starts with, seconds. */
const DEFAULT_CUT_SEC = 3;

const TOUR_STEPS = [
  {
    target: 'video',
    title: 'Play your video',
    text: 'Watch it and pause where something happens.',
  },
  { target: 'add-step', title: 'Add a feature here', text: 'It takes a picture of this moment.' },
  { target: 'steps', title: 'Your features', text: 'Click one to change it.' },
  {
    target: 'save',
    title: 'Save once at the end',
    text: 'Your walkthrough is made from these steps.',
  },
];

const ICON_BUTTON_CLASS =
  'h-9 px-2.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark hover:text-ink dark:hover:text-white transition-colors';

const hasVideoTime = (step) => typeof step.videoTime === 'number';

/**
 * Puts a new step in at its moment in the video: right after the last step at
 * the same moment (same picture), else before the first step later in the
 * video, else at the end. Steps the author dragged elsewhere stay where they are.
 */
function insertByTime(steps, step) {
  let at = steps.findLastIndex((s) => s.videoTime === step.videoTime) + 1;
  if (at === 0) {
    at = steps.findIndex((s) => s.videoTime > step.videoTime);
    if (at < 0) at = steps.length;
  }
  return [...steps.slice(0, at), step, ...steps.slice(at)];
}

/** Draft steps, in list order, labelled Step 1, 2, 3 … */
const tidy = (steps) => steps.map((s, i) => ({ ...s, label: `Step ${i + 1}` }));

function readTourDone() {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === '1';
  } catch {
    return false;
  }
}
function writeTourDone(key = TOUR_DONE_KEY) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Private mode: the tour just shows again next time.
  }
}

/** The current video frame as a JPEG Blob (natural size). */
function captureFrame(video) {
  return new Promise((resolve, reject) => {
    const { videoWidth: w, videoHeight: h } = video;
    if (!w || !h) {
      reject(new Error('Video not ready'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Capture failed'))),
      'image/jpeg',
      FRAME_QUALITY,
    );
  });
}

export function VideoTourPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  /** @type {[Course | null, Function]} */
  const [course, setCourse] = useState(null);
  const [steps, setSteps] = useState([]);
  const courseRef = useRef(null);
  const stepsRef = useRef(steps); // always the latest steps (updated by changeSteps)
  const autosaveRef = useRef(0);
  const dirtyRef = useRef(false);
  const finishedRef = useRef(false);

  const location = useLocation();
  // The course NewCoursePage just created (read once).
  const [justCreated] = useState(location.state?.course);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let found;
      if (justCreated?.id === courseId) {
        // Just created → use it directly, no need to load it again.
        found = justCreated;
        navigate(location.pathname, { replace: true }); // forget it, so a page refresh loads the saved version
      } else {
        try {
          found = await getCourse(courseId);
        } catch (error) {
          toast.error(`Could not open the course: ${error.message}`);
          navigate('/', { replace: true });
          return;
        }
      }
      if (cancelled) return;
      if (!found) {
        toast.error('Course not found');
        navigate('/', { replace: true });
        return;
      }
      courseRef.current = found;
      stepsRef.current = tidy(found.videoDraftSteps ?? found.steps.filter(hasVideoTime));
      setSteps(stepsRef.current);
      setCourse(found);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [courseId, navigate, justCreated, location.pathname]);

  /** Saves a change to the course (and keeps the ref current for later saves). */
  const updateCourse = useCallback(async (patch) => {
    const next = { ...courseRef.current, ...patch, updatedAt: Date.now() };
    courseRef.current = next;
    setCourse(next);
    await saveCourse(next);
  }, []);

  const saveDraft = useCallback(
    (draft) => {
      clearTimeout(autosaveRef.current);
      dirtyRef.current = false;
      if (finishedRef.current || !courseRef.current) return Promise.resolve();
      return updateCourse({ videoDraftSteps: draft });
    },
    [updateCourse],
  );

  /** Every edit to the steps goes through here → debounced draft autosave. */
  const changeSteps = useCallback(
    (update) => {
      const next = tidy(typeof update === 'function' ? update(stepsRef.current) : update);
      stepsRef.current = next;
      setSteps(next);
      dirtyRef.current = true;
      clearTimeout(autosaveRef.current);
      autosaveRef.current = setTimeout(() => saveDraft(next), AUTOSAVE_DELAY_MS);
    },
    [saveDraft],
  );

  // Leaving the page: write the pending draft right away.
  useEffect(
    () => () => {
      if (dirtyRef.current) saveDraft(stepsRef.current);
    },
    [saveDraft],
  );

  if (!course) return <PageSpinner />;

  if (!course.sourceVideoId) {
    return (
      <GetVideo
        title={course.title}
        onUseScreenshots={() => navigate(`/editor/${course.id}`)}
        onVideo={async ({ blob, durationSec }) => {
          const id = nextId('media');
          await putMedia(id, blob);
          await updateCourse({ sourceVideoId: id, sourceVideoDuration: durationSec || null });
        }}
      />
    );
  }

  return (
    <TourBuilder
      course={course}
      courseRef={courseRef}
      steps={steps}
      changeSteps={changeSteps}
      stepsRef={stepsRef}
      saveDraft={saveDraft}
      onChangeCuts={(videoCuts) => updateCourse({ videoCuts })}
      onReplaceVideo={async () => {
        const old = courseRef.current.sourceVideoId;
        await updateCourse({ sourceVideoId: null, sourceVideoDuration: null, videoCuts: null });
        if (old) deleteMedia(old);
      }}
      onSave={async () => {
        finishedRef.current = true;
        clearTimeout(autosaveRef.current);
        dirtyRef.current = false;
        const saved = await saveWalkthrough(courseRef.current, stepsRef.current);
        courseRef.current = saved;
        writeTourDone(EDITOR_TOUR_DONE_KEY);
        navigate(`/preview/${saved.id}?saved=1`, { replace: true });
      }}
    />
  );
}

/**
 * The one real save: draft steps → course.steps, in list order, as ONE screen
 * (a recording is one continuous page): all steps share a groupId, each keeps
 * its own frame. A single step needs no group. Media no longer used by
 * anything is deleted.
 * @param {Course} course
 * @param {Step[]} draft
 * @returns {Promise<Course>}
 */
async function saveWalkthrough(course, draft) {
  const groupId = draft.length > 1 ? nextId('group') : null;
  const built = draft.map((step) => ({ ...step, groupId }));
  // Screenshot steps (no video time) are kept where they are: the video steps
  // replace the old video block in place, or go at the end the first time
  // (e.g. a screenshot course that now adds steps from a recording).
  const firstVideo = course.steps.findIndex((step) => hasVideoTime(step));
  const others = course.steps.filter((step) => !hasVideoTime(step));
  const at =
    firstVideo < 0
      ? others.length
      : course.steps.slice(0, firstVideo).filter((step) => !hasVideoTime(step)).length;
  const steps = renumberDefaultLabels([...others.slice(0, at), ...built, ...others.slice(at)]);
  const next = { ...course, updatedAt: Date.now() };
  delete next.videoDraftSteps;
  next.steps = normalizeStepGroups({ ...next, steps }, () => nextId('group'));

  const keep = new Set([...collectMediaIds(next), next.sourceVideoId]);
  const before = [
    ...collectMediaIds(course),
    ...(course.videoDraftSteps || []).map((step) => step.imageId),
  ];
  await saveCourse(next);
  for (const id of new Set(before)) if (id && !keep.has(id)) deleteMedia(id);
  return next;
}

/**
 * Phase B: video + highlight tool + steps list.
 * @param {{
 *   course: Course,
 *   courseRef: { current: Course },
 *   steps: Step[],
 *   stepsRef: { current: Step[] },
 *   changeSteps: (update: Step[] | ((prev: Step[]) => Step[])) => void,
 *   saveDraft: (draft: Step[]) => Promise<void>,
 *   onChangeCuts: (cuts: import('@/services/video/cuts').VideoCut[]) => Promise<void>,
 *   onReplaceVideo: () => Promise<void>,
 *   onSave: () => Promise<void>,
 * }} props
 */
function TourBuilder({
  course,
  courseRef,
  steps,
  stepsRef,
  changeSteps,
  saveDraft,
  onChangeCuts,
  onReplaceVideo,
  onSave,
}) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const resolvingRef = useRef(false); // finding a WebM's real duration (ignore time updates)
  const [videoUrl, setVideoUrl] = useState(null);
  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [lessonId, setLessonId] = useState(null); // a recording lesson open in TutorialDialog
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problemId, setProblemId] = useState(null); // step that blocked Save (no box)
  const [cutRange, setCutRange] = useState(null); // { start, end } being chosen for cutting
  const [quickEditId, setQuickEditId] = useState(null); // step whose floating card is open
  const [confirmCut, setConfirmCut] = useState(null); // { cuts, inside: Step[] } awaiting OK

  // The recording as an object URL.
  useEffect(() => {
    let url = null;
    let cancelled = false;
    setReady(false);
    getMedia(course.sourceVideoId).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        toast.error("The video couldn't be found. Please add it again.");
        return;
      }
      url = URL.createObjectURL(blob);
      setVideoUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [course.sourceVideoId]);

  const imageIds = useMemo(
    () => [...new Set(steps.map((s) => s.imageId).filter(Boolean))],
    [steps],
  );
  const frameUrls = useMediaUrls(imageIds);

  const editing = steps.find((s) => s.id === editingId) || null;
  const editingNumber = editing ? steps.indexOf(editing) + 1 : 0;
  const targets = editing ? getStepTargets(editing) : [];
  const readyCount = steps.filter((s) => getStepTargets(s).length > 0).length;
  const cuts = useMemo(
    () => normalizeCuts(course.videoCuts, duration),
    [course.videoCuts, duration],
  );
  const cutsRef = useRef(cuts);
  cutsRef.current = cuts;

  // Smooth scrubber while playing; cut parts are jumped over.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) {
        const cut = cutAt(cutsRef.current, video.currentTime);
        if (cut && reachesEnd(cut, video.duration || duration)) {
          video.pause();
          video.currentTime = snapOutOfCuts(cutsRef.current, video.currentTime, duration);
        } else if (cut) {
          video.currentTime = cut.end;
        }
        setTime(video.currentTime);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);

  // First visit: the guided tour.
  useEffect(() => {
    if (ready && !readTourDone()) setTourOpen(true);
  }, [ready]);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    writeTourDone();
  }, []);

  const pause = () => videoRef.current?.pause();
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !ready) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, [ready]);

  const seek = useCallback(
    (seconds) => {
      const video = videoRef.current;
      if (!video) return;
      const t = snapOutOfCuts(
        cutsRef.current,
        Math.min(duration || seconds, Math.max(0, seconds)),
        duration,
      );
      video.currentTime = t;
      setTime(t);
    },
    [duration],
  );

  // Space toggles play (not while typing or editing a step); Esc stops marking a cut.
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && cutRange && !tourOpen) {
        setCutRange(null);
        return;
      }
      if (e.code !== 'Space' || editingId || tourOpen) return;
      const el = e.target;
      if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [editingId, tourOpen, togglePlay, cutRange]);

  const handleMetadata = async () => {
    const video = videoRef.current;
    resolvingRef.current = true;
    const real = await resolveVideoDuration(video, course.sourceVideoDuration || 0);
    resolvingRef.current = false;
    setDuration(real);
    // Start on the first moment that isn't cut.
    const start = snapOutOfCuts(normalizeCuts(course.videoCuts, real), 0, real);
    video.currentTime = start;
    setTime(start);
    setReady(true);
  };

  /** Pause, take a picture of this moment and open it as a new step. */
  const addStepHere = async () => {
    const video = videoRef.current;
    if (!video || busy) return;
    video.pause();
    setBusy(true);
    try {
      const videoTime = Math.round(video.currentTime * 1000) / 1000;
      // A step at exactly this moment already has the picture: share it.
      let imageId = steps.find((s) => s.videoTime === videoTime && s.imageId)?.imageId;
      if (!imageId) {
        const blob = await captureFrame(video);
        imageId = nextId('media');
        await putMedia(imageId, blob);
      }
      createStep(imageId, videoTime);
    } catch {
      toast.error("Couldn't take a picture of the video. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /** A new step on this picture, opened in the highlight tool (optionally with its first box). */
  const createStep = (imageId, videoTime, region = null) => {
    const prev = stepsRef.current;
    const step = {
      id: nextId('step'),
      label: `Step ${prev.length + 1}`,
      text: '',
      imageId,
      region: null,
      action: 'click',
      audioId: null,
      videoTime,
      ...(region ? withTargets([region]) : {}),
    };
    changeSteps(insertByTime(prev, step));
    const cameFrom = editingId;
    setEditingId(step.id);
    // A box drawn on a picture that already has one adds a feature by itself, so
    // a stray drag can add one by accident: offer a one-click way back (the
    // picture stays, the other feature still uses it).
    if (region) {
      toast.info(({ closeToast }) => (
        <UndoToast
          message="New feature added"
          closeToast={closeToast}
          onUndo={() => {
            changeSteps((all) => all.filter((s) => s.id !== step.id));
            setEditingId((id) => (id === step.id ? cameFrom : id));
          }}
        />
      ));
    }
    return step.id;
  };

  /** "Next step on this picture": same frame, same moment, a separate step. */
  const addStepOnSamePicture = () => {
    if (editing) createStep(editing.imageId, editing.videoTime);
  };

  const openStep = (step) => {
    pause();
    seek(step.videoTime);
    setEditingId(step.id);
  };

  const backToVideo = () => {
    if (editing) seek(editing.videoTime);
    setEditingId(null);
  };

  const updateStep = (id, patch) =>
    changeSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const deleteSteps = async (gone) => {
    const ids = new Set(gone.map((s) => s.id));
    const rest = stepsRef.current.filter((s) => !ids.has(s.id));
    changeSteps(rest);
    if (ids.has(editingId)) setEditingId(null);
    // Delete a picture once nothing uses it (another step, or the saved course).
    const unused = [...new Set(gone.map((s) => s.imageId))].filter(
      (id) => id && !rest.some((s) => s.imageId === id) && !isMediaInUse(courseRef.current, id),
    );
    if (unused.length) {
      await saveDraft(stepsRef.current);
      unused.forEach(deleteMedia);
    }
  };
  const deleteStep = (step) => deleteSteps([step]);

  /** Drag & drop in the list: the step at position `from` goes to position `to`. */
  const moveStep = (from, to) => {
    if (from === to) return;
    changeSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // ── Cutting the video ──
  /** A red part of a few seconds from here (or ending at the end), handles to adjust. */
  const startCut = () => {
    pause();
    const now = videoRef.current?.currentTime ?? time;
    const length = Math.min(DEFAULT_CUT_SEC, duration);
    const start = Math.max(0, Math.min(now, duration - length));
    setCutRange({ start, end: start + length });
  };

  /** A handle moved: show the frame under it, so the user sees where the cut is. */
  const changeCutRange = (range, moved) => {
    setCutRange(range);
    const video = videoRef.current;
    if (video) video.currentTime = range[moved];
    setTime(range[moved]);
  };

  const applyCut = () => {
    if (!cutRange) return;
    const next = addCut(cuts, cutRange, duration);
    if (!next) {
      toast.error('That would cut the whole video. Keep at least a moment of it.');
      return;
    }
    const inside = stepsRef.current.filter((s) => cutAt(next, s.videoTime));
    if (inside.length) setConfirmCut({ cuts: next, inside });
    else commitCut(next);
  };

  const commitCut = async (next, inside = []) => {
    setCutRange(null);
    setConfirmCut(null);
    if (inside.length) await deleteSteps(inside);
    await onChangeCuts(next);
    const video = videoRef.current;
    const t = snapOutOfCuts(next, video?.currentTime ?? time, duration);
    if (video) video.currentTime = t;
    setTime(t);
    // Removed features (and their pictures) can't come back, so Undo only without them.
    if (inside.length) toast.info('Part cut from the video');
    else
      toast.info(({ closeToast }) => (
        <UndoToast
          message="Part cut from the video"
          closeToast={closeToast}
          onUndo={() => onChangeCuts(cuts)}
        />
      ));
  };

  const restoreCut = (index) => onChangeCuts(cuts.filter((_, i) => i !== index));

  // ── Highlights of the step being edited (as in GlobalStepEditor) ──
  const setTargets = (list) => updateStep(editing.id, withTargets(list));
  // The first box belongs to this feature; every further box drawn on the same
  // picture becomes the next feature right away (no "Next feature" click needed).
  // Either way the floating card opens next to the new box to set action + text.
  const addTarget = (region) => {
    if (targets.length === 0 || !editing) {
      setTargets([...targets, region]);
      if (editing && targets.length === 0) setQuickEditId(editing.id);
    } else {
      setQuickEditId(createStep(editing.imageId, editing.videoTime, region));
    }
  };
  const changeTarget = (index, region) => {
    if (region) {
      setTargets(targets.map((t, n) => (n === index ? region : t)));
      return;
    }
    // Removing a box also removes its description.
    const texts = targetTexts(editing, targets.length);
    texts.splice(index, 1);
    updateStep(editing.id, {
      ...withTargets(targets.filter((_, n) => n !== index)),
      text: texts[0] ?? '',
      extraTexts: texts.slice(1),
    });
  };

  const save = async () => {
    // Every step needs a box: open the first one without and say so.
    const missing = steps.find((s) => getStepTargets(s).length === 0);
    if (missing) {
      openStep(missing);
      setProblemId(missing.id);
      return;
    }
    setBusy(true);
    try {
      await onSave();
    } catch {
      toast.error("Couldn't save. Please try again.");
      setBusy(false);
    }
  };

  // The one "what to do now" line.
  const back = <BackToVideoButton onClick={backToVideo} />;
  let guide;
  if (editing && targets.length === 0) {
    guide =
      problemId === editing.id
        ? {
            stage: 3,
            tone: 'problem',
            text: `Feature ${editingNumber} needs a box. Drag a box over what the viewer should click`,
            action: back,
          }
        : { stage: 3, text: 'Drag a box over what the viewer should click', action: back };
  } else if (editing && !editing.text?.trim()) {
    guide = { stage: 4, text: 'Write what the viewer should do' };
  } else if (editing) {
    guide = {
      stage: 5,
      tone: 'done',
      // text: 'Draw another box for the next feature, or go back to the video',
      text: '',
    };
  } else if (!ready) {
    guide = { stage: null, tone: 'busy', text: 'Opening your video…' };
  } else if (cutRange) {
    guide = {
      stage: null,
      tone: 'problem',
      text: 'Drag the red handles over the part you don’t need, then press Remove',
    };
  } else if (playing) {
    guide = { stage: 1, text: 'Pause the video where the viewer should do something' };
  } else if (readyCount > 0) {
    guide = {
      stage: 5,
      tone: 'done',
      text: 'Add more features, or press Save walkthrough when you’re done',
    };
  } else if (!steps.length && time < 0.05) {
    guide = { stage: 1, text: 'Play the video and pause where something happens' };
  } else {
    guide = { stage: 2, text: 'Press + Add feature here' };
  }
  const nudgeAdd = !editing && ready && !playing && !cutRange && guide.stage === 2;

  return (
    <div className="px-3 sm:px-4 py-3 flex flex-col gap-3 lg:h-[calc(100vh-3.5rem-1px)] lg:min-h-[520px]">
      {/* ── Top row ── */}
      <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
        <Tooltip label="Back to courses">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark"
            aria-label="Back to courses"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Tooltip>
        <h1 className="text-base sm:text-lg font-bold text-ink dark:text-ink-soft-dark truncate mr-auto">
          {course.title}
        </h1>
        <Tooltip label="Show the tour again">
          <button onClick={() => setTourOpen(true)} className={ICON_BUTTON_CLASS} aria-label="Help">
            <HelpCircle className="w-4 h-4" />
          </button>
        </Tooltip>
        <WhatsNext
          options={[
            {
              art: 'video',
              title: 'Turn a moment into a feature',
              text: 'Play the video, pause where something happens, press Add feature here and draw a box.',
              actions: [{ label: 'Show me', onClick: () => setLessonId('video-steps') }],
            },
            {
              art: 'draw',
              title: 'Highlight more on the same picture',
              text: 'Just draw another box on the picture. Every box becomes the next feature.',
              actions: [{ label: 'Show me', onClick: () => setLessonId('video-more') }],
            },
            {
              art: 'save',
              title: 'All done?',
              text: 'Press Save walkthrough. It is saved and opens, ready to watch.',
              actions: steps.length
                ? [{ label: 'Save walkthrough', onClick: save, primary: true }]
                : [],
            },
          ]}
        />
        <Tooltip label="Short videos: how to turn your recording into features">
          <button onClick={() => setLessonId('video-steps')} className={ICON_BUTTON_CLASS}>
            <PlayCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Watch how</span>
          </button>
        </Tooltip>
        <Tooltip label="Record or upload a different video">
          <button onClick={() => setConfirmReplace(true)} className={ICON_BUTTON_CLASS}>
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Replace video</span>
          </button>
        </Tooltip>
        <Tooltip
          label={steps.length ? 'Make the walkthrough from these features' : 'First add a feature'}
        >
          <button
            data-tour="save"
            onClick={save}
            disabled={!steps.length || busy}
            className="flex items-center gap-1.5 h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold shadow-lg shadow-accent/25 hover:bg-accent-dark disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all"
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">Save walkthrough</span>
            <span className="sm:hidden">Save</span>
          </button>
        </Tooltip>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
        {/* ── Main area: video, or the highlight tool for the step being edited ── */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
          <GuideBar {...guide} />
          {editing && (
            <div className="flex-1 min-h-0">
              <TargetCanvas
                imageUrl={frameUrls[editing.imageId] || null}
                subSteps={steps
                  .map((s, k) => ({
                    id: s.id,
                    number: k + 1,
                    targets: getStepTargets(s),
                    imageId: s.imageId,
                  }))
                  .filter((s) => s.imageId === editing.imageId)}
                activeId={editing.id}
                replacingIndex={null}
                onAddTarget={addTarget}
                onChangeTarget={changeTarget}
                onSelectSubStep={setEditingId}
                focusKey={editing.id}
                highlightId={hoveredId}
                onHoverSubStep={setHoveredId}
                caption={{ text: editing.text || '', action: editing.action || 'click' }}
                onCaptionClick={() => setQuickEditId(editing.id)}
                boxEditor={
                  quickEditId === editing.id && targets.length > 0 ? (
                    <QuickStepEditor
                      step={editing}
                      number={editingNumber}
                      onUpdate={(patch) => updateStep(editing.id, patch)}
                      onDone={() => setQuickEditId(null)}
                    />
                  ) : null
                }
              />
            </div>
          )}

          {/* The video stays mounted while editing, so it keeps its place. */}
          <div className={editing ? 'hidden' : 'flex flex-col gap-2 lg:flex-1 lg:min-h-0'}>
            <div
              data-tour="video"
              className="relative aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 rounded-2xl overflow-hidden bg-black flex items-center justify-center"
            >
              {videoUrl && (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="max-w-full max-h-full w-full h-full object-contain"
                  playsInline
                  preload="auto"
                  onClick={togglePlay}
                  onLoadedMetadata={handleMetadata}
                  onTimeUpdate={(e) =>
                    !resolvingRef.current && setTime(e.currentTarget.currentTime)
                  }
                  onSeeked={(e) => !resolvingRef.current && setTime(e.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                />
              )}
              {ready && !playing && !cutRange && (
                <Tooltip
                  label="Take a picture of this moment and add a feature"
                  className="absolute bottom-4 left-1/2 -translate-x-1/2"
                >
                  <span className="relative inline-flex">
                    {/* Gentle pulsing ring when this is the next thing to press. */}
                    {nudgeAdd && (
                      <span
                        className="absolute -inset-1.5 rounded-[20px] ring-4 ring-white/80 motion-safe:animate-pulse pointer-events-none"
                        aria-hidden="true"
                      />
                    )}
                    <button
                      data-tour="add-step"
                      onClick={addStepHere}
                      disabled={busy}
                      className={`relative flex items-center gap-2 h-12 px-6 rounded-2xl bg-accent text-white text-base font-bold shadow-xl shadow-black/30 hover:bg-accent-dark disabled:opacity-60 transition-colors whitespace-nowrap ${
                        nudgeAdd ? 'ring-2 ring-white' : ''
                      }`}
                    >
                      <Plus className="w-5 h-5" /> Add feature here
                    </button>
                  </span>
                </Tooltip>
              )}
            </div>
            <VideoControls
              duration={duration}
              time={time}
              playing={playing}
              steps={steps}
              activeId={editingId}
              cuts={cuts}
              cutRange={cutRange}
              onCutRangeChange={changeCutRange}
              onRestoreCut={restoreCut}
              onTogglePlay={togglePlay}
              onSeek={seek}
              onPickStep={openStep}
            />
            {ready && (
              <VideoCutBar
                duration={duration}
                cuts={cuts}
                cutRange={cutRange}
                disabled={busy}
                onStartCut={startCut}
                onApplyCut={applyCut}
                onCancelCut={() => setCutRange(null)}
              />
            )}
          </div>
        </div>

        {/* ── Right panel: step being edited + all steps ── */}
        <aside
          data-tour="steps"
          className="min-w-0 max-h-[80vh] lg:max-h-none lg:h-full lg:w-[340px] flex-shrink-0 rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark flex flex-col overflow-hidden"
        >
          {editing && targets.length > 0 && (
            <div className="flex-shrink-0 max-h-[60%] overflow-y-auto">
              <VideoStepPanel
                key={editing.id}
                step={editing}
                number={editingNumber}
                pageName={course.pageName}
                onUpdate={(patch) => updateStep(editing.id, patch)}
                onNextOnPicture={addStepOnSamePicture}
                onDone={backToVideo}
              />
            </div>
          )}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-line dark:border-line-dark flex-shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark">
              Features
            </p>
            {steps.length > 0 && (
              <span className="text-xs font-semibold text-accent tabular-nums">{steps.length}</span>
            )}
          </div>
          <VideoStepList
            steps={steps}
            frameUrls={frameUrls}
            activeId={editingId}
            onOpen={openStep}
            onDelete={deleteStep}
            onMove={moveStep}
          />
        </aside>
      </div>

      <GuidedTour steps={TOUR_STEPS} open={tourOpen} onClose={closeTour} />
      {lessonId && <TutorialDialog initialId={lessonId} onClose={() => setLessonId(null)} />}
      <ConfirmDialog
        open={confirmReplace}
        title="Replace the video?"
        message="Your features stay. The old video is removed."
        confirmLabel="Replace"
        onConfirm={() => {
          setConfirmReplace(false);
          setEditingId(null);
          onReplaceVideo();
        }}
        onCancel={() => setConfirmReplace(false)}
      />
      <ConfirmDialog
        open={!!confirmCut}
        title="Cut this part?"
        message={
          confirmCut?.inside.length === 1
            ? '1 feature is in this part. It is removed with it.'
            : `${confirmCut?.inside.length} features are in this part. They are removed with it.`
        }
        confirmLabel="Cut"
        danger
        onConfirm={() => commitCut(confirmCut.cuts, confirmCut.inside)}
        onCancel={() => setConfirmCut(null)}
      />
    </div>
  );
}
