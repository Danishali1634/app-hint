/**
 * @file Route #/editor/:courseId — the main authoring screen.
 *
 * HIERARCHY (always shown the same way):
 *   Global Step  — the screenshot of a page. Required: every walkthrough
 *                  starts with one ("Create Global Step 1").
 *   └ Sub-step   — what is said / done there (description, voice,
 *                  Click · Look · Type). A plain step = a Global Step with
 *                  one sub-step; "+ Add sub-step" adds more on the same screenshot.
 *     └ Target(s) — the highlighted area(s); one or more per sub-step,
 *                  highlighted together in the walkthrough.
 *   Stored flat: sub-steps are consecutive steps sharing a groupId, targets
 *   are step.region + step.extraRegions (see utils/course) — playback, video,
 *   links and exports read them without knowing about the editor's hierarchy.
 *
 * LAYOUT
 *   Header row  : back · editable title (unique) · editable page name · status · Export ZIP
 *   Left column : StepRail — Global Steps with their sub-steps (add, delete,
 *                 reorder, scrolls on its own)
 *   Main column : active Global Step →
 *                   no screenshot yet → StepScreenshotUpload (upload / drop / paste / reuse)
 *                   has screenshot    → GlobalStepEditor (context bar that says what to
 *                                       do next, TargetCanvas, sub-step cards)
 *                 no steps → "Create Global Step 1"
 *
 * AUTHORING FLOW
 *   Global Step 1: screenshot → Sub-step 1: drag over its target(s) → describe it
 *                  → + Add sub-step → Sub-step 2: drag over its target(s) → …
 *   Global Step 2: screenshot of what opens → …
 *   … → Preview → "Mark done" (bottom bar) → dialog: Copy link / Download video
 *   In the walkthrough, a "click" target is clicked by an animated pointer and
 *   the next screen opens out of it — the viewer sees cause → effect.
 *
 * STATE OWNERSHIP
 *   This page is the single owner of the `course` object. Children never write
 *   the course directly; they call callbacks that go through updateCourse /
 *   updateStep below.
 *
 * AUTOSAVE
 *   There is no Save button. Every change calls saveCourse() immediately
 *   (IndexedDB writes are cheap), so a refresh never loses work.
 *   saveCourse runs inside the state updater so it always saves the newest
 *   state, even during fast typing. In dev StrictMode the updater runs twice,
 *   so the same data is written twice. That is harmless because put() is idempotent.
 *
 * MARK DONE: the sticky bar at the bottom shows how many steps are ready
 * (screenshot + area). "Mark done" checks every step, sets status 'published'
 * and opens CourseDoneDialog. Copy link / Copy embed / Download video run through
 * hooks/useCourseSharing (same as the course cards).
 *
 * ALWAYS EDITABLE: a "done" course stays fully editable (steps, screenshots,
 * areas, text, voice). Links and videos are snapshots, so after changes the
 * bottom bar says so and "Share / Download" creates fresh ones.
 *
 * STEP ORDER: steps can be added at the end, inserted between any two (StepRail
 * "+"), dragged, or deleted; auto-named steps ("Step 3") are renumbered.
 *
 * RETENTION: every edit updates `updatedAt`, which restarts the automatic
 * deletion countdown (COURSE_RETENTION_DAYS). The date is shown in the bottom bar.
 *
 * UNIQUE TITLE: renaming to a title another course already uses is refused on
 * blur/Enter, and the previous title is restored.
 *
 * MEDIA: screenshots/recordings are written to the IndexedDB media store first;
 * steps only store the resulting ids (step.imageId / step.audioId). Two steps
 * may share one screenshot, so an image is only deleted once no step uses it.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  CheckCircle2,
  Pencil,
  Archive,
  Tag,
  Share2,
  Link2,
  Check,
  Plus,
  FileText,
  Loader2,
  Trash2,
  PanelLeftClose,
  HelpCircle,
  ImagePlus,
  Video,
  Compass,
} from 'lucide-react';
import {
  getCourse,
  saveCourse,
  getMedia,
  getMediaAsDataUrl,
  putMedia,
  deleteMedia,
  findCourseByTitle,
} from '@/services/storage/db';
import { transcribeRecording } from '@/services/audio/transcribe';
import { exportCourseZip } from '@/services/export/zip';
import { STATUS_LABELS, STATUS_COLORS, MAX_STEPS } from '@/constants';
import { nextId } from '@/utils';
import {
  getStepImageId,
  renumberDefaultLabels,
  getStepUnits,
  getStepNumbers,
  normalizeStepGroups,
  withTargets,
  getCourseScreens,
} from '@/utils/course';
import { CollapsedRail, StepRail } from '@/components/course/StepRail';
import { PanelResizer, readStoredNumber, storeValue } from '@/components/ui/PanelResizer';
import { GlobalStepEditor } from '@/components/course/GlobalStepEditor';
import { ScreenGallery } from '@/components/course/ScreenGallery';
import { useMediaUrls } from '@/hooks/useMediaUrls';
import { StepScreenshotUpload } from '@/components/course/StepScreenshotUpload';
import { PreviewStudio } from '@/components/course/PreviewStudio';
import { CourseDoneDialog } from '@/components/course/CourseDoneDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageSpinner, Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/hooks/useToast';
import { useCourseSharing } from '@/hooks/useCourseSharing';
import { Tooltip } from '@/components/ui/Tooltip';
import { TutorialDialog } from '@/components/tutorial/TutorialDialog';
import { ShowMe } from '@/components/tutorial/ShowMe';
import { MoreMenu } from '@/components/ui/MoreMenu';
import { GuidedTour } from '@/components/tutorial/GuidedTour';
import { NextStepCoach } from '@/components/tutorial/NextStepCoach';

/** @typedef {import('@/types').Course} Course */
/** @typedef {import('@/types').Step} Step */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Step list width, px (resizable; remembered per browser). */
const RAIL_DEFAULT = 280;
const RAIL_WIDTH_KEY = 'hs-editor-rail-width';
const RAIL_COLLAPSED_KEY = 'hs-editor-rail-collapsed';
const clampRail = (w) => Math.round(Math.min(440, Math.max(220, w)));
/**
 * How the editor names a step: each screen lists its own features
 * ("Screen 2 · Feature 1"); a screen with a single feature is just "Screen 2".
 * (Viewers see plain Step 1, 2, 3 … in the player.)
 */
