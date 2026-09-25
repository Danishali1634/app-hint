/**
 * @file The editor canvas: shows the active step's screenshot and lets the
 * author draw, move, resize or clear ONE feature region on it.
 *
 * MODES (controlled by the parent)
 *   Draw mode   (drawMode = true)   drag over the feature to select it.
 *                                   The parent leaves draw mode after a box is drawn.
 *   Adjust mode (drawMode = false)  drag the box to move it, drag a corner
 *                                   handle to resize, × to clear.
 *
 * COORDINATES: stored as PERCENT of the image (see Region in src/types).
 * The canvas always has the screenshot's OWN aspect ratio (measured on load),
 * so a percentage here points at exactly the same pixels in the player's zoom.
 *
 * WHY POINTER EVENTS + WINDOW LISTENERS
 *   Pointer events cover mouse, touch and pen with one code path
 *   (`touch-action: none` stops the page scrolling while drawing on touch).
 *   Move/up listeners go on `window` only while a drag is active, so releasing
 *   outside the canvas still ends the drag; the effect cleanup removes them.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { Crosshair } from 'lucide-react';
import { clampPct } from '@/utils';

/** @typedef {import('@/types').Region} Region */

/** Smallest allowed region size (percent), so boxes can't collapse to nothing. */
const MIN_REGION_PCT = 3;
const RESIZE_HANDLES = ['nw', 'ne', 'sw', 'se'];
/** Used until the screenshot has loaded and reported its real size. */
const DEFAULT_RATIO = 16 / 10;
/**
 * Max canvas height = viewport minus the editor chrome around it (top bar,
 * title row, step checklist, step label, the "Select area" hint and the sticky Mark done
 * bar), so the "Select area of the feature" button is always visible without
 * scrolling. Never smaller than MIN_CANVAS_HEIGHT_PX.
 */
const EDITOR_CHROME_PX = 540;
const MIN_CANVAS_HEIGHT_PX = 260;

