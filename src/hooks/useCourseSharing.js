/**
 * @file useCourseSharing — "Copy link", "Copy embed code" and "Download video".
 *
 * WHY THIS HOOK EXISTS
 *   The same actions appear on every course card, in search results and
 *   in the editor's "Mark done" dialog. Each needs async work, progress UI,
 *   error toasts and a fallback, so the logic lives here once and every screen
 *   just calls copyLink(course) / downloadVideo(course) and renders `overlays`.
 *
 * COPY LINK
 *   encodeShareableCourse → buildShareUrl → clipboard. If the browser refuses
 *   the clipboard (e.g. Safari after a slow async step), a modal with the link
 *   and a Copy button is shown instead, so the user is never stuck.
 *
 * COPY EMBED CODE
 *   Same course data as the link, but pointing at #/e (player only) and
 *   wrapped in a responsive YouTube-style <iframe> snippet.
 *
 * DOWNLOAD VIDEO
 *   quality dialog (Full HD 1080p; the Fast 480p option is disabled for now)
 *   → buildWalkthroughSteps → exportWalkthroughVideo (WebCodecs encode, usually
 *   seconds) → downloadBlob. A progress overlay with Cancel is shown meanwhile.
 */

import { useCallback, useRef, useState } from 'react';
import {
  buildEmbedCode,
  buildEmbedUrl,
  buildShareUrl,
  buildWalkthroughSteps,
  encodeShareableCourse,
} from '@/services/sharing/share';
import { exportWalkthroughVideo, isVideoExportSupported } from '@/services/video/exportVideo';
import { downloadBlob, slug } from '@/utils';
import { useToast } from '@/hooks/useToast';
import { ShareLinkModal } from '@/components/course/ShareLinkModal';
import { VideoExportOverlay } from '@/components/course/VideoExportOverlay';
import { VideoQualityDialog } from '@/components/course/VideoQualityDialog';

const QUALITY_KEY = 'videoQuality';
// "Fast" (480p) is disabled for now, so every download is HD. Kept for later:
// const readQuality = () => {
//   try {
//     return localStorage.getItem(QUALITY_KEY) === 'fast' ? 'fast' : 'hd';
//   } catch {
//     return 'hd';
//   }
// };
const readQuality = () => 'hd';
const saveQuality = (quality) => {
  try {
    localStorage.setItem(QUALITY_KEY, quality);
  } catch {
    // private mode: just not remembered
  }
};

/** @typedef {import('@/types').Course} Course */

export function useCourseSharing() {
  const { notify } = useToast();
  const [fallbackUrl, setFallbackUrl] = useState(null);
  const [fallbackEmbed, setFallbackEmbed] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [video, setVideo] = useState(null); // { title, progress } while exporting
  const [qualityFor, setQualityFor] = useState(null); // course whose video quality is being picked
  const abortRef = useRef(null);

  /** Builds the share link and copies it. Resolves true if it was copied. */
  const copyLink = useCallback(
    /** @param {Course} course */
    async (course) => {
      setLinkBusy(true);
      try {
        const url = buildShareUrl(course, await encodeShareableCourse(course));
        try {
          await navigator.clipboard.writeText(url);
          notify('Link copied — anyone who opens it can watch this course', 'success');
          return true;
        } catch {
          setFallbackUrl(url); // clipboard blocked → let the user copy manually
          return false;
        }
      } catch {
        notify('Could not create the share link', 'error');
        return false;
      } finally {
        setLinkBusy(false);
      }
    },
    [notify],
  );

  /** Builds the <iframe> embed snippet and copies it. Resolves true if copied. */
  const copyEmbed = useCallback(
    /** @param {Course} course */
    async (course) => {
      setLinkBusy(true);
      try {
        const encoded = await encodeShareableCourse(course);
        const code = buildEmbedCode(buildEmbedUrl(course, encoded), course.title);
        try {
          await navigator.clipboard.writeText(code);
          notify('Embed code copied — paste it into any web page', 'success');
          return true;
        } catch {
          setFallbackEmbed(code);
          return false;
        }
      } catch {
        notify('Could not create the embed code', 'error');
        return false;
      } finally {
        setLinkBusy(false);
      }
    },
    [notify],
  );

  /** Asks for the quality, then records the walkthrough as a video and downloads it. */
  const downloadVideo = useCallback(
    /** @param {Course} course */
    (course) => {
      if (!isVideoExportSupported()) {
        notify('Video download is not supported in this browser. Try Chrome or Edge.', 'error');
        return;
      }
      setQualityFor(course);
    },
    [notify],
  );

  const recordVideo = useCallback(
    /**
     * @param {Course} course
     * @param {import('@/services/video/exportVideo').VideoQuality} quality
     */
    async (course, quality) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setVideo({ title: course.title, progress: 0, stage: 'prepare' });
      try {
        const steps = await buildWalkthroughSteps(course);
        const { blob, extension, silentSteps } = await exportWalkthroughVideo(steps, {
          title: course.title,
          quality,
          signal: controller.signal,
          onStage: (stage, fraction = 0) =>
            setVideo((v) => (v ? { ...v, stage, progress: stage === 'voice' ? fraction : 0 } : v)),
          onProgress: (progress) => setVideo((v) => (v ? { ...v, progress } : v)),
        });
        downloadBlob(blob, `${slug(course.title) || 'walkthrough'}.${extension}`);
        if (silentSteps > 0) {
          notify(
            `Video downloaded — the AI voice couldn't load, so ${silentSteps} text step${silentSteps > 1 ? 's are' : ' is'} silent (check your internet)`,
            'error',
          );
        } else {
          notify('Video downloaded', 'success');
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          notify(err instanceof Error ? err.message : 'Video download failed', 'error');
        }
      } finally {
        abortRef.current = null;
        setVideo(null);
      }
    },
    [notify],
  );

  const cancelVideo = useCallback(() => abortRef.current?.abort(), []);

  /** Render this once in the page that uses the hook. */
  const overlays = (
    <>
      {qualityFor && (
        <VideoQualityDialog
          title={qualityFor.title}
          initial={readQuality()}
          onClose={() => setQualityFor(null)}
          onChoose={(quality) => {
            saveQuality(quality);
            setQualityFor(null);
            recordVideo(qualityFor, quality);
          }}
        />
      )}
      {video && (
        <VideoExportOverlay
          title={video.title}
          stage={video.stage}
          progress={video.progress}
          onCancel={cancelVideo}
        />
      )}
      {fallbackUrl && (
        <ShareLinkModal
          url={fallbackUrl}
          title="Share this course"
          description="Anyone with this link can open and play the course in their browser."
          note="Links contain the whole course, so they can be long. For very large courses, download the video instead."
          copiedMessage="Link copied"
          onClose={() => setFallbackUrl(null)}
        />
      )}
      {fallbackEmbed && (
        <ShareLinkModal
          url={fallbackEmbed}
          title="Embed this course"
          description="Paste this code into any web page, wiki or LMS that allows iframes."
          note="The embed contains the whole course, so the code can be long."
          copiedMessage="Embed code copied"
          onClose={() => setFallbackEmbed(null)}
        />
      )}
    </>
  );

  return { copyLink, copyEmbed, downloadVideo, linkBusy, isExportingVideo: !!video, overlays };
}
