/**
 * @file The screenshot workspace of a Global Step: the targets of all its
 * sub-steps, direct editing of the SELECTED sub-step's targets, and zoom.
 *
 * NO MODES TO SWITCH — what you do on the screenshot says what happens:
 *   drag ANYWHERE              → adds a target to the selected sub-step, also
 *                                inside an existing box (e.g. over a full-page
 *                                box of another step): boxes never block drawing
 *                                (releasing the mouse never ends anything:
 *                                just drag again for another target)
 *   drag a target's edge / badge → moves it     corner handle → resizes it
 *   ×  on a target             → removes it
 *   click another sub-step's number badge → switches to that sub-step
 *   "Reselect" (from the panel) → the next box you drag REPLACES that target
 *
 * ZOOM: the screenshot fills the workspace ("Fit"); − / + (or Ctrl/⌘ + scroll,
 * zooming around the pointer) enlarge it inside a scrolling viewport, and
 * "Full screen" gives it the whole window (Esc closes). Targets are stored in
 * percent of the image, so they stay exact at any zoom.
 *
 * SYNC WITH THE PANEL: `highlightId` (a sub-step hovered in the side panel or
 * the step list) outlines that sub-step's targets; hovering a box reports its
 * sub-step through onHoverSubStep so the panel can highlight the card.
 *
 * Selected sub-step: solid accent boxes numbered "2" (one target) or "2·1",
 * "2·2" (several). Other sub-steps: dashed grey boxes with their number.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Crosshair, RotateCcw, ZoomIn, ZoomOut, Maximize2, Minimize2, Scan } from 'lucide-react';
import { clampPct } from '@/utils';
import { useElementSize } from '@/hooks/useElementSize';
import { Tooltip } from '@/components/ui/Tooltip';

/** @typedef {import('@/types').Region} Region */

const MIN_REGION_PCT = 3;
/** Thin strips along a box's edges that move it (the inside stays free for drawing). */
const EDGE_GRIPS = ['n', 's', 'e', 'w'];
const EDGE_GRIP_CLASS = {
  n: '-top-1.5 left-2 right-2 h-3',
  s: '-bottom-1.5 left-2 right-2 h-3',
  e: '-right-1.5 top-2 bottom-2 w-3',
  w: '-left-1.5 top-2 bottom-2 w-3',
};
const RESIZE_HANDLES = ['nw', 'ne', 'sw', 'se'];
const DEFAULT_RATIO = 16 / 10;
/** Zoom levels of the − / + buttons (1 = fit the workspace). */
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
const MIN_ZOOM = ZOOM_LEVELS[0];
const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
/** Space around the screenshot inside the viewport (room for the corner badges), px. */
const VIEWPORT_PAD = 14;

const regionStyle = (r) => ({
  left: `${r.x}%`,
  top: `${r.y}%`,
  width: `${r.w}%`,
  height: `${r.h}%`,
});

function handleStyle(handle) {
  return {
    top: handle.includes('n') ? '-7px' : undefined,
    bottom: handle.includes('s') ? '-7px' : undefined,
    left: handle.includes('w') ? '-7px' : undefined,
    right: handle.includes('e') ? '-7px' : undefined,
    cursor: handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize',
  };
}

const TOOL_BUTTON_CLASS =
  'w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark hover:text-accent disabled:opacity-40 disabled:hover:bg-transparent transition-colors';

/**
 * @param {{
 *   imageUrl: string | null,
 *   subSteps: { id: string, number: number, targets: Region[] }[],
 *   activeId: string,
 *   replacingIndex: number | null,        // this target of the selected sub-step is being redrawn
 *   onAddTarget: (region: Region) => void, // new box (or the replacement while reselecting)
 *   onChangeTarget: (index: number, region: Region | null) => void,  // move / resize / remove
 *   onSelectSubStep: (id: string) => void,
 *   hint?: string,                         // what dragging does right now (none → floating zoom tools)
 *   focusKey?: string,                     // changes → the selected targets pulse once
 *   highlightId?: string | null,           // sub-step hovered elsewhere → outline its targets
 *   onHoverSubStep?: (id: string | null) => void,
 *   caption?: { text: string, action: 'click' | 'look' | 'type' },  // the selected step's words
 *   onCaptionClick?: () => void,                   // e.g. focus the description field
 * }} props
 */