/** Region (percent) → absolute-position CSS. */
function regionStyle(r) {
  return { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` };
}

/** CSS that pins a handle to its corner, e.g. 'nw' → top-left. */
function handleStyle(handle) {
  return {
    top: handle.includes('n') ? '-7px' : undefined,
    bottom: handle.includes('s') ? '-7px' : undefined,
    left: handle.includes('w') ? '-7px' : undefined,
    right: handle.includes('e') ? '-7px' : undefined,
    cursor: handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize',
  };
}

/**
 * @param {{
 *   imageUrl: string | null,
 *   region: Region | null,
 *   onRegionChange: (region: Region | null) => void,
 *   drawMode: boolean,
 *   number?: number,     // step number shown on the box (several areas on one screenshot)
 *   otherAreas?: { id: string, number: number, region: Region }[],  // other steps on this screenshot
 *   onSelectArea?: (id: string) => void,                            // click one to edit it
 * }} props
 */
export function FeatureSelector({
  imageUrl,
  region,
  onRegionChange,
  drawMode,
  number,
  otherAreas = [],
  onSelectArea,
}) {
  const containerRef = useRef(null);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);

  // Draw-mode state: where the drag started and the live preview rectangle.
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawCurrent, setDrawCurrent] = useState(null);

  // Adjust-mode state: { mode: 'move' | 'resize', handle?, startX, startY, orig }
  // `orig` is the region at drag start; all deltas are applied to it.
  const [dragInfo, setDragInfo] = useState(null);

  // Reset to the default ratio while a new screenshot loads.
  useEffect(() => {
    setRatio(DEFAULT_RATIO);
  }, [imageUrl]);

  /** Pointer position → percent of the canvas, clamped to 0–100. */
  const getRelativePos = useCallback((clientX, clientY) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: clampPct(((clientX - rect.left) / rect.width) * 100),
      y: clampPct(((clientY - rect.top) / rect.height) * 100),
    };
  }, []);

  // Draw mode: pressing on the canvas starts a new rectangle.
  const handlePointerDown = useCallback(
    (e) => {
      if (!drawMode || !imageUrl) return;
      e.preventDefault();
      const pos = getRelativePos(e.clientX, e.clientY);
      setDrawing(true);
      setDrawStart(pos);
      setDrawCurrent({ x: pos.x, y: pos.y, w: 0, h: 0 });
    },
    [drawMode, imageUrl, getRelativePos],
  );

  // While drawing or dragging: track the pointer on window, finish on release.
  useEffect(() => {
    if (!drawing && !dragInfo) return;

    const handleMove = (e) => {
      const pos = getRelativePos(e.clientX, e.clientY);

      if (drawing && drawStart) {
        // Normalise so dragging up/left also works.
        setDrawCurrent({
          x: Math.min(drawStart.x, pos.x),
          y: Math.min(drawStart.y, pos.y),
          w: Math.abs(pos.x - drawStart.x),
          h: Math.abs(pos.y - drawStart.y),
        });
        return;
      }

      if (!dragInfo || !region) return;
      const { orig } = dragInfo;
      const dx = pos.x - dragInfo.startX;
      const dy = pos.y - dragInfo.startY;

      if (dragInfo.mode === 'move') {
        // Keep the whole box inside the image.
        onRegionChange({
          ...region,
          x: Math.min(clampPct(orig.x + dx), 100 - orig.w),
          y: Math.min(clampPct(orig.y + dy), 100 - orig.h),
        });
        return;
      }

      // Resize: each handle letter says which edges move (n/s/e/w).
      const handle = dragInfo.handle || 'se';
      let { x, y, w, h } = region;
      if (handle.includes('e')) w = Math.max(MIN_REGION_PCT, Math.min(orig.w + dx, 100 - orig.x));
      if (handle.includes('s')) h = Math.max(MIN_REGION_PCT, Math.min(orig.h + dy, 100 - orig.y));
      if (handle.includes('w')) {
        x = clampPct(orig.x + dx);
        w = Math.max(MIN_REGION_PCT, orig.w - dx);
      }
      if (handle.includes('n')) {
        y = clampPct(orig.y + dy);
        h = Math.max(MIN_REGION_PCT, orig.h - dy);
      }
      onRegionChange({ x, y, w, h });
    };

    const handleUp = () => {
      // Ignore accidental taps / tiny drags.
      const isBigEnough =
        drawCurrent && drawCurrent.w > MIN_REGION_PCT && drawCurrent.h > MIN_REGION_PCT;
      if (drawing && isBigEnough) {
        onRegionChange({ x: drawCurrent.x, y: drawCurrent.y, w: drawCurrent.w, h: drawCurrent.h });
      }
      setDrawing(false);
      setDrawStart(null);
      setDrawCurrent(null);
      setDragInfo(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [drawing, drawStart, drawCurrent, dragInfo, region, getRelativePos, onRegionChange]);

  /** Adjust mode: begin moving the box or resizing from a corner. */
  const startDrag = (e, mode, handle) => {
    if (drawMode || !region) return;
    e.stopPropagation(); // don't let the canvas treat this as a draw
    e.preventDefault();
    const pos = getRelativePos(e.clientX, e.clientY);
    setDragInfo({ mode, handle, startX: pos.x, startY: pos.y, orig: { ...region } });
  };

  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) setRatio(naturalWidth / naturalHeight);
  };

  return (
    <div
      ref={containerRef}
      className={`relative mx-auto overflow-hidden rounded-xl border border-line dark:border-line-dark bg-paper-2 dark:bg-paper-2-dark select-none ${
        drawMode && imageUrl ? 'cursor-crosshair' : 'cursor-default'
      }`}
      onPointerDown={handlePointerDown}
      style={{
        aspectRatio: `${ratio}`,
        // Fill the width, but never taller than the space left on screen — the
        // width shrinks instead, so the box keeps the image's exact ratio.
        width: `min(100%, calc(max(100vh - ${EDITOR_CHROME_PX}px, ${MIN_CANVAS_HEIGHT_PX}px) * ${ratio}))`,
        touchAction: 'none',
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt="Step screenshot"
          onLoad={handleImageLoad}
          className="absolute inset-0 w-full h-full pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-ink-faint dark:text-ink-faint-dark">
          <p className="text-sm">No screenshot</p>
        </div>
      )}

      {/* Other areas on the same screenshot (other steps): numbered, click to edit */}
      {!drawing &&
        otherAreas.map((area) => (
          <button
            key={area.id}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!drawMode) onSelectArea?.(area.id);
            }}
            className="absolute border-2 border-dashed border-white/80 rounded-md bg-black/10 hover:bg-accent/15 hover:border-accent transition-colors"
            style={regionStyle(area.region)}
            aria-label={`Edit area ${area.number}`}
            title={`Step ${area.number} — click to edit`}
          >
            <span className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-ink/80 text-white text-[10px] font-bold flex items-center justify-center shadow">
              {area.number}
            </span>
          </button>
        ))}

      {/* Draw mode: dim the image a little and show what to do */}
      {drawMode && imageUrl && !drawing && (
        <div className="absolute inset-0 bg-black/25 pointer-events-none flex items-start justify-center pt-4">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-white bg-accent px-3 py-1.5 rounded-full shadow-lg">
            <Crosshair className="w-3.5 h-3.5" /> Drag over the feature
          </span>
        </div>
      )}

      {/* Saved region with move/resize/clear controls (adjust mode only) */}
      {region && !drawMode && (
        <div
          className="absolute border-2 border-accent rounded-md bg-accent/10 cursor-move"
          style={regionStyle(region)}
          onPointerDown={(e) => startDrag(e, 'move')}
        >
          {number != null && (
            <span className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center shadow pointer-events-none">
              {number}
            </span>
          )}
          {RESIZE_HANDLES.map((handle) => (
            <div
              key={handle}
              className="absolute w-3.5 h-3.5 bg-white border-2 border-accent rounded-sm"
              style={handleStyle(handle)}
              onPointerDown={(e) => startDrag(e, 'resize', handle)}
            />
          ))}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRegionChange(null);
            }}
            className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-danger text-white text-xs flex items-center justify-center shadow-md"
            aria-label="Clear region"
          >
            ×
          </button>
        </div>
      )}

      {/* Live preview while drawing */}
      {drawing && drawCurrent && (
        <div
          className="absolute border-2 border-dashed border-accent bg-accent/15 rounded-md pointer-events-none"
          style={regionStyle(drawCurrent)}
        />
      )}
    </div>
  );
}
