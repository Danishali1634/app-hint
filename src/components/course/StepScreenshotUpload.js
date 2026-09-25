/**
 * @file Upload area shown when the active step has no screenshot yet.
 *
 * Three ways to add a screenshot:
 *   1. Click "Upload screenshot"   → file picker
 *   2. Drag & drop an image file onto the area
 *   3. Paste (Ctrl/Cmd + V) an image — handy right after taking a screenshot
 * Plus "Use Step N's screenshot" to reuse the previous step's image (e.g. two
 * buttons on the same page), without storing a second copy.
 *
 * This component only hands a File back to the parent (onFile); validation and
 * storage happen in CourseEditorPage.
 */

import { useEffect, useState } from 'react';
import { Upload, Copy } from 'lucide-react';
import { MiniHint } from '@/components/tutorial/MiniHint';

/**
 * @param {{
 *   stepNumber: number,
 *   onFile: (file: File) => void,
 *   reuseFromStepNumber: number | null,   // nearest earlier step with a screenshot
 *   onReuse: () => void,
 * }} props
 */
export function StepScreenshotUpload({ stepNumber, onFile, reuseFromStepNumber, onReuse }) {
  const [isDragOver, setIsDragOver] = useState(false);

  // Paste support: active only while this upload area is on screen.
  useEffect(() => {
    const handlePaste = (e) => {
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        onFile(file);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onFile]);

  const pickFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => input.files?.[0] && onFile(input.files[0]);
    input.click();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
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
        Add the screenshot for step {stepNumber}
      </p>
      <p className="text-xs text-ink-faint dark:text-ink-faint-dark mb-5 max-w-sm">
        Take a full screenshot of the page or modal the user sees at this step. Drop it here, paste
        it (Ctrl/Cmd + V) or upload it.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={pickFile}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white font-semibold hover:bg-accent-dark transition-colors"
        >
          <Upload className="w-4 h-4" /> Upload screenshot
        </button>
        {reuseFromStepNumber != null && (
          <button
            onClick={onReuse}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-line dark:border-line-dark text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
          >
            <Copy className="w-4 h-4" /> Use step {reuseFromStepNumber}&apos;s screenshot
          </button>
        )}
      </div>
    </div>
  );
}
