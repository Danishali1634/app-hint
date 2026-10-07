/**
 * @file useCourseLibrary — the saved courses plus every action on them.
 *
 * WHY THIS HOOK EXISTS
 *   Both the Home page (search) and the Library page (#/courses) show course
 *   cards with the same actions: Preview, Download video, Copy link, Copy embed,
 *   Edit, Duplicate, Export ZIP, Delete (+ Import). Keeping loading, the
 *   auto-delete cleanup, toasts and the delete confirmation here means both
 *   pages behave identically and each page only decides its layout.
 *
 * FLOW
 *   courses come from the global list (hooks/useCourses), not a fetch of their own.
 *   mount → purgeExpiredCourses() (COURSE_RETENTION_DAYS) → reload()
 *   actions run through the global loading screen (hooks/useLoading): the app is
 *   locked while they run and ALWAYS unlocked again, also when the API fails.
 *
 * USAGE
 *   const library = useCourseLibrary();
 *   <CourseCard {...library.cardProps(course)} />
 *   {library.overlays}   // delete dialog + share/video overlays, render once
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteCourse, duplicateCourse, purgeExpiredCourses } from '@/services/storage/db';
import { exportCourseZip, importCourseZip } from '@/services/export/zip';
import { COURSE_RETENTION_DAYS } from '@/constants';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from 'react-toastify';
import { useCourseSharing } from '@/hooks/useCourseSharing';
import { useCourses } from '@/hooks/useCourses';
import { useLoading } from '@/hooks/useLoading';

/** @typedef {import('@/types').Course} Course */

export function useCourseLibrary() {
  const navigate = useNavigate();
  const sharing = useCourseSharing();
  const { courses, loading, reload } = useCourses();
  const { run } = useLoading();
  const [deleteTarget, setDeleteTarget] = useState(null); // course awaiting confirmation

  /**
   * Runs an action behind the global "please wait" screen.
   * On error it shows a message. Returns the result, or undefined if cancelled / failed.
   */
  const action = async (task, message, failMessage) => {
    try {
      return await run(task, message);
    } catch (err) {
      toast.error(`${failMessage}: ${err.message}`);
      return undefined;
    }
  };

  // First load: clean up expired courses, then list.
  // `cancelled`: if this effect was superseded (StrictMode re-run, unmount),
  // it must not show the toast — the newer run does.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await purgeExpiredCourses();
      } catch (err) {
        console.warn('Auto-delete of old courses failed:', err.message); // not worth a toast
      }
      if (cancelled) return;
      await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null); // close first, so a double-click can't delete twice
    const done = await action(
      async () => {
        await deleteCourse(target.id); // also deletes its media
        return true;
      },
      'Deleting the course…',
      'Could not delete the course',
    );
    if (done) toast(`“${target.title}” deleted`);
    reload();
  };

  const duplicate = async (course) => {
    const copy = await action(
      () => duplicateCourse(course.id),
      'Duplicating the course…',
      'Could not duplicate the course',
    );
    if (copy) toast.success(`Duplicated as “${copy.title}”`);
    reload();
  };

  const exportZip = async (course) => {
    const done = await action(
      async () => {
        await exportCourseZip(course);
        return true;
      },
      'Preparing the backup ZIP…',
      'Export failed',
    );
    if (done) toast.success('Backup ZIP downloaded');
  };

  /** <input type="file"> change handler for importing an exported .zip. */
  const importZip = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow importing the same file again
    const imported = await action(
      () => importCourseZip(file),
      'Importing the course…',
      'Import failed',
    );
    if (imported) toast.success(`Imported “${imported.title}”`);
    reload();
  };

  /** All CourseCard callbacks for one course. */
  const cardProps = (course, query = '') => ({
    course,
    query,
    busy: sharing.linkBusy || sharing.isExportingVideo,
    onEdit: () => navigate(`/editor/${course.id}`),
    onPreview: () => navigate(`/preview/${course.id}`),
    onDownloadVideo: () => sharing.downloadVideo(course),
    onShare: () => sharing.copyLink(course),
    onCopyEmbed: () => sharing.copyEmbed(course),
    onDuplicate: () => duplicate(course),
    onExportZip: () => exportZip(course),
    onDelete: () => setDeleteTarget(course),
  });

  const overlays = (
    <>
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete course"
        message={`Delete “${deleteTarget?.title}” and all its screenshots and recordings? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      {sharing.overlays}
    </>
  );

  return { courses, loading, reload, importZip, cardProps, overlays };
}
