/**
 * @file ⚠️ UNUSED / LEGACY — not imported anywhere.
 *
 * Left over from an earlier design where a step could have MULTIPLE regions
 * (`step.regions[]`). The current data model has one `step.region`, and the
 * editor uses components/course/FeatureSelector.js instead.
 * Safe to delete; kept only because removal wasn't approved yet.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { clampPct } from '@/utils';

export function RegionCanvas({
  step,
  imageUrl,
  activeRegionId,
  onAddRegion,
  onUpdateRegion,
  onSelectRegion,
  drawMode,
}) {
  const containerRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawCurrent, setDrawCurrent] = useState(null);
  const [dragInfo, setDragInfo] = useState(null);

  const getRelativePos = useCallback((clientX, clientY) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: clampPct(((clientX - rect.left) / rect.width) * 100),
      y: clampPct(((clientY - rect.top) / rect.height) * 100),
    };
  }, []);

  const handleMouseDown = useCallback(
    (e) => {
      if (!drawMode) return;
      e.preventDefault();
      const pos = getRelativePos(e.clientX, e.clientY);
      setDrawing(true);
      setDrawStart(pos);
      setDrawCurrent({ x: pos.x, y: pos.y, w: 0, h: 0 });
    },
    [drawMode, getRelativePos],
  );

  useEffect(() => {
    if (!drawing && !dragInfo) return;
    const handleMove = (e) => {
      const pos = getRelativePos(e.clientX, e.clientY);
      if (drawing && drawStart) {
        const x = Math.min(drawStart.x, pos.x);
        const y = Math.min(drawStart.y, pos.y);
        const w = Math.abs(pos.x - drawStart.x);
        const h = Math.abs(pos.y - drawStart.y);
        setDrawCurrent({ x, y, w, h });
      } else if (dragInfo) {
        const dx = pos.x - dragInfo.startX;
        const dy = pos.y - dragInfo.startY;
        if (dragInfo.mode === 'move') {
          const nx = clampPct(dragInfo.origRegion.x + dx);
          const ny = clampPct(dragInfo.origRegion.y + dy);
          onUpdateRegion(dragInfo.regionId, { x: nx, y: ny });
        } else if (dragInfo.mode === 'resize') {
          const orig = dragInfo.origRegion;
          const h2 = dragInfo.handle || 'se';
          let nx = orig.x,
            ny = orig.y,
            nw = orig.w,
            nh = orig.h;
          if (h2.includes('e')) nw = Math.max(3, orig.w + dx);
          if (h2.includes('s')) nh = Math.max(3, orig.h + dy);
          if (h2.includes('w')) {
            nx = clampPct(orig.x + dx);
            nw = Math.max(3, orig.w - dx);
          }
          if (h2.includes('n')) {
            ny = clampPct(orig.y + dy);
            nh = Math.max(3, orig.h - dy);
          }
          onUpdateRegion(dragInfo.regionId, { x: nx, y: ny, w: nw, h: nh });
        }
      }
    };
    const handleUp = () => {
      if (drawing && drawCurrent && drawCurrent.w > 3 && drawCurrent.h > 3) {
        onAddRegion({ x: drawCurrent.x, y: drawCurrent.y, w: drawCurrent.w, h: drawCurrent.h });
      }
      setDrawing(false);
      setDrawStart(null);
      setDrawCurrent(null);
      setDragInfo(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [drawing, drawStart, drawCurrent, dragInfo, getRelativePos, onAddRegion, onUpdateRegion]);

  const startDrag = (e, region, mode, handle) => {
    if (drawMode) return;
    e.stopPropagation();
    e.preventDefault();
    const pos = getRelativePos(e.clientX, e.clientY);
    setDragInfo({
      regionId: region.id,
      mode,
      handle,
      startX: pos.x,
      startY: pos.y,
      origRegion: { x: region.x, y: region.y, w: region.w, h: region.h },
    });
    onSelectRegion(region.id);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl border border-line dark:border-line-dark bg-paper-2 dark:bg-paper-2-dark ${
        drawMode ? 'cursor-crosshair' : 'cursor-default'
      }`}
      onMouseDown={handleMouseDown}
      style={{ aspectRatio: '16 / 10' }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt="Step screenshot"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-ink-faint dark:text-ink-faint-dark">
          <p className="text-sm">No image uploaded</p>
        </div>
      )}
      {step.regions.map((region, i) => {
        const isActive = region.id === activeRegionId;
        return (
          <div
            key={region.id}
            className={`absolute border-2 rounded-md transition-colors ${
              isActive
                ? 'border-accent bg-accent/10'
                : 'border-teal bg-teal/5 hover:border-teal-dark'
            }`}
            style={{
              left: `${region.x}%`,
              top: `${region.y}%`,
              width: `${region.w}%`,
              height: `${region.h}%`,
            }}
            onMouseDown={(e) => startDrag(e, region, 'move')}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRegion(region.id);
            }}
          >
            <span className="absolute -top-6 left-0 text-xs font-bold text-white bg-accent px-1.5 py-0.5 rounded">
              {i + 1}
            </span>
            {isActive && !drawMode && (
              <>
                {['nw', 'ne', 'sw', 'se'].map((h) => (
                  <div
                    key={h}
                    className="absolute w-3 h-3 bg-white border-2 border-accent rounded-sm"
                    style={{
                      top: h.includes('n') ? '-6px' : undefined,
                      bottom: h.includes('s') ? '-6px' : undefined,
                      left: h.includes('w') ? '-6px' : undefined,
                      right: h.includes('e') ? '-6px' : undefined,
                      cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize',
                    }}
                    onMouseDown={(e) => startDrag(e, region, 'resize', h)}
                  />
                ))}
              </>
            )}
          </div>
        );
      })}
      {drawing && drawCurrent && (
        <div
          className="absolute border-2 border-dashed border-accent bg-accent/10 rounded-md pointer-events-none"
          style={{
            left: `${drawCurrent.x}%`,
            top: `${drawCurrent.y}%`,
            width: `${drawCurrent.w}%`,
            height: `${drawCurrent.h}%`,
          }}
        />
      )}
      {!drawMode && step.regions.length === 0 && imageUrl && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-ink-faint dark:text-ink-faint-dark bg-panel/80 dark:bg-panel-dark/80 px-3 py-1 rounded-full">
          Switch to Draw mode to highlight areas
        </div>
      )}
    </div>
  );
}
