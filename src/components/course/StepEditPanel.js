/**
 * @file Edits ONE moment (frame) of the walkthrough, inside the preview studio
 * (components/course/PreviewStudio.js). Opens when the viewer pauses in Edit
 * mode or clicks the timeline.
 *
 * KEPT DELIBERATELY SMALL — three things, in this order:
 *   1. What's said   the text the AI voice reads. (Voice recording / upload is
 *                    switched off for now — see the commented-out code below.)
 *   2. Highlighted area  the screenshot with the selected box; "Change area"
 *                    redraws it. The screenshot itself can be replaced.
 *   3. Add step before / after, Delete step (small links at the bottom).
 *
 * Everything edits a DRAFT — nothing is saved until the studio's "Save".
 * Media created here (screenshots, recordings) is written to IndexedDB right
 * away but reported via onMediaCreated, so Cancel can delete it again.
 */

import { useState } from 'react';
import { X, Upload, Plus, Trash2 } from 'lucide-react';
import { putMedia } from '@/services/storage/db';
import { nextId } from '@/utils';
import { getStepAction } from '@/utils/course';
import { FeatureSelector } from '@/components/course/FeatureSelector';
import { RegionActionBar } from '@/components/course/RegionActionBar';
import { StepScreenshotUpload } from '@/components/course/StepScreenshotUpload';
// Voice recording / upload is switched off for now.
// import { AudioRecorderPanel } from '@/components/course/AudioRecorderPanel';
import { DescriptionField } from '@/components/course/DescriptionField';
import { toast } from 'react-toastify';
import { Tooltip } from '@/components/ui/Tooltip';

/** @typedef {import('@/types').Step} Step */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SECTION_TITLE =
  'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark mb-2';

/**
 * @param {{
 *   step: Step,
 *   index: number,
 *   total: number,                    // number of frames
 *   timeLabel?: string,               // e.g. "0:12" — where this frame starts
 *   imageUrl: string | null,          // data URL of this frame's screenshot
 *   imageId: string | null,           // resolved (incl. legacy base image)
 *   reuseFrom: { number: number, imageId: string } | null,
 *   pageName?: string,
 *   canAdd: boolean,
 *   canDelete: boolean,
 *   onChange: (patch: Partial<Step>) => void,
 *   onMediaCreated: (mediaId: string) => void,
 *   onAddBefore: () => void,
 *   onAddAfter: () => void,
 *   onDelete: () => void,
 *   onClose: () => void,
 * }} props
 */
export function StepEditPanel({
  step,
  index,
  total,
  timeLabel,
  imageUrl,
  imageId,
  reuseFrom,
  pageName,
  canAdd,
  canDelete,
  onChange,
  onMediaCreated,
  onAddBefore,
  onAddAfter,
  onDelete,
  onClose,
}) {
  const [drawMode, setDrawMode] = useState(false);

  const handleImageFile = async (file) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPG, ...)');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Image must be under 10MB');
      return;
    }
    const mediaId = nextId('media');
    await putMedia(mediaId, file);
    onMediaCreated(mediaId);
    onChange({ imageId: mediaId, region: null });
    setDrawMode(true); // a new screenshot needs a new area
  };

  const pickImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => input.files?.[0] && handleImageFile(input.files[0]);
    input.click();
  };

  // Voice recording / upload — switched off for now.
  // const voice = (
  //   <AudioRecorderPanel
  //     key={step.id}
  //     step={step}
  //     manageMedia={false}
  //     compact
  //     onSave={(audioId) => {
  //       onMediaCreated(audioId);
  //       onChange({ audioId });
  //     }}
  //     onDelete={() => onChange({ audioId: null })}
  //     onTranscribed={(text) => onChange({ text, audioId: null })}
  //   />
  // );
  const text = (
    <DescriptionField
      value={step.text}
      onChange={(value) => onChange({ text: value })}
      label={step.label}
      pageName={pageName}
      action={getStepAction(step)}
      rows={3}
    />
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header: which moment this is */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line dark:border-line-dark flex-shrink-0">
        <span className="w-8 h-8 rounded-full bg-accent text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={step.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Title (optional)"
            className="w-full bg-transparent outline-none text-sm font-semibold text-ink dark:text-white border-b border-transparent focus:border-accent"
            aria-label="Step heading"
          />
          <p className="text-[11px] text-ink-faint dark:text-ink-faint-dark">
            Step {index + 1} of {total}
            {timeLabel ? ` · ${timeLabel}` : ''}
          </p>
        </div>
        <Tooltip label="Close">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-paper-2 dark:hover:bg-paper-2-dark"
            aria-label="Close edit panel"
          >
            <X className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* 1. What's said (voice recording / upload switched off for now) */}
        <section>
          <p className={SECTION_TITLE}>What to say</p>
          {text}
        </section>

        {/* 2. Highlighted area */}
        <section>
          <div className="flex items-center justify-between">
            <p className={SECTION_TITLE}>Highlight</p>
            {imageId && (
              <Tooltip label="Replace this screenshot">
                <button
                  onClick={pickImage}
                  className="flex items-center gap-1 mb-2 text-xs font-medium text-ink-soft dark:text-ink-faint-dark hover:text-accent"
                >
                  <Upload className="w-3.5 h-3.5" /> Replace
                </button>
              </Tooltip>
            )}
          </div>
          {!imageId ? (
            <StepScreenshotUpload
              stepNumber={index + 1}
              onFile={handleImageFile}
              reuseFromStepNumber={reuseFrom?.number ?? null}
              onReuse={() => {
                if (!reuseFrom) return;
                onChange({ imageId: reuseFrom.imageId, region: null });
                setDrawMode(true);
              }}
            />
          ) : (
            <div className="space-y-3">
              <FeatureSelector
                imageUrl={imageUrl}
                region={step.region}
                drawMode={drawMode}
                onRegionChange={(region) => {
                  onChange({ region });
                  if (drawMode && region) setDrawMode(false);
                }}
              />
              <RegionActionBar
                hasRegion={!!step.region}
                drawMode={drawMode}
                action={getStepAction(step)}
                onStartSelect={() => setDrawMode(true)}
                onCancelSelect={() => setDrawMode(false)}
                onActionChange={(action) => onChange({ action })}
                typeValue={step.typeValue || ''}
                onTypeValueChange={(typeValue) => onChange({ typeValue })}
                compact
              />
            </div>
          )}
        </section>

        {/* 3. Structure */}
        <section className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-line dark:border-line-dark">
          {canAdd && (
            <>
              <Tooltip label="Add a new step before this one">
                <button
                  onClick={onAddBefore}
                  className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
                >
                  <Plus className="w-4 h-4" /> Before
                </button>
              </Tooltip>
              <Tooltip label="Add a new step after this one">
                <button
                  onClick={onAddAfter}
                  className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
                >
                  <Plus className="w-4 h-4" /> After
                </button>
              </Tooltip>
            </>
          )}
          {canDelete && (
            <Tooltip label="Delete this step">
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 text-sm font-medium text-danger hover:underline"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </Tooltip>
          )}
        </section>
      </div>
    </div>
  );
}
