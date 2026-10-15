/**
 * @file Choose another moment of the recording for a step that was made from
 * a video ("Create by video"), right in the preview studio's edit panel.
 *
 * Opens at the step's moment. The author nudges it back or forward (±0.1 s for
 * a frame or two, ±1 s, the slider, or ← → / Shift+← → keys), or plays a bit,
 * and presses "Use this frame": the frame becomes the step's new screenshot
 * (services/video/captureFrame). The box stays where it was, since the screen
 * usually looks the same a moment earlier or later; it can be redrawn below.
 */

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Check, X, Loader2, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { getMedia } from '@/services/storage/db';
import { resolveVideoDuration } from '@/services/video/screenRecorder';
import { captureFrame } from '@/services/video/captureFrame';
import { formatDuration } from '@/utils';
import { Tooltip } from '@/components/ui/Tooltip';

const SMALL_STEP_SEC = 0.1;
const BIG_STEP_SEC = 1;

/** "0:12.4": a tenth of a second matters when picking a frame. */
const preciseTime = (seconds) =>
  `${formatDuration(Math.floor(seconds))}.${Math.floor((seconds % 1) * 10)}`;

/**
 * @param {{
 *   videoId: string,              // media id of the recording
 *   time: number,                 // the step's moment, seconds
 *   knownDuration?: number | null, // CourseVideo.duration (WebM files often report none)
 *   onUse: (frame: Blob, seconds: number) => Promise<void>,
 *   onCancel: () => void,
 * }} props
 */
export function VideoFramePicker({ videoId, time, knownDuration, onUse, onCancel }) {
  const videoRef = useRef(null);
  const [url, setUrl] = useState(null);
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [at, setAt] = useState(time);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    getMedia(videoId)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setMissing(true);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [videoId]);

  // Smooth slider while playing.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (videoRef.current) setAt(videoRef.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const handleMetadata = async () => {
    const video = videoRef.current;
    if (!video) return;
    const real = await resolveVideoDuration(video, knownDuration || 0);
    if (videoRef.current !== video) return;
    setDuration(real);
    const start = Math.min(real || time, Math.max(0, time));
    video.currentTime = start;
    setAt(start);
    setReady(true);
  };

  const seek = (seconds) => {
    const video = videoRef.current;
    if (!video || !ready) return;
    video.pause();
    const t = Math.min(duration || seconds, Math.max(0, seconds));
    video.currentTime = t;
    setAt(t);
  };
  const nudge = (delta) => seek((videoRef.current?.currentTime ?? at) + delta);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const applyFrame = async () => {
    const video = videoRef.current;
    if (!video || !ready || busy) return;
    video.pause();
    setBusy(true);
    try {
      const frame = await captureFrame(video);
      await onUse(frame, Math.round(video.currentTime * 1000) / 1000);
    } catch {
      // The caller says what went wrong; here we just let the author try again.
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.target.closest?.('input[type="range"]')) return; // the slider has its own keys
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation(); // not the player's "previous / next step"
      const size = e.shiftKey ? BIG_STEP_SEC : SMALL_STEP_SEC;
      nudge(e.key === 'ArrowLeft' ? -size : size);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      applyFrame();
    }
  };

  if (missing) {
    return (
      <div className="rounded-xl border border-line dark:border-line-dark p-3 text-xs text-ink-soft dark:text-ink-soft-dark flex items-center justify-between gap-2">
        The video of this step was removed, so its moment can&apos;t be changed.
        <button onClick={onCancel} className="font-semibold text-accent hover:underline">
          OK
        </button>
      </div>
    );
  }

  const nudgeButton = (delta, label, tip, Icon) => (
    <Tooltip label={tip}>
      <button
        onClick={() => nudge(delta)}
        disabled={!ready}
        className="flex items-center justify-center gap-0.5 h-8 px-2 rounded-lg border border-line dark:border-line-dark text-xs font-semibold text-ink dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark disabled:opacity-50 tabular-nums"
      >
        {Icon && delta < 0 && <Icon className="w-3.5 h-3.5" />}
        {label}
        {Icon && delta > 0 && <Icon className="w-3.5 h-3.5" />}
      </button>
    </Tooltip>
  );

  return (
    <div
      className="rounded-xl border border-accent/40 bg-paper-2/60 dark:bg-paper-2-dark/60 p-2.5 space-y-2.5 outline-none"
      onKeyDown={onKeyDown}
      tabIndex={-1}
      role="group"
      aria-label="Choose the moment of the video"
    >
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black flex items-center justify-center">
        {url && (
          <video
            ref={videoRef}
            src={url}
            muted
            playsInline
            preload="auto"
            className="w-full h-full object-contain"
            onClick={togglePlay}
            onLoadedMetadata={handleMetadata}
            onSeeked={(e) => ready && setAt(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        )}
        {!ready && (
          <Loader2 className="absolute w-6 h-6 animate-spin text-white/80" aria-label="Loading" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          disabled={!ready}
          className="w-8 h-8 rounded-full flex items-center justify-center bg-accent text-white hover:bg-accent-dark disabled:opacity-50 flex-shrink-0"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.04}
          value={Math.min(at, duration || at)}
          disabled={!ready}
          onChange={(e) => seek(Number(e.target.value))}
          className="flex-1 accent-accent"
          aria-label="Moment in the video"
        />
        <span className="text-[11px] font-semibold tabular-nums text-ink-soft dark:text-ink-soft-dark whitespace-nowrap">
          {preciseTime(at)}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {nudgeButton(-BIG_STEP_SEC, '1s', 'One second earlier (Shift + ←)', ChevronsLeft)}
        {nudgeButton(-SMALL_STEP_SEC, '−0.1s', 'A little earlier (←)')}
        {nudgeButton(SMALL_STEP_SEC, '+0.1s', 'A little later (→)')}
        {nudgeButton(BIG_STEP_SEC, '1s', 'One second later (Shift + →)', ChevronsRight)}
      </div>

      <div className="flex items-center gap-2">
        <span className="flex-1 text-[11px] text-ink-faint dark:text-ink-faint-dark">
          Was {preciseTime(time)}
        </span>
        <button
          onClick={onCancel}
          className="flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-semibold text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark"
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button
          onClick={applyFrame}
          disabled={!ready || busy}
          className="flex items-center gap-1 h-8 px-3 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-dark disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          Use this frame
        </button>
      </div>
    </div>
  );
}
