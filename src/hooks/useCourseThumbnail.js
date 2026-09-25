/**
 * @file useCourseThumbnail — object URL of a course's first screenshot, for
 * course cards.
 *
 * WHY OBJECT URLs (not data URLs)
 *   The library can show many cards. URL.createObjectURL points at the Blob
 *   already in memory instead of copying it into a huge base64 string, and the
 *   URL is revoked when the card unmounts so memory is released.
 *
 * Used by: components/course/CourseCard.js
 */

import { useEffect, useState } from 'react';
import { getMedia } from '@/services/storage/db';
import { getStepImageId } from '@/utils/course';

/** @typedef {import('@/types').Course} Course */

/**
 * @param {Course} course
 * @returns {string | null}
 */
export function useCourseThumbnail(course) {
  const firstStep = course.steps.find((step) => getStepImageId(course, step));
  const imageId = firstStep ? getStepImageId(course, firstStep) : null;
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    setUrl(null);
    if (imageId) {
      getMedia(imageId).then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      });
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId]);

  return url;
}
