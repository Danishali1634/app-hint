/**
 * @file Upload area shown when the active step has no screenshot yet.
 *
 * Three ways to add a screenshot:
 *   1. Click "Upload screenshot"   → file picker
 *   2. Drag & drop an image file onto the area
 *   3. Paste (Ctrl/Cmd + V) an image — handy right after taking a screenshot
 * Plus "Use Step N's screenshot" to reuse the previous step's image (e.g. two
 * buttons on the same page), and "Choose from this course's screenshots" (the
 * gallery) — both without storing a second copy.
 *
 * SEVERAL AT ONCE (when `onFiles` is given): pick, drop or paste many
 * screenshots; the parent uses the first for this step and turns the others
 * into sub-steps with their own screen.
 *
 * PRO (hooks/usePlan): screen recording and dropping several screenshots at
 * once are Pro features with a few free tries. Out of tries → the upgrade
 * dialog opens (several files: only the first one is used).
 *
 * This component only hands Files back to the parent (onFile / onFiles);
 * validation and storage happen in CourseEditorPage.
 */

import { useCallback, useEffect, useState } from 'react';
import { Upload, Copy, Images, PlayCircle, Layers } from 'lucide-react';
import { MiniHint } from '@/components/tutorial/MiniHint';
import { Tooltip } from '@/components/ui/Tooltip';
import { ProBadge } from '@/components/ui/ProBadge';
import { usePlan } from '@/hooks/usePlan';

const SECONDARY_BUTTON =
  'flex items-center gap-2 px-4 py-2.5 rounded-xl border border-line dark:border-line-dark bg-panel/80 dark:bg-panel-dark/80 text-sm font-semibold text-ink dark:text-ink-soft-dark hover:border-accent/50 hover:shadow-premium transition-all';

/**
 * @param {{
 *   stepNumber: number,
 *   onFile?: (file: File) => void,        // one screenshot
 *   onFiles?: (files: File[]) => void,    // several at once (preferred when given)
 *   reuseFromStepNumber: number | null,   // nearest earlier step with a screenshot
 *   onReuse: () => void,
 *   galleryCount?: number,                // screenshots already in this course
 *   onOpenGallery?: () => void,
 *   onRecord?: () => void,                // make it from a screen recording instead
 *   onShowTutorial?: () => void,          // "View tutorial: creating with screenshots"
 * }} props
 */
export function StepScreenshotUpload({
  onFile,
  onFiles,
  reuseFromStepNumber,
  onReuse,
  galleryCount = 0,
  onOpenGallery,
  onRecord,
  onShowTutorial,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { triesLeft, tryFeature } = usePlan();

  const deliver = useCallback(
    (files) => {
      const images = files.filter((f) => f.type.startsWith('image/'));
      // Not an image: pass it on anyway so the parent shows its "wrong file" message.
      const list = images.length ? images : files.slice(0, 1);
      if (!onFiles) return onFile?.(list[0]);
      // Several at once is Pro: out of free tries → just the first one.
      if (list.length > 1 && !tryFeature('bulkUpload')) return onFiles(list.slice(0, 1));
      onFiles(list);
    },
    [onFile, onFiles, tryFeature],
  );

  // Paste support: active only while this upload area is on screen.
  useEffect(() => {
    const handlePaste = (e) => {
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        deliver(files);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [deliver]);

  const pickFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = !!onFiles;
    input.onchange = () => input.files?.length && deliver([...input.files]);
    input.click();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = [...(e.dataTransfer.files || [])];
    if (files.length) deliver(files);
  };

  const record = () => {
    if (tryFeature('screenRecording')) onRecord();
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`relative overflow-hidden flex flex-col items-center justify-center py-14 px-6 text-center rounded-2xl border-2 border-dashed transition-all duration-200 ${
        isDragOver
          ? 'border-accent bg-accent-soft/60 dark:bg-accent-soft-dark/30 shadow-glow scale-[1.01]'
          : 'border-line dark:border-line-dark bg-gradient-to-b from-panel to-paper dark:from-panel-dark dark:to-paper-dark hover:border-accent/40'
      }`}
    >
      {/* Soft brand glow behind the illustration */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[28rem] h-56 rounded-full bg-gradient-to-r from-accent/15 to-violet/15 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mb-4">
        <MiniHint variant="upload" />
      </div>
      <p className="relative text-base font-semibold tracking-tight text-ink dark:text-white mb-1">
        {isDragOver ? 'Release to add it' : 'Drop a screenshot here'}
      </p>
      <p className="relative flex items-center justify-center gap-1.5 text-xs text-ink-faint dark:text-ink-faint-dark mb-6">
        or paste it with
        <kbd className="px-1.5 py-0.5 rounded-md border border-line dark:border-line-dark bg-panel dark:bg-panel-dark font-mono text-[10px] text-ink-soft dark:text-ink-soft-dark shadow-sm">
          Ctrl/⌘ V
        </kbd>
      </p>

      <div className="relative flex flex-wrap items-center justify-center gap-2.5">
        <Tooltip
          label={
            onFiles
              ? 'Pick one or more images. Each extra one becomes its own step.'
              : 'Pick an image from your computer'
          }
        >
          <button
            onClick={pickFile}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-semibold shadow-glow hover:bg-accent-dark hover:-translate-y-px transition-all"
          >
            <Upload className="w-4 h-4" /> Upload screenshot
          </button>
        </Tooltip>
        {onRecord && (
          <Tooltip label="Record your screen and add steps from the video">
            <button onClick={record} className={SECONDARY_BUTTON}>
              <span className="relative flex w-2.5 h-2.5" aria-hidden="true">
                <span className="absolute inset-0 rounded-full bg-danger/60 animate-ping" />
                <span className="relative w-2.5 h-2.5 rounded-full bg-danger" />
              </span>
              Record your screen instead
              <ProBadge left={triesLeft('screenRecording')} />
            </button>
          </Tooltip>
        )}
        {onOpenGallery && galleryCount > 0 && (
          <Tooltip label="Reuse a screenshot you already added to this course">
            <button onClick={onOpenGallery} className={SECONDARY_BUTTON}>
              <Images className="w-4 h-4 text-accent" /> Reuse ({galleryCount})
            </button>
          </Tooltip>
        )}
        {reuseFromStepNumber != null && (
          <Tooltip label={`Use the same screenshot as screen ${reuseFromStepNumber}`}>
            <button onClick={onReuse} className={SECONDARY_BUTTON}>
              <Copy className="w-4 h-4 text-ink-faint dark:text-ink-faint-dark" /> Same as screen{' '}
              {reuseFromStepNumber}
            </button>
          </Tooltip>
        )}
      </div>

      {(onFiles || onShowTutorial) && (
        <div className="relative mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-ink-faint dark:text-ink-faint-dark">
          {onFiles && (
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Drop several at once — one step each
              <ProBadge left={triesLeft('bulkUpload')} />
            </span>
          )}
          {onShowTutorial && (
            <button
              onClick={onShowTutorial}
              className="flex items-center gap-1.5 font-medium text-accent dark:text-accent-ink-dark hover:underline"
            >
              <PlayCircle className="w-3.5 h-3.5" /> Watch how it works
            </button>
          )}
        </div>
      )}
    </div>
  );
}
