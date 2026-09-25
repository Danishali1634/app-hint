/**
 * @file One course card — Home search results, the Library (#/courses) and
 * "Did you mean" suggestions).
 *
 * LAYOUT
 *   thumbnail (first screenshot) · page-name chip · status pill
 *   title (search term highlighted) · steps · last update · auto-delete warning
 *   quick actions: ▶ Preview · ⬇ Download video · 🔗 Share   |   Edit · ⋯ menu
 *   ⋯ menu: Copy embed code · Duplicate · Export ZIP · Delete
 *
 * Presentational: every action is a callback (see hooks/useCourseLibrary.cardProps).
 */

import { useState } from 'react';
import {
  Play,
  Download,
  Link2,
  MoreHorizontal,
  Copy,
  Archive,
  Trash2,
  ImageOff,
  Clock,
  Layers,
  Pencil,
  Code2,
} from 'lucide-react';
import { RETENTION_WARNING_DAYS, STATUS_COLORS, STATUS_LABELS } from '@/constants';
import { formatDate } from '@/utils';
import { getCourseExpiry } from '@/services/storage/db';
import { useCourseThumbnail } from '@/hooks/useCourseThumbnail';

/** @typedef {import('@/types').Course} Course */

const DAY_MS = 86_400_000;

const QUICK_ACTION_CLASS =
  'w-9 h-9 rounded-xl flex items-center justify-center text-ink-soft dark:text-ink-soft-dark hover:bg-accent/10 hover:text-accent disabled:opacity-40 disabled:pointer-events-none transition-colors';
const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark rounded-lg';

/** Wraps the first case-insensitive occurrence of `query` in <mark>. */
function Highlight({ text, query }) {
  const q = query.trim();
  const index = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-accent/20 text-inherit rounded px-0.5">
        {text.slice(index, index + q.length)}
      </mark>
      {text.slice(index + q.length)}
    </>
  );
}

/**
 * @param {{
 *   course: Course,
 *   query?: string,
 *   busy?: boolean,            // a share/video action is running
 *   onEdit: () => void,
 *   onPreview: () => void,
 *   onDownloadVideo: () => void,
 *   onShare: () => void,
 *   onCopyEmbed: () => void,
 *   onDuplicate: () => void,
 *   onExportZip: () => void,
 *   onDelete: () => void,
 * }} props
 */
export function CourseCard({
  course,
  query = '',
  busy = false,
  onEdit,
  onPreview,
  onDownloadVideo,
  onShare,
  onCopyEmbed,
  onDuplicate,
  onExportZip,
  onDelete,
}) {
  const thumbnail = useCourseThumbnail(course);
  const [menuOpen, setMenuOpen] = useState(false);

  const stepCount = course.steps.length;
  const daysLeft = Math.ceil((getCourseExpiry(course) - Date.now()) / DAY_MS);
  const expiresSoon = daysLeft <= RETENTION_WARNING_DAYS;
  const runMenu = (action) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className="group relative flex flex-col rounded-3xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
      {/* ── Thumbnail ── */}
      <button
        onClick={onEdit}
        className="relative aspect-[16/10] overflow-hidden rounded-t-3xl bg-paper-2 dark:bg-paper-2-dark"
        aria-label={`Edit ${course.title}`}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-faint dark:text-ink-faint-dark">
            <ImageOff className="w-7 h-7" />
            <span className="text-xs">No screenshot yet</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
        {course.pageName && (
          <span className="absolute left-3 bottom-3 max-w-[70%] truncate text-xs font-semibold text-white bg-black/45 backdrop-blur px-2.5 py-1 rounded-full">
            <Highlight text={course.pageName} query={query} />
          </span>
        )}
        <span
          className={`absolute right-3 top-3 text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[course.status] || STATUS_COLORS.draft}`}
        >
          {STATUS_LABELS[course.status] || 'Draft'}
        </span>
      </button>

      {/* ── Body ── */}
      <div className="flex-1 px-4 pt-4 pb-3">
        <h3 className="font-semibold text-ink dark:text-ink-soft-dark leading-snug line-clamp-2">
          <Highlight text={course.title} query={query} />
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint dark:text-ink-faint-dark">
          <span className="flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" />
            {stepCount} step{stepCount !== 1 ? 's' : ''}
          </span>
          <span>Updated {formatDate(course.updatedAt)}</span>
        </div>
        {expiresSoon && (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5" />
            Auto-deletes in {Math.max(daysLeft, 0)} day{daysLeft === 1 ? '' : 's'} — edit or
            download to keep
          </p>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center gap-1 px-3 pb-3 pt-1 border-t border-line/60 dark:border-line-dark/60">
        <button
          onClick={onPreview}
          className={QUICK_ACTION_CLASS}
          title="Preview"
          aria-label="Preview"
        >
          <Play className="w-4 h-4" />
        </button>
        <button
          onClick={onDownloadVideo}
          disabled={busy}
          className={QUICK_ACTION_CLASS}
          title="Download video"
          aria-label="Download video"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={onShare}
          disabled={busy}
          className={QUICK_ACTION_CLASS}
          title="Copy share link"
          aria-label="Copy share link"
        >
          <Link2 className="w-4 h-4" />
        </button>
        <button
          onClick={onCopyEmbed}
          disabled={busy}
          className={QUICK_ACTION_CLASS}
          title="Copy embed code"
          aria-label="Copy embed code"
        >
          <Code2 className="w-4 h-4" />
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-medium text-ink dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((open) => !open)}
              className={QUICK_ACTION_CLASS}
              aria-label="More actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                {/* Invisible full-screen layer: clicking outside closes the menu */}
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="hs-caption-in absolute right-0 bottom-11 z-20 w-48 rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-2xl p-1.5">
                  <button onClick={runMenu(onShare)} className={MENU_ITEM_CLASS}>
                    <Link2 className="w-4 h-4" /> Copy link
                  </button>
                  <button onClick={runMenu(onCopyEmbed)} className={MENU_ITEM_CLASS}>
                    <Code2 className="w-4 h-4" /> Copy embed code
                  </button>
                  <button onClick={runMenu(onDuplicate)} className={MENU_ITEM_CLASS}>
                    <Copy className="w-4 h-4" /> Duplicate
                  </button>
                  <button onClick={runMenu(onExportZip)} className={MENU_ITEM_CLASS}>
                    <Archive className="w-4 h-4" /> Export ZIP (backup)
                  </button>
                  <div className="my-1 h-px bg-line dark:bg-line-dark" />
                  <button
                    onClick={runMenu(onDelete)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger hover:bg-danger/10 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" /> Delete course
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
