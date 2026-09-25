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
 *   mount → purgeExpiredCourses() (COURSE_RETENTION_DAYS) → getAllCourses()
 *   any mutation → reload() so the UI always mirrors IndexedDB.
 *
 * USAGE
 *   const library = useCourseLibrary();
 *   <CourseCard {...library.cardProps(course)} />
 *   {library.overlays}   // delete dialog + share/video overlays, render once
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteCourse,
  duplicateCourse,
  getAllCourses,
  purgeExpiredCourses,
} from '@/services/storage/db';
import { exportCourseZip, importCourseZip } from '@/services/export/zip';
import { COURSE_RETENTION_DAYS } from '@/constants';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/hooks/useToast';
import { useCourseSharing } from '@/hooks/useCourseSharing';

/** @typedef {import('@/types').Course} Course */

export function useCourseLibrary() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const sharing = useCourseSharing();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null); // course awaiting confirmation

  const reload = useCallback(async () => {
    setCourses(await getAllCourses());
    setLoading(false);
  }, []);

  // First load: clean up expired courses, then list.
  // `cancelled`: if this effect was superseded (StrictMode re-run, unmount),
  // it must not show the toast — the newer run does.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const removed = await purgeExpiredCourses();
      if (cancelled) return;
      if (removed > 0) {
        notify(
          `${removed} course${removed > 1 ? 's were' : ' was'} removed after ${COURSE_RETENTION_DAYS} days without changes`,
        );
      }
      await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [reload, notify]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null); // close first, so a double-click can't delete twice
    await deleteCourse(target.id); // also deletes its media
    notify(`“${target.title}” deleted`);
    reload();
  };

  const duplicate = async (course) => {
    const copy = await duplicateCourse(course.id);
    notify(`Duplicated as “${copy?.title}”`, 'success');
    reload();
  };

  const exportZip = async (course) => {
    try {
      await exportCourseZip(course);
      notify('Backup ZIP downloaded', 'success');
    } catch {
      notify('Export failed', 'error');
    }
  };

  /** <input type="file"> change handler for importing an exported .zip. */
  const importZip = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importCourseZip(file);
      notify(`Imported “${imported.title}”`, 'success');
      reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Import failed', 'error'); // user-readable
    }
    e.target.value = ''; // allow importing the same file again
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
