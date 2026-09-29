/**
 * @file Route #/new — form to create a course.
 *
 * FIRST CHOICE: how to make it
 *   From screenshots (default) — upload a picture of each screen (the editor).
 *   From a video               — record the screen or upload a video, then add
 *                                steps from it (pages/VideoTour).
 *   `#/new?mode=video` preselects the video option from a link.
 *
 * FIELDS
 *   Course title (required, UNIQUE) — how you'll find it again in search.
 *   Page name    (required)         — the app page/module it explains, e.g.
 *                                     "Return Repack". Also searchable.
 *   What are you showing? · Description (optional)
 *
 * UNIQUE TITLE: checked live (debounced) against IndexedDB and again on
 * submit. If taken, the form shows a link to open the existing course.
 *
 * FLOW: Create → draft Course saved to IndexedDB, then
 *   screenshots → one empty "Step 1" → #/editor/:id ("Add the screenshot for step 1")
 *   video       → no steps, source 'video' → #/video/:id (record or upload)
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Images,
  Video,
} from 'lucide-react';
import { findCourseByTitle, saveCourse } from '@/services/storage/db';
import { CONTEXT_OPTIONS, CONTEXT_LABELS } from '@/constants';
import { nextId } from '@/utils';
import { useToast } from '@/hooks/useToast';
import { Tooltip } from '@/components/ui/Tooltip';

/** @typedef {import('@/types').Course} Course */

const TITLE_CHECK_DELAY_MS = 300;

const INPUT_CLASS =
  'w-full px-4 py-3 rounded-xl bg-paper-2 dark:bg-paper-2-dark border text-sm text-ink dark:text-ink-soft-dark outline-none focus:ring-4 transition-all';
const LABEL_CLASS = 'block text-sm font-semibold text-ink dark:text-ink-soft-dark mb-1.5';

const MODES = [
  {
    value: 'screenshots',
    Icon: Images,
    title: 'From screenshots',
    text: 'Upload a picture of each screen',
    tip: 'Make it from pictures of your screens',
  },
  {
    value: 'video',
    Icon: Video,
    title: 'From a video',
    text: 'Record your screen or upload a video',
    tip: 'Record what you do, then add steps from the video',
  },
];

const modeFromQuery = (params) => (params.get('mode') === 'video' ? 'video' : 'screenshots');