export function TargetCanvas({
  imageUrl,
  subSteps,
  activeId,
  replacingIndex,
  onAddTarget,
  onChangeTarget,
  onSelectSubStep,
  hint,
  focusKey,
  highlightId = null,
  onHoverSubStep,
  caption,
  onCaptionClick,
}) {
  const containerRef = useRef(null); // the screenshot itself (coordinates)
  const viewportRef = useRef(null); // the scrolling area around it
  const [sizeRef, viewportSize, viewportNode] = useElementSize();
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [draw, setDraw] = useState(null); // { start, current } while dragging a new box
  const [drag, setDrag] = useState(null); // { index, mode, handle, startX, startY, orig }
  const zoomAnchorRef = useRef(null); // keep this image point under the pointer after zooming

  const active = subSteps.find((s) => s.id === activeId);
  const activeTargets = active?.targets || [];

  useEffect(() => {
    setRatio(DEFAULT_RATIO);
    setZoom(1);
  }, [imageUrl]);

  // ── Size: "fit" = the largest box with the image's ratio inside the viewport ──
  const availW = Math.max(120, viewportSize.width - VIEWPORT_PAD * 2);
  const availH = Math.max(120, viewportSize.height - VIEWPORT_PAD * 2);
  const fitWidth = Math.min(availW, availH * ratio);
  const canvasWidth = fitWidth * zoom;
  const canvasHeight = canvasWidth / ratio;

  /** Zoom to `next`, keeping the image point under (clientX, clientY) in place. */
  const zoomTo = useCallback((next, clientX, clientY) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const canvas = containerRef.current;
    const viewport = viewportRef.current;
    if (canvas && viewport) {
      const box = canvas.getBoundingClientRect();
      const view = viewport.getBoundingClientRect();
      const x = clientX ?? view.left + view.width / 2;
      const y = clientY ?? view.top + view.height / 2;
      zoomAnchorRef.current = {
        fx: (x - box.left) / box.width,
        fy: (y - box.top) / box.height,
        x,
        y,
      };
    }
    setZoom(clamped);
  }, []);

  // After a zoom, scroll so the anchored point is back under the pointer.
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const canvas = containerRef.current;
    const viewport = viewportRef.current;
    zoomAnchorRef.current = null;
    if (!anchor || !canvas || !viewport) return;
    const box = canvas.getBoundingClientRect();
    viewport.scrollLeft += box.left + anchor.fx * box.width - anchor.x;
    viewport.scrollTop += box.top + anchor.fy * box.height - anchor.y;
  }, [zoom]);

  const stepZoom = (direction) => {
    const next =
      direction > 0
        ? ZOOM_LEVELS.find((z) => z > zoom + 0.001)
        : [...ZOOM_LEVELS].reverse().find((z) => z < zoom - 0.001);
    if (next) zoomTo(next);
  };

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms around the pointer. Needs a
  // non-passive listener to stop the browser's own page zoom.
  useEffect(() => {
    if (!viewportNode) return;
    const handleWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((current) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * Math.exp(-e.deltaY * 0.0025)));
        const canvas = containerRef.current;
        if (canvas) {
          const box = canvas.getBoundingClientRect();
          zoomAnchorRef.current = {
            fx: (e.clientX - box.left) / box.width,
            fy: (e.clientY - box.top) / box.height,
            x: e.clientX,
            y: e.clientY,
          };
        }
        return next;
      });
    };
    viewportNode.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewportNode.removeEventListener('wheel', handleWheel);
  }, [viewportNode]);

  // Full screen: Esc closes; the page behind doesn't scroll.
  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setExpanded(false);
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey, true);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', handleKey, true);
    };
  }, [expanded]);

  // ── Drawing / moving / resizing ──
  const getPos = useCallback((clientX, clientY) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clampPct(((clientX - rect.left) / rect.width) * 100),
      y: clampPct(((clientY - rect.top) / rect.height) * 100),
    };
  }, []);

  // Pressing anywhere that isn't a handle / edge / badge starts a new box.
  const handlePointerDown = (e) => {
    if (!imageUrl || e.button > 0) return;
    e.preventDefault();
    const pos = getPos(e.clientX, e.clientY);
    setDraw({ start: pos, current: { x: pos.x, y: pos.y, w: 0, h: 0 } });
  };

  useEffect(() => {
    if (!draw && !drag) return;
    const handleMove = (e) => {
      const pos = getPos(e.clientX, e.clientY);
      if (draw) {
        const { start } = draw;
        setDraw({
          start,
          current: {
            x: Math.min(start.x, pos.x),
            y: Math.min(start.y, pos.y),
            w: Math.abs(pos.x - start.x),
            h: Math.abs(pos.y - start.y),
          },
        });
        return;
      }
      const { orig } = drag;
      const dx = pos.x - drag.startX;
      const dy = pos.y - drag.startY;
      if (drag.mode === 'move') {
        onChangeTarget(drag.index, {
          ...orig,
          x: Math.min(clampPct(orig.x + dx), 100 - orig.w),
          y: Math.min(clampPct(orig.y + dy), 100 - orig.h),
        });
        return;
      }
      const handle = drag.handle;
      let { x, y, w, h } = orig;
      if (handle.includes('e')) w = Math.max(MIN_REGION_PCT, Math.min(orig.w + dx, 100 - orig.x));
      if (handle.includes('s')) h = Math.max(MIN_REGION_PCT, Math.min(orig.h + dy, 100 - orig.y));
      if (handle.includes('w')) {
        x = clampPct(Math.min(orig.x + dx, orig.x + orig.w - MIN_REGION_PCT));
        w = orig.x + orig.w - x;
      }
      if (handle.includes('n')) {
        y = clampPct(Math.min(orig.y + dy, orig.y + orig.h - MIN_REGION_PCT));
        h = orig.y + orig.h - y;
      }
      onChangeTarget(drag.index, { x, y, w, h });
    };
    const handleUp = (e) => {
      // Use the RELEASE position itself: the last pointermove may not have been
      // rendered yet, and the box must end exactly where the mouse was let go.
      let box = null;
      if (draw) {
        const pos = e.type === 'pointercancel' ? null : getPos(e.clientX, e.clientY);
        box = pos
          ? {
              x: Math.min(draw.start.x, pos.x),
              y: Math.min(draw.start.y, pos.y),
              w: Math.abs(pos.x - draw.start.x),
              h: Math.abs(pos.y - draw.start.y),
            }
          : null;
      }
      if (box && box.w > MIN_REGION_PCT && box.h > MIN_REGION_PCT) onAddTarget(box);
      setDraw(null);
      setDrag(null);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [draw, drag, getPos, onAddTarget, onChangeTarget]);

  const startDrag = (e, index, mode, handle) => {
    e.stopPropagation(); // not a new box
    e.preventDefault();
    const pos = getPos(e.clientX, e.clientY);
    setDrag({
      index,
      mode,
      handle,
      startX: pos.x,
      startY: pos.y,
      orig: { ...activeTargets[index] },
    });
  };

  const badge = (subNumber, index, count) => (count > 1 ? `${subNumber}·${index + 1}` : subNumber);
  /** Zoom out · % · zoom in · fit · full screen. */
  const zoomTools = (toolsClass) => (
    <div
      className={`flex items-center gap-0.5 rounded-xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark p-0.5 flex-shrink-0 ${toolsClass}`}
    >
      <Tooltip label="Zoom out (Ctrl/⌘ + scroll)">
        <button
          onClick={() => stepZoom(-1)}
          disabled={zoom <= MIN_ZOOM + 0.001}
          className={TOOL_BUTTON_CLASS}
          aria-label="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </Tooltip>
      <span className="w-12 text-center text-xs font-semibold tabular-nums text-ink-soft dark:text-ink-soft-dark">
        {Math.round(zoom * 100)}%
      </span>
      <Tooltip label="Zoom in (Ctrl/⌘ + scroll)">
        <button
          onClick={() => stepZoom(1)}
          disabled={zoom >= MAX_ZOOM - 0.001}
          className={TOOL_BUTTON_CLASS}
          aria-label="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </Tooltip>
      <span className="w-px h-5 bg-line dark:bg-line-dark mx-0.5" aria-hidden="true" />
      <Tooltip label="Fit to view">
        <button
          onClick={() => zoomTo(1)}
          disabled={Math.abs(zoom - 1) < 0.001}
          className={TOOL_BUTTON_CLASS}
          aria-label="Fit to view"
        >
          <Scan className="w-4 h-4" />
        </button>
      </Tooltip>
      <Tooltip label={expanded ? 'Exit full screen (Esc)' : 'Full screen'}>
        <button
          onClick={() => setExpanded((v) => !v)}
          className={TOOL_BUTTON_CLASS}
          aria-label={expanded ? 'Exit full screen' : 'Full screen'}
        >
          {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </Tooltip>
    </div>
  );

  const setViewportRef = (node) => {
    viewportRef.current = node;
    sizeRef(node);
  };

  return (
    <div
      className={
        expanded
          ? 'fixed inset-0 z-[60] flex flex-col bg-paper dark:bg-paper-dark p-3 sm:p-4'
          : 'relative flex flex-col h-[60vh] lg:h-full min-h-[320px]'
      }
    >
      {/* With a hint: a strip above the screenshot (hint · zoom tools). Without
          one (the editor's blue bar already says what to do): the zoom tools
          float in the corner of the screenshot and show fully on hover. */}
      {hint ? (
        <div className="flex items-center gap-2 mb-2 flex-shrink-0">
          <p
            className={`flex-1 min-w-0 flex items-center gap-1.5 text-xs font-semibold truncate ${
              activeTargets.length === 0 || replacingIndex !== null
                ? 'text-accent'
                : 'text-ink-soft dark:text-ink-faint-dark'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{imageUrl ? hint : 'Loading screenshot…'}</span>
          </p>
          {zoomTools('')}
        </div>
      ) : null}
      <div className="group/canvas relative flex-1 min-h-0">
        {!hint && (
          <div className="absolute top-2 right-4 z-20">
            {zoomTools(
              'opacity-60 group-hover/canvas:opacity-100 focus-within:opacity-100 shadow-premium transition-opacity',
            )}
          </div>
        )}
        {/* Viewport: scrolls when zoomed in */}
        <div
          ref={setViewportRef}
          className="absolute inset-0 overflow-auto overscroll-contain rounded-xl border border-line dark:border-line-dark bg-paper-2/60 dark:bg-paper-2-dark/60"
        >
          <div className="flex min-w-full min-h-full" style={{ padding: VIEWPORT_PAD }}>
            <div
              ref={containerRef}
              className={`relative m-auto flex-shrink-0 overflow-hidden rounded-lg bg-paper-2 dark:bg-paper-2-dark select-none shadow-sm ${
                imageUrl ? 'cursor-crosshair' : ''
              }`}
              onPointerDown={handlePointerDown}
              style={{ width: canvasWidth, height: canvasHeight, touchAction: 'none' }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Global step screenshot"
                  onLoad={(e) => {
                    const { naturalWidth, naturalHeight } = e.currentTarget;
                    if (naturalWidth && naturalHeight) setRatio(naturalWidth / naturalHeight);
                  }}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  draggable={false}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-faint dark:text-ink-faint-dark">
                  Loading screenshot…
                </div>
              )}

              {/* Other steps' boxes: see-through to the mouse (drawing works on top of
                  them, even over a full-page box); only the number badge is clickable
                  and switches to that step. */}
              {subSteps
                .filter((s) => s.id !== activeId)
                .flatMap((s) =>
                  s.targets.map((t, n) => {
                    const lit = highlightId === s.id;
                    return (
                      <div
                        key={`${s.id}-${n}`}
                        className={`absolute rounded-md pointer-events-none transition-colors ${
                          lit
                            ? 'border-2 border-accent bg-accent/20 ring-4 ring-accent/25'
                            : 'border-2 border-dashed border-white/80 bg-black/10'
                        }`}
                        style={regionStyle(t)}
                      >
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSubStep(s.id);
                          }}
                          onPointerEnter={() => onHoverSubStep?.(s.id)}
                          onPointerLeave={() => onHoverSubStep?.(null)}
                          className={`pointer-events-auto absolute -top-2.5 -left-2.5 min-w-[20px] h-5 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow cursor-pointer hover:scale-110 transition-transform ${
                            lit ? 'bg-accent' : 'bg-ink/80 hover:bg-accent'
                          }`}
                          title={`Go to step ${s.number}`}
                          aria-label={`Go to step ${s.number}`}
                        >
                          {badge(s.number, n, s.targets.length)}
                        </button>
                      </div>
                    );
                  }),
                )}

              {/* Selected sub-step's targets: move / resize / remove */}
              {active &&
                activeTargets.map((t, n) => {
                  const isReplacing = replacingIndex === n;
                  return (
                    <div
                      key={`active-${n}`}
                      className={`absolute rounded-md pointer-events-none ${
                        isReplacing
                          ? 'border-2 border-dashed border-accent bg-accent/5'
                          : 'border-2 border-accent bg-accent/10'
                      } ${highlightId === activeId ? 'ring-4 ring-accent/25' : ''}`}
                      style={regionStyle(t)}
                    >
                      {/* Inside the box stays free for drawing another box; the
                          edges (and the number badge) move it, the corners resize. */}
                      {!isReplacing &&
                        EDGE_GRIPS.map((edge) => (
                          <div
                            key={edge}
                            className={`pointer-events-auto absolute cursor-move ${EDGE_GRIP_CLASS[edge]}`}
                            onPointerDown={(e) => startDrag(e, n, 'move')}
                            onPointerEnter={() => onHoverSubStep?.(activeId)}
                            onPointerLeave={() => onHoverSubStep?.(null)}
                          />
                        ))}
                      {focusKey && !isReplacing && (
                        <span
                          key={focusKey}
                          className="hs-area-focus absolute inset-0 rounded-md pointer-events-none"
                        />
                      )}
                      {/* Click beacon: shows at a glance that viewers click here */}
                      {caption?.action === 'click' && !isReplacing && (
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex w-4 h-4 pointer-events-none">
                          <span className="absolute inset-0 rounded-full bg-accent/60 animate-ping" />
                          <span className="relative w-4 h-4 rounded-full bg-accent border-2 border-white shadow" />
                        </span>
                      )}
                      <span
                        className={`absolute -top-2.5 -left-2.5 min-w-[20px] h-5 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center shadow ${
                          isReplacing ? 'pointer-events-none' : 'pointer-events-auto cursor-move'
                        }`}
                        onPointerDown={(e) => !isReplacing && startDrag(e, n, 'move')}
                        title="Drag to move"
                      >
                        {isReplacing ? (
                          <RotateCcw className="w-3 h-3" />
                        ) : (
                          badge(active.number, n, activeTargets.length)
                        )}
                      </span>
                      {!isReplacing && (
                        <>
                          {RESIZE_HANDLES.map((handle) => (
                            <div
                              key={handle}
                              className="pointer-events-auto absolute w-3.5 h-3.5 bg-white border-2 border-accent rounded-sm"
                              style={handleStyle(handle)}
                              onPointerDown={(e) => startDrag(e, n, 'resize', handle)}
                            />
                          ))}
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onChangeTarget(n, null);
                            }}
                            className="pointer-events-auto absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-danger text-white text-xs flex items-center justify-center shadow-md"
                            aria-label={`Remove target ${n + 1}`}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}

              {/* Live caption next to the first box: what viewers will read, where
                  they will read it. Clicking it jumps to the text field. */}
              {caption && active && activeTargets[0] && !draw && replacingIndex === null && (
                <CaptionBubble
                  box={activeTargets[0]}
                  number={active.number}
                  text={caption.text}
                  onClick={onCaptionClick}
                />
              )}

              {/* Live preview while drawing */}
              {draw && (
                <div
                  className="absolute border-2 border-dashed border-accent bg-accent/15 rounded-md pointer-events-none"
                  style={regionStyle(draw.current)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Caption preview under the box (above it when the box sits low), kept inside
 * the screenshot horizontally. Positioned in % so it follows zoom.
 */
function CaptionBubble({ box, number, text, onClick }) {
  const below = box.y + box.h < 72;
  const left = Math.min(Math.max(box.x, 1), 60);
  const style = below
    ? { left: `${left}%`, top: `calc(${box.y + box.h}% + 10px)` }
    : { left: `${left}%`, bottom: `calc(${100 - box.y}% + 10px)` };
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="absolute z-10 max-w-[min(340px,40%)] min-w-[180px] text-left flex items-start gap-2 rounded-xl bg-white/95 dark:bg-panel-dark/95 backdrop-blur px-3 py-2 shadow-premium ring-1 ring-black/5 hover:ring-accent/50 transition-shadow"
      style={style}
      title="Click to edit the text"
    >
      <span className="w-5 h-5 mt-px rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
        {number}
      </span>
      <span
        className={`text-xs leading-snug line-clamp-3 ${
          text?.trim()
            ? 'text-ink dark:text-ink-soft-dark'
            : 'italic text-ink-faint dark:text-ink-faint-dark'
        }`}
      >
        {text?.trim() || 'Write what to do in the panel →'}
      </span>
    </button>
  );
}
