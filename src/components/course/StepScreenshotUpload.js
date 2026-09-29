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
 * This component only hands Files back to the parent (onFile / onFiles);
 * validation and storage happen in CourseEditorPage.
 */

import { useEffect, useState } from 'react';
import { Upload, Copy, Images, PlayCircle } from 'lucide-react';
import { MiniHint } from '@/components/tutorial/MiniHint';
import { Tooltip } from '@/components/ui/Tooltip';

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
  const deliver = (files) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) {
      if (files[0]) (onFiles ? onFiles : (list) => onFile?.(list[0]))(files.slice(0, 1));
      return;
    }
    if (onFiles) onFiles(images);
    else onFile?.(images[0]);
  };

  // Paste support: active only while this upload area is on screen.
  useEffect(() => {
    const handlePaste = (e) => {
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        if (onFiles) onFiles(files);
        else onFile?.(files[0]);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onFile, onFiles]);

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

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center py-14 px-6 text-center border-2 border-dashed rounded-xl transition-colors ${
        isDragOver
          ? 'border-accent bg-accent-soft/40 dark:bg-accent-soft-dark/20'
          : 'border-line dark:border-line-dark'
      }`}
    >
      <div className="mb-4">
        <MiniHint variant="upload" />
      </div>
      <p className="text-sm font-medium text-ink dark:text-ink-soft-dark mb-1">
        Drop a screenshot here
      </p>
      <p className="text-xs text-ink-faint dark:text-ink-faint-dark mb-5 max-w-sm">
        or paste it with Ctrl/⌘ + V
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Tooltip
          label={
            onFiles
              ? 'Pick one or more images. Each extra one becomes its own step.'
              : 'Pick an image from your computer'
          }
        >
          <button
            onClick={pickFile}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white font-semibold hover:bg-accent-dark transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload screenshot
          </button>
        </Tooltip>
        {onShowTutorial && (
          <Tooltip label="A short video that shows every click">
            <button
              onClick={onShowTutorial}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent/10 text-accent dark:text-accent-ink-dark ring-1 ring-accent/30 text-sm font-semibold hover:bg-accent/15 transition-colors"
            >
              <PlayCircle className="w-4 h-4" /> View tutorial: creating with screenshots
            </button>
          </Tooltip>
        )}
        {onRecord && (
          <Tooltip label="Record your screen and add steps from the video">
            <button
              onClick={onRecord}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-line dark:border-line-dark text-sm font-semibold text-ink dark:text-ink-soft-dark hover:border-ink-faint dark:hover:border-ink-faint-dark transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-danger" aria-hidden="true" /> Record your
              screen instead
            </button>
          </Tooltip>
        )}
        {onOpenGallery && galleryCount > 0 && (
          <Tooltip label="Reuse a screenshot you already added to this course">
            <button
              onClick={onOpenGallery}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-accent/50 text-sm font-semibold text-accent hover:bg-accent/10 transition-colors"
            >
              <Images className="w-4 h-4" /> Reuse ({galleryCount})
            </button>
          </Tooltip>
        )}
        {reuseFromStepNumber != null && (
          <Tooltip label={`Use the same screenshot as screen ${reuseFromStepNumber}`}>
            <button
              onClick={onReuse}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-line dark:border-line-dark text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
            >
              <Copy className="w-4 h-4" /> Same as screen {reuseFromStepNumber}
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
