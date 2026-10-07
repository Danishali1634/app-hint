/**
 * @file The camera + the walkthrough's ONE persistent focus.
 *
 * WalkthroughStage says where the focus should be for the current step (a
 * camera view + the target boxes, in image %); this component owns the focus
 * itself and morphs it there (hooks/useFocusMotion). Across same-page steps it
 * stays mounted, so the focus is never torn down and rebuilt — its geometry
 * just changes: parent → child contracts inward, child → parent expands,
 * siblings travel directly. Opacity is only used when a focus first appears on
 * a screen or a step has no area at all, never to swap one focus for another.
 *
 *   camera   the screenshot (children), moved by the animated camera view
 *   dim      one SVG: the stage darkened, with a rounded hole per box
 *   rings    one accent border per box (box 0 is THE focus; extra boxes of a
 *            multi-target step grow out of / contract into it)
 *
 * Camera, holes and rings are all drawn from the same frame, so the focus is
 * locked onto its target at every instant of a move.
 */

import { useId } from 'react';
import { cameraTransform, projectRegion } from '@/utils/camera';
import { focusRadius } from '@/utils/focusMotion';
import { useFocusMotion } from '@/hooks/useFocusMotion';

/**
 * @param {{
 *   view: import('@/utils/camera').CameraView,   // where the camera should be
 *   boxes: import('@/types').Region[],           // where the focus should be (image %)
 *   duration: number,                            // ms per move (the course's pace)
 *   width: number, height: number,               // stage px
 *   padding: number,                             // px around each target
 *   visible: boolean,                            // focus shown at all (dim + rings)
 *   fadeStyle?: object,                          // --hs-fade / --hs-fade-delay for `visible`
 *   ringClass: string,                           // enter / arrive / pulse motion
 *   ringKey: string,                             // changes restart the ring motion
 *   pressIndex?: number,                         // ring that flashes (a click), or -1
 *   alt?: string,
 *   children: React.ReactNode,                   // the screenshot layers
 * }} props
 */
export function FocusCamera({
  view,
  boxes,
  duration,
  width,
  height,
  padding,
  visible,
  fadeStyle,
  ringClass,
  ringKey,
  pressIndex = -1,
  children,
}) {
  const frame = useFocusMotion({ view, boxes }, duration);
  const maskId = `hs-focus-${useId().replace(/:/g, '')}`;

  // Boxes on the stage, in px (sharp at any zoom: drawn outside the camera).
  const holes = frame.boxes.map((b) => {
    const p = projectRegion(b, frame.view);
    const x = (p.x / 100) * width - padding;
    const y = (p.y / 100) * height - padding;
    const w = (p.w / 100) * width + padding * 2;
    const h = (p.h / 100) * height + padding * 2;
    return { x, y, w, h, r: focusRadius(w, h) };
  });
  const layerStyle = { opacity: visible ? 1 : 0, ...fadeStyle };

  return (
    <>
      <div
        className="absolute inset-0"
        style={{ transformOrigin: '0 0', transform: cameraTransform(frame.view) }}
      >
        {children}
      </div>

      <svg
        className="hs-focus-layer absolute inset-0 pointer-events-none"
        width={width}
        height={height}
        style={layerStyle}
        aria-hidden="true"
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <rect x="0" y="0" width={width} height={height} fill="white" />
            {holes.map((h, n) => (
              <rect key={n} x={h.x} y={h.y} width={h.w} height={h.h} rx={h.r} fill="black" />
            ))}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill="rgba(8, 10, 14, 0.62)"
          mask={`url(#${maskId})`}
        />
      </svg>

      <div className="hs-focus-layer absolute inset-0 pointer-events-none" style={layerStyle}>
        {holes.map((h, n) => (
          <div
            key={n}
            className="absolute"
            style={{ left: h.x, top: h.y, width: h.w, height: h.h }}
          >
            <div
              key={`${ringKey}-${n === pressIndex}`}
              className={`absolute inset-0 border-[3px] border-accent ${
                n === pressIndex ? 'hs-ring-flash' : ringClass
              }`}
              style={{ borderRadius: h.r }}
            />
          </div>
        ))}
      </div>
    </>
  );
}
