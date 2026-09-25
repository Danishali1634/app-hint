/**
 * @file Tiny looping animations that show what to do on the current screen,
 * used inside the editor next to the matching instruction:
 *   variant "upload" — a screenshot drops into a frame  (StepScreenshotUpload)
 *   variant "select" — a pointer drags a box over a button (RegionActionBar)
 * CSS-only (index.css → "small in-editor hints"); frozen for reduced motion.
 */

/** @param {{ variant: 'upload' | 'select' }} props */
export function MiniHint({ variant }) {
  return (
    <div
      className="relative w-40 aspect-[16/10] rounded-lg border border-line dark:border-line-dark bg-paper-2 dark:bg-paper-2-dark overflow-hidden flex-shrink-0"
      aria-hidden="true"
    >
      {variant === 'upload' ? (
        <>
          <div className="absolute inset-[10%] rounded-md border-2 border-dashed border-accent/50" />
          <div className="mini-drop-card absolute inset-[16%] rounded bg-white shadow-md overflow-hidden">
            <div className="h-[18%] bg-[#1f2a44]" />
            <div className="m-[6%] h-[10%] w-[40%] rounded-sm bg-[#cfd5e2]" />
            <div className="mx-[6%] h-[10%] rounded-sm bg-[#e3e7ef]" />
            <div className="m-[6%] h-[10%] rounded-sm bg-[#e3e7ef]" />
          </div>
        </>
      ) : (
        <>
          <div className="absolute inset-x-0 top-0 h-[16%] bg-[#1f2a44]" />
          <div className="absolute left-[30%] top-[38%] w-[40%] h-[24%] rounded bg-[#2563eb]" />
          <div className="absolute left-[8%] right-[8%] top-[74%] h-[10%] rounded-sm bg-[#e3e7ef]" />
          <div className="mini-select-box absolute left-[27%] top-[35%] rounded border-2 border-dashed border-accent bg-accent/15" />
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            className="mini-select-pointer absolute -ml-[2px] -mt-[1px] drop-shadow"
          >
            <path
              d="M3 2 L3 19.5 L7.8 15.2 L11 22 L14.2 20.6 L11.1 13.9 L17.6 13.9 Z"
              fill="#fff"
              stroke="#111827"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </>
      )}
    </div>
  );
}