export function NewCoursePage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(() => modeFromQuery(searchParams));
  const [title, setTitle] = useState('');
  const [pageName, setPageName] = useState('');
  // setContext: used by the "What are you showing?" picker (hidden for now).
  // eslint-disable-next-line no-unused-vars
  const [context, setContext] = useState('page_feature');
  const [description, setDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [creating, setCreating] = useState(false);
  /** Course that already uses the typed title (null = title is free). */
  const [titleClash, setTitleClash] = useState(null);

  // A link to #/new?mode=… while already on this page.
  useEffect(() => {
    setMode(modeFromQuery(searchParams));
  }, [searchParams]);

  // Live unique-title check, debounced so we don't query on every keystroke.
  useEffect(() => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleClash(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const existing = await findCourseByTitle(trimmed);
      if (!cancelled) setTitleClash(existing || null);
    }, TITLE_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [title]);

  const canCreate = title.trim() && pageName.trim() && !titleClash && !creating;

  const handleCreate = async () => {
    if (!title.trim() || !pageName.trim()) {
      notify('Please enter a course title and the page name', 'error');
      return;
    }
    setCreating(true);
    // Check again: another tab may have created the same title meanwhile.
    const existing = await findCourseByTitle(title.trim());
    if (existing) {
      setTitleClash(existing);
      setCreating(false);
      return;
    }
    const fromVideo = mode === 'video';
    /** @type {Course} */
    const course = {
      id: nextId('course'),
      title: title.trim(),
      pageName: pageName.trim(),
      context,
      description: description.trim(),
      status: 'draft',
      baseImageId: null, // legacy field; screenshots now live on each step
      source: fromVideo ? 'video' : 'screenshots',
      ...(fromVideo && { sourceVideoId: null }),
      // Video courses get their steps from the video (#/video/:id).
      steps: fromVideo
        ? []
        : [
            {
              id: nextId('step'),
              label: 'Step 1',
              text: '',
              imageId: null,
              region: null,
              action: 'click',
              audioId: null,
            },
          ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      publishedAt: null,
    };
    await saveCourse(course);
    notify('Course created', 'success');
    // replace: the form is not a page to come back to (Back from the finished
    // walkthrough should never land in the creation flow again)
    navigate(fromVideo ? `/video/${course.id}` : `/editor/${course.id}`, { replace: true });
  };

  const submitOnEnter = (e) => {
    if (e.key === 'Enter' && canCreate) handleCreate();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <Tooltip label="Go back to your courses" className="mb-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-ink-soft dark:text-ink-soft-dark hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to courses
        </button>
      </Tooltip>

      <div className="relative overflow-hidden rounded-3xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-sm p-6 sm:p-10">
        <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-accent/10 blur-3xl pointer-events-none" />

        <div className="relative mb-8">
          {/* <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-accent mb-2">
            <Sparkles className="w-3.5 h-3.5" /> New walkthrough
          </p> */}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink dark:text-ink-soft-dark">
            What are you explaining?
          </h1>
          <p className="text-sm text-ink-soft dark:text-ink-soft-dark mt-2">
            Pick how you want to make it, then give it a name.
          </p>
        </div>

        <div className="relative space-y-6">
          {/* How to make it */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            role="radiogroup"
            aria-label="Make it"
          >
            {MODES.map(({ value, Icon, title: modeTitle, text, tip }) => {
              const chosen = mode === value;
              return (
                <Tooltip key={value} label={tip} className="w-full">
                  <button
                    role="radio"
                    aria-checked={chosen}
                    onClick={() => setMode(value)}
                    className={`relative w-full flex items-center gap-3.5 p-4 sm:p-5 rounded-2xl border-2 text-left transition-all ${
                      chosen
                        ? 'border-accent bg-accent-soft/40 dark:bg-accent-soft-dark/25 ring-4 ring-accent/10'
                        : 'border-line dark:border-line-dark hover:border-accent/50'
                    }`}
                  >
                    <span
                      className={`w-12 h-12 flex-shrink-0 rounded-xl flex items-center justify-center ${
                        chosen
                          ? 'bg-accent text-white'
                          : 'bg-paper-2 dark:bg-paper-2-dark text-ink-soft dark:text-ink-soft-dark'
                      }`}
                    >
                      <Icon className="w-6 h-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-bold text-ink dark:text-ink-soft-dark">
                        {modeTitle}
                      </span>
                      <span className="block text-xs text-ink-soft dark:text-ink-faint-dark mt-0.5">
                        {text}
                      </span>
                    </span>
                    {chosen && (
                      <CheckCircle2 className="absolute top-2.5 right-2.5 w-4 h-4 text-accent" />
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className={LABEL_CLASS}>
              Course title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={submitOnEnter}
              placeholder="e.g. How to view graph data"
              autoFocus
              className={`${INPUT_CLASS} ${
                titleClash
                  ? 'border-danger focus:ring-danger/15'
                  : 'border-line dark:border-line-dark focus:border-accent focus:ring-accent/15'
              }`}
              aria-invalid={!!titleClash}
            />
            {titleClash ? (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-danger">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />A course with this title
                already exists.
                <Link to={`/editor/${titleClash.id}`} className="font-semibold underline">
                  Open it
                </Link>
                or choose another title.
              </p>
            ) : (
              title.trim() && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-teal dark:text-teal-dark">
                  <CheckCircle2 className="w-3.5 h-3.5" /> This title is available
                </p>
              )
            )}
          </div>

          {/* Page name */}
          <div>
            <label htmlFor="pageName" className={LABEL_CLASS}>
              Page name
            </label>
            <input
              id="pageName"
              type="text"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              onKeyDown={submitOnEnter}
              placeholder="e.g. Return Repack, Receive Stock"
              className={`${INPUT_CLASS} border-line dark:border-line-dark focus:border-accent focus:ring-accent/15`}
            />
            <p className="mt-1.5 text-xs text-ink-faint dark:text-ink-faint-dark">
              The part of your app it is about.
            </p>
          </div>

          {/* Context */}
          {/* <div>
            <span className={LABEL_CLASS}>What are you showing?</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {CONTEXT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setContext(opt.value)}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    context === opt.value
                      ? 'border-accent bg-accent-soft/30 dark:bg-accent-soft-dark/20 ring-4 ring-accent/10'
                      : 'border-line dark:border-line-dark hover:border-ink-faint dark:hover:border-ink-faint-dark'
                  }`}
                >
                  <span className="text-sm font-medium text-ink dark:text-ink-soft-dark block">
                    {opt.label}
                  </span>
                  <span className="text-xs text-ink-faint dark:text-ink-faint-dark mt-0.5 block">
                    {CONTEXT_LABELS[opt.value]}
                  </span>
                </button>
              ))}
            </div>
          </div> */}

          {/* Description: optional, so hidden until asked for */}
          {showDescription ? (
            <div>
              <label htmlFor="description" className={LABEL_CLASS}>
                Description{' '}
                <span className="text-ink-faint dark:text-ink-faint-dark font-normal">
                  (optional)
                </span>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this walkthrough show?"
                rows={3}
                autoFocus
                className={`${INPUT_CLASS} border-line dark:border-line-dark focus:border-accent focus:ring-accent/15 resize-none`}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowDescription(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
            >
              <Plus className="w-4 h-4" /> Add a description (optional)
            </button>
          )}

          <Tooltip
            label={
              mode === 'video'
                ? 'Create it, then record or upload your video'
                : 'Create it, then add your screenshots'
            }
            shortcut="Enter"
            className="w-full"
          >
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              className="w-full flex items-center justify-center gap-2 px-4 h-12 rounded-xl bg-accent text-white font-semibold shadow-lg shadow-accent/25 hover:bg-accent-dark disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all"
            >
              {creating ? (
                'Creating…'
              ) : mode === 'video' ? (
                <>
                  <span className="w-3 h-3 rounded-full bg-white" aria-hidden="true" /> Continue to
                  recording
                </>
              ) : (
                <>
                  Continue to screenshots <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
