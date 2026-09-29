/**
 * @file useMediaUrls — object URLs for a list of stored media ids (thumbnails).
 *
 * Each Blob is read from IndexedDB once and turned into an object URL
 * (cheaper than a data URL for many images); URLs are cached while the
 * component lives and revoked when it unmounts. Ids that disappear from the
 * list keep their URL until then (they may come back, e.g. after undo).
 */

import { useEffect, useRef, useState } from 'react';
import { getMedia } from '@/services/storage/db';

/**
 * @param {string[]} ids
 * @returns {Record<string, string>} media id → object URL (missing while loading)
 */
export function useMediaUrls(ids) {
  const [urls, setUrls] = useState({});
  const cacheRef = useRef(new Map()); // id → url | 'loading'
  const key = ids.join('|');

  useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;
    for (const id of ids) {
      if (cache.has(id)) continue;
      cache.set(id, 'loading');
      getMedia(id).then((blob) => {
        if (cancelled || !blob) {
          cache.delete(id);
          return;
        }
        const url = URL.createObjectURL(blob);
        cache.set(id, url);
        setUrls((prev) => ({ ...prev, [id]: url }));
      });
    }
    return () => {
      cancelled = true;
      // Loads still pending are retried by the next run.
      for (const [id, value] of cache) if (value === 'loading') cache.delete(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      for (const value of cache.values()) if (value !== 'loading') URL.revokeObjectURL(value);
    };
  }, []);

  return urls;
}