const featureName = ({ main, area }) =>
  area ? `Screen ${main} · Feature ${area}` : `Screen ${main}`;

/** Set once the first-visit tour of the editor has been closed (this browser). */
const TOUR_DONE_KEY = 'hs-editor-tour-done';
/** The first-visit tour: what each part of the editor is for (skips parts not on screen). */
const EDITOR_TOUR = [
  {
    target: 'canvas',
    title: 'Your screenshot',
    text: 'Add a screenshot of your app here, then drag a box over what the viewer should click.',
  },
  {
    target: 'steps',
    title: 'Your features',
    text: 'Write what to do for each box. Add the next feature here when you are ready.',
  },
  {
    target: 'screens',
    title: 'Your screens',
    text: 'A new page or popup opens in your app? Add a screen for it.',
  },
  { target: 'help', title: 'Stuck?', text: 'Short videos show every action, one by one.' },
];

// Shared button styles
const OUTLINE_BUTTON_CLASS =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line dark:border-line-dark text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors';

/** A new, empty step. */
function createStep(stepNumber) {
  return {
    id: nextId('step'),
    label: `Step ${stepNumber}`,
    text: '',
    imageId: null,
    region: null,
    action: 'click',
    audioId: null,
  };
}

export function CourseEditorPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();

  // ── State ────────────────────────────────────────────────────────────────
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStepId, setActiveStepId] = useState(null);
  const [imageUrl, setImageUrl] = useState(null); // data URL of the ACTIVE step's screenshot
  const [showPreview, setShowPreview] = useState(false);
  // "Your next step" coach: its spotlight, and whether this course was watched yet.
  const [spot, setSpot] = useState(null); // { target, title, how } | null
  const previewedKey = `hs-previewed-${courseId}`;
  const [previewed, setPreviewed] = useState(() => readStoredNumber(previewedKey, 0) === 1);
  useEffect(() => {
    if (!showPreview || previewed) return;
    setPreviewed(true);
    storeValue(previewedKey, 1);
  }, [showPreview, previewed, previewedKey]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingPageName, setEditingPageName] = useState(false);
  const [showDone, setShowDone] = useState(false); // "Mark done" dialog
  // Title before the current rename started — restored if the new one is taken.
  const titleBeforeEditRef = useRef('');
  const sharing = useCourseSharing();
  // Pending confirmation: { title, message, confirmLabel, onConfirm } (delete step, …)
  const [confirmAction, setConfirmAction] = useState(null);
  // Step list: collapsible and resizable (remembered in this browser).
  const [railCollapsed, setRailCollapsedState] = useState(
    () => readStoredNumber(RAIL_COLLAPSED_KEY, 0) === 1,
  );
  const [railWidth, setRailWidthState] = useState(() =>
    clampRail(readStoredNumber(RAIL_WIDTH_KEY, RAIL_DEFAULT)),
  );
  const railStartRef = useRef(railWidth);
  const setRailCollapsed = (collapsed) => {
    setRailCollapsedState(collapsed);
    storeValue(RAIL_COLLAPSED_KEY, collapsed ? 1 : 0);
  };
  const setRailWidth = (width) => {
    setRailWidthState(width);
    storeValue(RAIL_WIDTH_KEY, width);
  };
  // Sub-step row hovered in the step list → its targets light up on the screenshot.
  const [railHover, setRailHover] = useState(null);
  // Tutorial playing in the dialog (examples/editorTutorials id), or null.
  const [tutorialId, setTutorialId] = useState(null);
  // First visit: a short spotlight tour of the editor (closed for good once dismissed).
  const [tourOpen, setTourOpen] = useState(() => readStoredNumber(TOUR_DONE_KEY, 0) !== 1);
  const closeTour = () => {
    setTourOpen(false);
    storeValue(TOUR_DONE_KEY, 1);
  };

  const activeStep = course?.steps.find((s) => s.id === activeStepId) || null;
  const activeStepIndex = course?.steps.findIndex((s) => s.id === activeStepId) ?? -1;
  const activeImageId = course && activeStep ? getStepImageId(course, activeStep) : null;
  // Global Steps (a plain step = a Global Step with one sub-step) and their numbers.
  const stepUnits = course ? getStepUnits(course.steps) : [];
  const stepNumbers = course ? getStepNumbers(course.steps) : [];
  const activeUnitIndex = stepUnits.findIndex(
    (u) => activeStepIndex >= u.start && activeStepIndex <= u.end,
  );
  const activeUnit = activeUnitIndex >= 0 ? stepUnits[activeUnitIndex] : null;
  /** The sub-steps of the active Global Step (at least the active step itself). */
  const activeUnitStart = activeUnit?.start ?? -1;
  const activeUnitEnd = activeUnit?.end ?? -1;
  const activeUnitSteps = useMemo(
    () =>
      course && activeUnitStart >= 0 ? course.steps.slice(activeUnitStart, activeUnitEnd + 1) : [],
    [course, activeUnitStart, activeUnitEnd],
  );

  // ── Load course ──────────────────────────────────────────────────────────
  const loadCourse = useCallback(async () => {
    if (!courseId) return;
    const loaded = await getCourse(courseId);
    if (!loaded) {
      notify('Course not found', 'error');
      navigate('/');
      return;
    }
    // Repair sub-step groups (e.g. after edits in the preview studio) and
    // bring automatic labels up to date ("Step 3 · Area 2" → "Step 3.2").
    const repaired = renumberDefaultLabels(normalizeStepGroups(loaded, () => nextId('group')));
    if (JSON.stringify(repaired) !== JSON.stringify(loaded.steps)) {
      loaded.steps = repaired;
      saveCourse(loaded);
    }
    setCourse(loaded);
    if (loaded.steps.length > 0) setActiveStepId(loaded.steps[0].id);
    setLoading(false);
  }, [courseId, navigate, notify]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  // Resolve the active step's screenshot Blob → data URL whenever it changes.
  useEffect(() => {
    let mounted = true; // ignore results that arrive after a step change/unmount
    setImageUrl(null); // don't show the previous step's image while loading
    if (activeImageId) {
      getMediaAsDataUrl(activeImageId).then((url) => {
        if (mounted) setImageUrl(url);
      });
    }
    return () => {
      mounted = false;
    };
  }, [activeImageId]);

  // ── Course mutations (all autosave) ──────────────────────────────────────

  /** Merge a patch into the course, bump updatedAt, persist. */
  const updateCourse = useCallback((patch) => {
    setCourse((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch, updatedAt: Date.now() };
      saveCourse(updated);
      return updated;
    });
  }, []);

  /** Merge a patch into one step, bump updatedAt, persist. */
  const updateStep = useCallback((stepId, patch) => {
    setCourse((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        steps: prev.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
        updatedAt: Date.now(),
      };
      saveCourse(updated);
      return updated;
    });
  }, []);

  /**
   * Deletes a screenshot Blob unless another step (other than `exceptStepIds`,
   * one id or a list), the legacy course image or the gallery still uses it.
   */
  const releaseImage = useCallback(
    (imageId, exceptStepIds) => {
      if (!course || !imageId || imageId === course.baseImageId) return;
      if (course.gallery?.includes(imageId)) return; // kept for reuse until removed there
      const except = new Set([].concat(exceptStepIds));
      const stillUsed = course.steps.some((s) => !except.has(s.id) && s.imageId === imageId);
      if (!stillUsed) deleteMedia(imageId);
    },
    [course],
  );

  const selectStep = (stepId) => setActiveStepId(stepId);

  /**
   * Inserts a new Global Step (empty, no screenshot yet) at position `index`
   * of the step list and selects it. `index = steps.length` appends.
   */
  const insertStep = useCallback(
    (index) => {
      if (!course || course.steps.length >= MAX_STEPS) return;
      const newStep = createStep(index + 1);
      const steps = [...course.steps];
      steps.splice(index, 0, newStep);
      updateCourse({ steps: renumberDefaultLabels(steps) });
      setActiveStepId(newStep.id);
    },
    [course, updateCourse],
  );

  const addStep = useCallback(() => {
    if (course) insertStep(course.steps.length);
  }, [course, insertStep]);

  /** Removes steps plus their recordings and (unshared) screenshots. */
  const deleteSteps = useCallback(
    (stepIds) => {
      if (!course) return;
      const ids = new Set(stepIds);
      const removed = course.steps.filter((s) => ids.has(s.id));
      const remainingSteps = course.steps.filter((s) => !ids.has(s.id));
      updateCourse({ steps: renumberDefaultLabels(remainingSteps) });
      if (ids.has(activeStepId)) {
        // Deleting a sub-step: stay on the same Global Step (nearest remaining sub-step).
        const deleted = course.steps.find((s) => s.id === activeStepId);
        const index = course.steps.indexOf(deleted);
        const sibling = deleted?.groupId
          ? [...course.steps.slice(index + 1), ...course.steps.slice(0, index).reverse()].find(
              (s) => s.groupId === deleted.groupId && !ids.has(s.id),
            )
          : null;
        setActiveStepId(sibling?.id || remainingSteps[0]?.id || null);
      }
      for (const step of removed) if (step.audioId) deleteMedia(step.audioId); // no orphaned audio
      for (const imageId of new Set(removed.map((s) => s.imageId).filter(Boolean))) {
        releaseImage(imageId, stepIds);
      }
    },
    [course, updateCourse, activeStepId, releaseImage],
  );

  // Always the latest deleteSteps (an "Undo" pressed seconds later must not work
  // on the course as it was when the toast appeared).
  const deleteStepsRef = useRef(deleteSteps);
  deleteStepsRef.current = deleteSteps;

  /** Moves the Global Step at position `from` to position `to` (StepRail drag & drop). */
  const reorderSteps = useCallback(
    (from, to) => {
      if (!course) return;
      const units = getStepUnits(course.steps).map((u) => course.steps.slice(u.start, u.end + 1));
      const [moved] = units.splice(from, 1);
      units.splice(to, 0, moved);
      updateCourse({ steps: renumberDefaultLabels(units.flat()) });
    },
    [course, updateCourse],
  );

  /** Moves the step at `from` to `to` inside its Global Step (StepRail drag & drop). */
  const reorderFeature = useCallback(
    (from, to) => {
      if (!course) return;
      const steps = [...course.steps];
      const [moved] = steps.splice(from, 1);
      steps.splice(to, 0, moved);
      updateCourse({ steps: renumberDefaultLabels(steps) });
    },
    [course, updateCourse],
  );

  /** The Global Step (all its sub-steps) that contains the step at `index`. */
  const unitOf = (index) => stepUnits.find((u) => index >= u.start && index <= u.end);

  /**
   * Delete a sub-step (asks first). The Global Step is required: deleting its
   * only sub-step means deleting the Global Step, and the dialog says so.
   */
  const requestDeleteStep = (stepId) => {
    const index = course.steps.findIndex((s) => s.id === stepId);
    const unit = unitOf(index);
    const name = featureName(stepNumbers[index]);
    if (!unit || unit.start === unit.end) {
      requestDeleteUnit(index);
      return;
    }
    setConfirmAction({
      title: 'Delete feature',
      message: `Delete ${name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => deleteSteps([stepId]),
    });
  };

  /** Delete a whole Global Step (with every sub-step) — `index` is any of its steps. */
  const requestDeleteUnit = (index) => {
    const unit = unitOf(index);
    if (!unit) return;
    const members = course.steps.slice(unit.start, unit.end + 1);
    const main = stepNumbers[unit.start].main;
    setConfirmAction({
      title: 'Delete screen',
      message:
        members.length > 1
          ? `Delete Screen ${main} and its ${members.length} steps? This cannot be undone.`
          : `Delete Screen ${main} with its screenshot and text? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => deleteSteps(members.map((s) => s.id)),
    });
  };

  /** "Delete all": every Global Step, with its sub-steps, screenshots and recordings. */
  const requestDeleteAll = () => {
    const total = course.steps.length;
    if (total === 0) return;
    const mains = stepUnits.length;
    setConfirmAction({
      title: 'Delete all screens',
      message: `Delete all ${mains} screen${mains === 1 ? '' : 's'}${
        total !== mains ? ` (${total} steps)` : ''
      } of this course? This cannot be undone.`,
      confirmLabel: 'Delete all',
      onConfirm: () => deleteSteps(course.steps.map((s) => s.id)),
    });
  };

  // ── Screenshots: the course gallery, screens of a Global Step ────────────

  /** Adds media ids to the course's screenshot gallery (kept for reuse). */
  const addToGallery = useCallback((ids) => {
    setCourse((prev) => {
      if (!prev) return prev;
      const gallery = [...(prev.gallery || [])];
      for (const id of ids) if (id && !gallery.includes(id)) gallery.push(id);
      const updated = { ...prev, gallery, updatedAt: Date.now() };
      saveCourse(updated);
      return updated;
    });
  }, []);

  /** Checks picked/dropped files and stores them in the gallery. Returns their media ids. */
  const storeImageFiles = useCallback(
    async (files) => {
      const ids = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          notify('Please choose an image file (PNG, JPG, ...)', 'error');
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          notify(`${file.name || 'Image'} is over 10MB — skipped`, 'error');
          continue;
        }
        const mediaId = nextId('media');
        await putMedia(mediaId, file);
        ids.push(mediaId);
      }
      addToGallery(ids);
      return ids;
    },
    [notify, addToGallery],
  );

  /**
   * Replaces the CURRENT screen of the active Global Step: every sub-step that
   * shows it (all of them when it has no screenshot yet) gets `newImageId`.
   * The targets pointed at pixels of the old image, so they are cleared;
   * descriptions and voices are kept.
   */
  const setUnitImage = useCallback(
    (newImageId) => {
      if (!activeUnitSteps.length) return;
      const current = activeImageId;
      const affected = activeUnitSteps.filter(
        (s) => !current || getStepImageId(course, s) === current,
      );
      const ids = new Set(affected.map((s) => s.id));
      const oldImageIds = new Set(affected.map((s) => s.imageId).filter(Boolean));
      setCourse((prev) => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          steps: prev.steps.map((s) =>
            ids.has(s.id) ? { ...s, imageId: newImageId, ...withTargets([]) } : s,
          ),
          updatedAt: Date.now(),
        };
        saveCourse(updated);
        return updated;
      });
      for (const oldId of oldImageIds) if (oldId !== newImageId) releaseImage(oldId, [...ids]);
      if (!ids.has(activeStepId)) setActiveStepId(affected[0].id);
    },
    [activeUnitSteps, activeImageId, activeStepId, course, releaseImage],
  );

  /**
   * New sub-steps at the end of the active Global Step, one per screen
   * (e.g. the modal after "Save", after "Delete"…). The first one is selected.
   */
  const addSubStepsWithScreens = useCallback(
    (imageIds) => {
      if (!activeUnit || !imageIds.length) return;
      if (course.steps.length + imageIds.length > MAX_STEPS) {
        notify(`A course can have up to ${MAX_STEPS} steps`, 'error');
        return;
      }
      const groupId = activeUnit.groupId || nextId('group');
      const created = imageIds.map((imageId) => ({ ...createStep(0), imageId, groupId }));
      const steps = course.steps.map((s, i) =>
        i >= activeUnit.start && i <= activeUnit.end && !s.groupId ? { ...s, groupId } : s,
      );
      steps.splice(activeUnit.end + 1, 0, ...created);
      updateCourse({ steps: renumberDefaultLabels(steps) });
      setActiveStepId(created[0].id);
    },
    [activeUnit, course, updateCourse, notify],
  );

  /**
   * Upload / drop / paste on a new Global Step: the first screenshot becomes
   * its screen; any others become sub-steps with their own screen.
   */
  const handleImageFiles = useCallback(
    async (files) => {
      if (!activeStep) return;
      const [first, ...rest] = await storeImageFiles(files);
      if (!first) return;
      const hadImage = !!activeImageId;
      setUnitImage(first);
      if (rest.length) {
        // setUnitImage and this both update the course; run after it has applied.
        setTimeout(() => addSubStepsWithScreensRef.current(rest), 0);
      }
      notify(
        rest.length
          ? `${rest.length + 1} screenshots added, one step each. Now drag a box on each.`
          : hadImage
            ? 'Screenshot replaced. Drag the boxes again; your text is kept.'
            : 'Screenshot added. Now drag a box over what to click.',
        'success',
      );
    },
    [activeStep, activeImageId, storeImageFiles, setUnitImage, notify],
  );
  // Latest version for the deferred call above (the course has changed by then).
  const addSubStepsWithScreensRef = useRef(addSubStepsWithScreens);
  addSubStepsWithScreensRef.current = addSubStepsWithScreens;

  /** "Change screenshot": replaces the current screen with a new upload. */
  const pickReplacementImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const [id] = input.files?.[0] ? await storeImageFiles([input.files[0]]) : [];
      if (!id) return;
      setUnitImage(id);
      notify('Screenshot replaced. Drag the boxes again; your text is kept.', 'success');
    };
    input.click();
  };

  /** "+ Add screens" (Screens strip): each uploaded screen becomes a new sub-step. */
  const addScreens = async (files) => {
    const ids = await storeImageFiles(files);
    if (!ids.length) return;
    addSubStepsWithScreens(ids);
    notify(
      ids.length > 1
        ? `${ids.length} screenshots added, one new step each`
        : 'Screenshot added as a new step. Drag a box on it.',
      'success',
    );
  };

  /** Shows a screen (from this Global Step or the gallery) for the selected sub-step. */
  const showScreenForSubStep = (imageId) => {
    if (!activeStep) return;
    if (!activeImageId) {
      setUnitImage(imageId); // a new Global Step: this becomes its screen
      return;
    }
    // Same modal in another state: the targets usually still fit, so they are kept.
    updateStep(activeStep.id, { imageId });
  };

  // ── Gallery (modal) ──
  const [galleryOpen, setGalleryOpen] = useState(false);
  const courseScreens = course ? getCourseScreens(course) : [];
  const mediaUrls = useMediaUrls(courseScreens);
  const removeFromGallery = (imageId) => {
    const used = course.steps.some((s) => getStepImageId(course, s) === imageId);
    updateCourse({ gallery: (course.gallery || []).filter((id) => id !== imageId) });
    if (!used && imageId !== course.baseImageId) deleteMedia(imageId);
  };

  // Nearest earlier step that has a screenshot → offered as "Use step N's screenshot".
  let reuseSourceIndex = -1;
  if (course && activeStepIndex > 0) {
    for (let i = activeStepIndex - 1; i >= 0; i--) {
      if (getStepImageId(course, course.steps[i])) {
        reuseSourceIndex = i;
        break;
      }
    }
  }
  const reusePreviousImage = () => {
    if (reuseSourceIndex < 0) return;
    setUnitImage(getStepImageId(course, course.steps[reuseSourceIndex]));
  };

  // Screens of the active Global Step (first use order) and which one each sub-step shows.
  const screenOf = {};
  const unitScreens = [];
  for (const s of activeUnitSteps) {
    const id = getStepImageId(course, s);
    screenOf[s.id] = id;
    if (id && !unitScreens.includes(id)) unitScreens.push(id);
  }

  // ── Sub-steps ────────────────────────────────────────────────────────────

  /**
   * "+ Add sub-step": a new sub-step at the end of the active Global Step, on
   * the selected sub-step's screen, selected so the next box drawn becomes its target.
   */
  /** New feature on the active screen (and its screenshot); `region` = its first box. */
  const addSubStep = (region = null) => {
    if (!activeUnit || !activeImageId) return;
    if (course.steps.length >= MAX_STEPS) {
      notify(`A course can have up to ${MAX_STEPS} steps`, 'error');
      return;
    }
    const groupId = activeUnit.groupId || nextId('group');
    const newStep = {
      ...createStep(activeUnit.end + 2),
      imageId: activeImageId,
      groupId,
      ...(region ? withTargets([region]) : {}),
    };
    const steps = course.steps.map((s, i) =>
      i >= activeUnit.start && i <= activeUnit.end && !s.groupId ? { ...s, groupId } : s,
    );
    steps.splice(activeUnit.end + 1, 0, newStep);
    updateCourse({ steps: renumberDefaultLabels(steps) });
    setActiveStepId(newStep.id);
    // Drawing a box is all it takes to add a feature, so a stray drag can add one
    // by accident: offer a one-click way back.
    if (region) {
      notify(`Feature ${activeUnit.end - activeUnit.start + 2} added`, 'info', {
        action: { label: 'Undo', onClick: () => deleteStepsRef.current([newStep.id]) },
      });
    }
  };

  /** Delete a sub-step from the editor: right away when it is still empty, else ask. */
  const deleteSubStep = (stepId) => {
    const step = course.steps.find((s) => s.id === stepId);
    const empty = step && !step.text?.trim() && !step.audioId && !step.region;
    if (empty && activeUnitSteps.length > 1) deleteSteps([stepId]);
    else requestDeleteStep(stepId);
  };

  /** Every sub-step becomes its own Global Step (nothing is deleted). */
  const splitUnit = () => {
    const ids = new Set(activeUnitSteps.map((s) => s.id));
    updateCourse({
      steps: renumberDefaultLabels(
        course.steps.map((s) => (ids.has(s.id) ? { ...s, groupId: null } : s)),
      ),
    });
    notify('Each step is now its own screen', 'success');
  };

  // ── Actions ──────────────────────────────────────────────────────────────

  /** A (sub-)step is ready when it has a screenshot and at least one target. */
  const isStepReady = (step) => !!getStepImageId(course, step) && !!step.region;

  /** Validates every step, marks the course done and opens the share dialog. */
  const markDone = () => {
    if (!course) return;
    if (course.steps.length === 0) {
      notify('Create Screen 1 first', 'error');
      return;
    }
    const missingIndex = course.steps.findIndex((s) => !isStepReady(s));
    if (missingIndex >= 0) {
      const step = course.steps[missingIndex];
      const name = featureName(stepNumbers[missingIndex]);
      notify(
        getStepImageId(course, step)
          ? `${name}: drag a box over what to click first`
          : `${name} needs a screenshot`,
        'error',
      );
      selectStep(step.id);
      return;
    }
    // publishedAt is refreshed every time, so "changed since you shared it"
    // compares against the latest Mark done.
    updateCourse({ status: 'published', publishedAt: Date.now() });
    setShowDone(true);
  };

  // ── Title / page name ────────────────────────────────────────────────────

  const startTitleEdit = () => {
    titleBeforeEditRef.current = course.title;
    setEditingTitle(true);
  };

  /** On blur/Enter: refuse empty or duplicate titles, restoring the old one. */
  const finishTitleEdit = async () => {
    setEditingTitle(false);
    const previous = titleBeforeEditRef.current;
    const next = course.title.trim();
    if (!next) {
      updateCourse({ title: previous });
      return;
    }
    const clash = await findCourseByTitle(next, course.id);
    if (clash) {
      notify(`“${next}” is already used by another course — title not changed`, 'error');
      updateCourse({ title: previous });
      return;
    }
    if (next !== course.title) updateCourse({ title: next });
  };

  // "Convert all voices to text": every recording becomes its step's text,
  // then the AI voice reads it (for people who talk instead of typing).
  const [convertingAll, setConvertingAll] = useState(null); // null | { done, total }
  const convertAllVoices = async () => {
    const withVoice = course.steps.filter((st) => st.audioId);
    if (withVoice.length === 0) return;
    setConvertingAll({ done: 0, total: withVoice.length });
    let failed = 0;
    for (let n = 0; n < withVoice.length; n++) {
      const st = withVoice[n];
      try {
        const blob = await getMedia(st.audioId);
        const text = blob ? await transcribeRecording(blob) : '';
        if (text) {
          updateStep(st.id, { text, audioId: null });
          await deleteMedia(st.audioId);
        } else failed++;
      } catch {
        failed++;
      }
      setConvertingAll({ done: n + 1, total: withVoice.length });
    }
    setConvertingAll(null);
    if (failed)
      notify(`${failed} recording${failed > 1 ? 's' : ''} could not be converted`, 'error');
    else notify('All voices converted to text — the AI voice reads them now', 'success');
  };

  /** "Save": the course is done for now → close the editor, open its watch page. */
  const saveAndWatch = async () => {
    await saveCourse(course);
    storeValue(previewedKey, 1); // the coach's last milestone ("Save it") is done
    navigate(`/preview/${course.id}?saved=1`, { replace: true });
  };

  const handleExport = async () => {
    if (!course) return;
    try {
      await exportCourseZip(course);
      notify('Backup ZIP downloaded', 'success');
    } catch {
      notify('Export failed', 'error');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <PageSpinner />;
  if (!course) return null;

  const readyCount = course.steps.filter(isStepReady).length;
  // The five milestones of the coach, in order; the first not done is "now".
  const coachItems = [
    {
      id: 'screenshot',
      title: 'Add a screenshot',
      how: 'Drop a screenshot of your app into the big box, paste it (Ctrl/⌘ + V), or press Upload screenshot.',
      done: course.steps.some((st) => !!getStepImageId(course, st)),
      target: 'canvas',
      tutorialId: 'screenshot',
    },
    {
      id: 'box',
      title: 'Draw a box',
      how: 'On the screenshot, press and drag to draw a box over the button the viewer should click.',
      done: course.steps.some((st) => !!st.region),
      target: 'canvas',
      tutorialId: 'highlight',
    },
    {
      id: 'text',
      title: 'Write what to do',
      how: 'In the panel on the right, write one short sentence: what should the viewer do here?',
      done: course.steps.some((st) => st.region && st.text?.trim()),
      target: 'steps',
      tutorialId: 'describe',
    },
    {
      id: 'next',
      title: 'Add the next feature',
      how: 'Just draw another box on the screenshot: it becomes the next feature. Did a new page open? Press Add screen.',
      done: course.steps.length > 1,
      target: 'add-step',
      tutorialId: 'step',
    },
    {
      id: 'preview',
      title: 'Save it',
      how: 'Press Save at the top right. It is saved and opens, ready to watch.',
      done: previewed,
      target: 'preview',
      tutorialId: 'share',
    },
  ];
  const allReady = course.steps.length > 0 && readyCount === course.steps.length;
  const isDone = course.status === 'published';
  // Edited after the last Mark done? (small tolerance: Mark done itself bumps updatedAt)
  const changedSinceDone = isDone && course.updatedAt - (course.publishedAt ?? 0) > 1500;

  return (
    <div className="max-w-[1920px] mx-auto px-4 sm:px-6 pt-6 pb-4">
      {/* ── Header row: title · saved · progress · Help · Preview · ⋯ ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Tooltip label="Back to all courses (your work is saved)" side="bottom">
            <button
              onClick={() => navigate('/')}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors flex-shrink-0"
              aria-label="Back to home"
            >
              <ArrowLeft className="w-5 h-5 text-ink-soft dark:text-ink-soft-dark" />
            </button>
          </Tooltip>

          {/* Click-to-edit title (saved on every keystroke) */}
          {editingTitle ? (
            <input
              type="text"
              value={course.title}
              onChange={(e) => updateCourse({ title: e.target.value })}
              onBlur={finishTitleEdit}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              autoFocus
              className="text-lg font-bold bg-transparent outline-none text-ink dark:text-ink-soft-dark border-b border-accent flex-1 min-w-0"
            />
          ) : (
            <Tooltip label="Rename this course" side="bottom" className="min-w-0">
              <button onClick={startTitleEdit} className="flex items-center gap-1.5 group min-w-0">
                <h1 className="text-lg font-bold text-ink dark:text-ink-soft-dark truncate">
                  {course.title}
                </h1>
                <Pencil className="w-3.5 h-3.5 text-ink-faint dark:text-ink-faint-dark opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            </Tooltip>
          )}

          {/* App name: only while it is being changed (from the ⋯ menu) */}
          {editingPageName && (
            <input
              type="text"
              value={course.pageName || ''}
              onChange={(e) => updateCourse({ pageName: e.target.value })}
              onBlur={() => {
                setEditingPageName(false);
                updateCourse({ pageName: (course.pageName || '').trim() });
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              autoFocus
              placeholder="App name"
              aria-label="App name"
              className="text-xs font-medium px-2.5 py-1 rounded-full bg-paper-2 dark:bg-paper-2-dark border border-accent outline-none w-40 flex-shrink-0"
            />
          )}

          {/* Saved state: autosaved; "Save" only lights up after new edits */}
          {/* Autosaved as you work: just a quiet status (the blue "Save" finishes) */}
          <Tooltip label="All changes are saved automatically" side="bottom">
            <span className="flex items-center gap-1 px-2 h-7 text-xs font-semibold text-ink-faint dark:text-ink-faint-dark flex-shrink-0">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          </Tooltip>
          {changedSinceDone && (
            <span className="hidden md:inline text-xs font-medium px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex-shrink-0">
              Changed since you shared it
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Tooltip label="Short tutorials for every action" side="bottom">
            <button
              data-tour="help"
              onClick={() => setTutorialId('start')}
              className={OUTLINE_BUTTON_CLASS}
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Help</span>
            </button>
          </Tooltip>
          {readyCount > 0 && (
            <Tooltip label="Finish: save it and watch your walkthrough" side="bottom">
              <button
                data-tour="preview"
                onClick={saveAndWatch}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors"
              >
                <Check className="w-4 h-4" /> Save
              </button>
            </Tooltip>
          )}
          {/* {isDone && (
            <Tooltip label="Copy a link anyone can open to watch it" side="bottom">
              <button
                onClick={() => sharing.copyLink(course)}
                disabled={sharing.linkBusy}
                className={OUTLINE_BUTTON_CLASS}
              >
                <Link2 className="w-4 h-4" /> Copy link
              </button>
            </Tooltip>
          )} */}
          {/* <Tooltip
            label={
              isDone
                ? 'Get a link, an embed code or a video'
                : 'Finished? Check every step and get a link or a video'
            }
            side="bottom"
          >
            <button
              onClick={markDone}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold text-white transition-all ${
                allReady ? 'bg-accent hover:bg-accent-dark' : 'bg-accent/60 hover:bg-accent/70'
              }`}
            >
              {isDone ? (
                <>
                  <Share2 className="w-4 h-4" /> Share / Download
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Mark done
                </>
              )}
            </button>
          </Tooltip> */}
          <MoreMenu
            label="More options"
            items={[
              { icon: Compass, label: 'Show me around', onClick: () => setTourOpen(true) },
              readyCount > 0 && {
                icon: Eye,
                label: 'Preview and edit',
                onClick: () => setShowPreview(true),
              },
              {
                icon: Video,
                label: course.sourceVideoId
                  ? 'Add steps from your video'
                  : 'Add steps from a video',
                onClick: () => navigate(`/video/${course.id}`),
              },
              {
                icon: Tag,
                label: course.pageName ? `App name: ${course.pageName}` : 'Add app name',
                onClick: () => setEditingPageName(true),
              },
              (convertingAll || course.steps.some((st) => st.audioId)) && {
                icon: convertingAll ? Loader2 : FileText,
                label: convertingAll
                  ? `Converting ${Math.min(convertingAll.done + 1, convertingAll.total)} of ${convertingAll.total}…`
                  : 'Turn recorded voices into text',
                onClick: () => !convertingAll && convertAllVoices(),
              },
              { icon: Archive, label: 'Download a backup (ZIP)', onClick: handleExport },
              stepUnits.length > 0 && {
                icon: Trash2,
                label: 'Delete all screens',
                onClick: requestDeleteAll,
                danger: true,
              },
            ]}
          />
        </div>
      </div>

      {/* ── Workspace: screens | resizer | editor — fills the window on large screens ── */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-0 lg:h-[calc(100vh-var(--hs-editor-chrome))] lg:min-h-[480px] [--hs-editor-chrome:9.5rem]">
        {railCollapsed ? (
          <CollapsedRail
            steps={course.steps}
            activeStepId={activeStepId}
            onSelect={selectStep}
            onAdd={addStep}
            onExpand={() => setRailCollapsed(false)}
            canAdd={course.steps.length < MAX_STEPS}
          />
        ) : (
          <>
            {/* ── Left: screens (scrolls on its own, so the screenshot stays in view) ── */}
            <div
              data-tour="screens"
              className="flex flex-col min-h-0 max-h-[45vh] lg:max-h-none lg:h-full lg:w-[var(--rail-w)] flex-shrink-0"
              style={{ '--rail-w': `${railWidth}px` }}
            >
              <h2 className="flex items-center gap-1 text-xs font-semibold text-ink-faint dark:text-ink-faint-dark uppercase tracking-wider mb-3 flex-shrink-0">
                <Tooltip label="Hide this list to get more room" className="hidden lg:inline-flex">
                  <button
                    onClick={() => setRailCollapsed(true)}
                    className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-paper-2 dark:hover:bg-paper-2-dark hover:text-accent transition-colors"
                    aria-label="Hide the screen list"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                </Tooltip>
                Screens
              </h2>
              <StepRail
                steps={course.steps}
                activeStepId={activeStepId}
                onSelect={selectStep}
                onAdd={addStep}
                onInsert={insertStep}
                onDelete={requestDeleteStep}
                onDeleteUnit={requestDeleteUnit}
                onReorder={reorderSteps}
                onReorderFeature={reorderFeature}
                onHover={setRailHover}
                maxSteps={MAX_STEPS}
                fallbackImageId={course.baseImageId ?? null}
              />
              <div className="mt-auto pt-3 flex-shrink-0">
                <NextStepCoach
                  items={coachItems}
                  onSpotlight={setSpot}
                  onShowTutorial={setTutorialId}
                />
              </div>
            </div>
            <PanelResizer
              label="Drag to resize"
              onResizeStart={() => (railStartRef.current = railWidth)}
              onResize={(dx) => setRailWidth(clampRail(railStartRef.current + dx))}
              onReset={() => setRailWidth(RAIL_DEFAULT)}
            />
          </>
        )}

        {/* ── Main column ── */}
        <div className="flex-1 min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pl-1">
          {activeStep && activeImageId ? (
            <GlobalStepEditor
              mainNumber={activeUnitIndex + 1}
              subSteps={activeUnitSteps}
              activeStepId={activeStep.id}
              imageUrl={imageUrl}
              pageName={course.pageName}
              onSelect={selectStep}
              onUpdateStep={updateStep}
              onAddSubStep={() => addSubStep()}
              onAddFeatureWithBox={(region) => addSubStep(region)}
              onDeleteSubStep={deleteSubStep}
              onChangeScreenshot={pickReplacementImage}
              onSplit={splitUnit}
              onDeleteAll={() => requestDeleteUnit(activeStepIndex)}
              highlightId={railHover}
              screens={unitScreens.map((id) => ({ id, url: mediaUrls[id] }))}
              screenOf={screenOf}
              onUseScreen={showScreenForSubStep}
              onAddScreens={addScreens}
              onOpenGallery={() => setGalleryOpen(true)}
              onShowTutorial={setTutorialId}
              onAddScreen={addStep}
              onFinish={saveAndWatch}
            />
          ) : activeStep ? (
            // A new screen: it needs its screenshot before anything else.
            <div data-tour="canvas" className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-white">
                <span className="text-ink-faint dark:text-ink-faint-dark font-medium">
                  Screen {activeUnitIndex + 1} ›
                </span>
                {activeUnitIndex === 0
                  ? 'Add a screenshot of your app'
                  : 'The new page or popup: add its screenshot'}
                <ShowMe onClick={() => setTutorialId('screenshot')} />
              </p>
              <StepScreenshotUpload
                stepNumber={activeUnitIndex + 1}
                onFiles={handleImageFiles}
                galleryCount={courseScreens.length}
                onOpenGallery={() => setGalleryOpen(true)}
                reuseFromStepNumber={
                  reuseSourceIndex >= 0 ? stepNumbers[reuseSourceIndex].main : null
                }
                onReuse={reusePreviousImage}
                onRecord={() => navigate(`/video/${course.id}`)}
                onShowTutorial={() => setTutorialId('start')}
              />
            </div>
          ) : (
            // No steps yet (new, or everything deleted): pick either way to make it.
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-xl font-bold text-ink dark:text-white">
                How do you want to make it?
              </p>
              <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
                You can mix both in one course at any time.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 w-full max-w-xl text-left">
                <button
                  onClick={addStep}
                  className="group rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark p-5 hover:border-ink-faint dark:hover:border-ink-faint-dark transition-colors"
                >
                  <ImagePlus className="w-6 h-6 text-ink-soft dark:text-ink-soft-dark" />
                  <span className="mt-3 block text-base font-bold text-ink dark:text-white">
                    Add screenshots
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-soft dark:text-ink-faint-dark">
                    Upload a picture of each screen of your app.
                  </span>
                </button>
                <button
                  onClick={() => navigate(`/video/${course.id}`)}
                  className="group rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark p-5 hover:border-ink-faint dark:hover:border-ink-faint-dark transition-colors"
                >
                  <span className="flex w-6 h-6 items-center justify-center">
                    <span className="w-3.5 h-3.5 rounded-full bg-danger" />
                  </span>
                  <span className="mt-3 block text-base font-bold text-ink dark:text-white">
                    Record your screen
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-soft dark:text-ink-faint-dark">
                    Do the task once, then pause to add steps.
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Overlays ── */}
      {showPreview && (
        <PreviewStudio
          course={course}
          onSave={(saved) => {
            const groupedSteps = normalizeStepGroups(saved, () => nextId('group'));
            const next =
              groupedSteps === saved.steps
                ? saved
                : { ...saved, steps: renumberDefaultLabels(groupedSteps) };
            setCourse(next);
            saveCourse(next);
          }}
          onClose={(stepId) => {
            setShowPreview(false);
            if (stepId && course.steps.some((st) => st.id === stepId)) selectStep(stepId);
          }}
        />
      )}

      {showDone && (
        <CourseDoneDialog
          course={course}
          onCopyLink={() => sharing.copyLink(course)}
          onCopyEmbed={() => sharing.copyEmbed(course)}
          onDownloadVideo={() => sharing.downloadVideo(course)}
          linkBusy={sharing.linkBusy}
          videoBusy={sharing.isExportingVideo}
          onClose={() => setShowDone(false)}
          onGoToLibrary={() => navigate('/')}
        />
      )}
      {sharing.overlays}

      {galleryOpen && activeStep && (
        <ScreenGallery
          screens={courseScreens.map((id) => ({
            id,
            url: mediaUrls[id],
            usedBy: course.steps
              .map((st, i) =>
                getStepImageId(course, st) === id ? featureName(stepNumbers[i]) : null,
              )
              .filter(Boolean),
          }))}
          currentId={activeImageId}
          targetLabel={
            activeImageId
              ? featureName(stepNumbers[activeStepIndex])
              : `Screen ${activeUnitIndex + 1}`
          }
          onPick={(id) => {
            showScreenForSubStep(id);
            setGalleryOpen(false);
          }}
          onUpload={(files) => storeImageFiles(files)}
          onRemove={removeFromGallery}
          onClose={() => setGalleryOpen(false)}
        />
      )}

      {/* "Show me where" from the coach: one spotlight on the real spot */}
      <GuidedTour
        steps={spot ? [{ target: spot.target, title: spot.title, text: spot.how }] : []}
        open={!!spot}
        onClose={() => setSpot(null)}
      />

      <GuidedTour steps={EDITOR_TOUR} open={tourOpen && !loading} onClose={closeTour} />

      {tutorialId && <TutorialDialog initialId={tutorialId} onClose={() => setTutorialId(null)} />}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        confirmLabel={confirmAction?.confirmLabel ?? 'Confirm'}
        danger
        onConfirm={() => {
          confirmAction?.onConfirm();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
