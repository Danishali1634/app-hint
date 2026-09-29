/**
 * @file Editor for one SCREEN (one screenshot of the app) and its STEPS.
 * Names shown to the user, kept plain on purpose:
 *
 *   Screen 3        one screenshot (in code: a "unit" / Global Step, a groupId)
 *   └─ Step 1       what the viewer does there: Click · Look · Type + what is said
 *      └─ Highlight the box(es) drawn on the screenshot (step.region + extraRegions)
 *
 * A plain screen has one step. Steps are stored as consecutive steps sharing a
 * groupId (utils/course), so playback / video / links need nothing new.
 *
 * ONLY WHAT IS NEEDED IS SHOWN
 *   - The blue bar says where you are ("Screen 3 › Step 2") and the ONE next
 *     thing to do, with a "Show me" link to its tutorial (examples/editorTutorials).
 *   - Screenshot tools live in one "⋯" menu; the screenshots strip appears
 *     only once a screen has more than one screenshot.
 *   - Only the selected step is open; the others are one line each. Inside
 *     it, controls appear when they make sense: before the first box only a
 *     hint; after it Click · Look · Type and the text. Redraw / remove /
 *     delete show on hover, the title on click.
 *   - "Add step" appears once the current step has its box.
 *   - Every button has a tooltip (components/ui/Tooltip).
 * The screenshot itself needs no mode switches (components/course/TargetCanvas):
 * dragging on an empty spot adds a highlight to the selected step, boxes can
 * be moved / resized / removed, clicking another step's box selects it.
 *
 * Voice recording / upload is switched off for now (see the commented-out
 * AudioRecorderPanel below); text is read by the AI voice.
 *
 * Next / Previous (or Ctrl/⌘ + Enter in a description) moves between steps in
 * place. The component only renders and reports; the page owns the course.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Check,
  Crosshair,
  Trash2,
  Upload,
  Split,
  MousePointerClick,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronRight as Chevron,
  TextCursorInput,
  RotateCcw,
  Images,
  ImagePlus,
  X,
  AlertCircle,
  Pencil,
} from 'lucide-react';
import {
  DEFAULT_SUB_LABEL,
  getStepAction,
  getStepTargets,
  targetTexts,
  withTargets,
} from '@/utils/course';
import { TargetCanvas } from '@/components/course/TargetCanvas';
import { PanelResizer, readStoredNumber, storeValue } from '@/components/ui/PanelResizer';
import { DescriptionField } from '@/components/course/DescriptionField';
// Voice recording / upload is switched off for now.
// import { AudioRecorderPanel } from '@/components/course/AudioRecorderPanel';
import { Tooltip } from '@/components/ui/Tooltip';
import { ShowMe } from '@/components/tutorial/ShowMe';
import { MoreMenu } from '@/components/ui/MoreMenu';
import { MiniHint } from '@/components/tutorial/MiniHint';
import { WhatsNext } from '@/components/tutorial/WhatsNext';

/** @typedef {import('@/types').Step} Step */

const SMALL_ICON_BUTTON_CLASS =
  'w-6 h-6 rounded-md flex items-center justify-center text-ink-faint dark:text-ink-faint-dark transition-colors';

/** Steps panel width, px (resizable; remembered per browser). */
const PANEL_DEFAULT = 360;
const PANEL_WIDTH_KEY = 'hs-editor-substeps-width';
const clampPanel = (w) => Math.round(Math.min(560, Math.max(280, w)));

const ACTIONS = [
  {
    value: 'click',
    Icon: MousePointerClick,
    text: 'Click',
    tip: 'The viewer clicks the highlight',
  },
  { value: 'look', Icon: Eye, text: 'Look', tip: 'Just point at it, no click' },
  { value: 'type', Icon: TextCursorInput, text: 'Type', tip: 'The viewer types into it' },
];

/**
 * @param {{
 *   mainNumber: number,              // "Screen 3"
 *   subSteps: Step[],                // Step 1, 2, … (at least one)
 *   activeStepId: string,
 *   imageUrl: string | null,
 *   pageName?: string,
 *   onSelect: (stepId: string) => void,
 *   onUpdateStep: (stepId: string, patch: Partial<Step>) => void,
 *   onAddSubStep: () => void,        // new step after the last one, selected
 *   onAddFeatureWithBox?: (region) => void,  // a box drawn when this feature already has one → the next feature
 *   onDeleteSubStep: (stepId: string) => void,
 *   onChangeScreenshot: () => void,
 *   onSplit: () => void,             // every step → its own screen
 *   onDeleteAll: () => void,         // the screen with all its steps (parent asks)
 *   highlightId?: string | null,     // step hovered in the step list → outlined on the screenshot
 *   screens: { id: string, url?: string }[],   // the screenshots this screen uses (1 = base)
 *   screenOf: Record<string, string>,  // step id → the screenshot (media id) it shows
 *   onUseScreen: (mediaId: string) => void,     // show this screenshot for the selected step
 *   onAddScreens: (files: File[]) => void,      // each new screenshot becomes a new step
 *   onOpenGallery: () => void,
 *   onShowTutorial?: (id: string) => void,      // plays examples/editorTutorials[id]
 *   onAddScreen?: () => void,                   // "What to do next?" → a new page or popup
 *   onFinish?: () => void,                      // "What to do next?" → Save
 * }} props
 */
export function GlobalStepEditor({
  mainNumber,
  subSteps,
  activeStepId,
  imageUrl,
  pageName,
  onSelect,
  onUpdateStep,
  onAddSubStep,
  onAddFeatureWithBox,
  onDeleteSubStep,
  onChangeScreenshot,
  onSplit,
  onDeleteAll,
  highlightId = null,
  screens = [],
  screenOf = {},
  onUseScreen,
  onAddScreens,
  onOpenGallery,
  onShowTutorial,
  onAddScreen,
  onFinish,
}) {
  const listRef = useRef(null);
  // Step under the pointer (card or box): its card and highlights light up together.
  const [hovered, setHovered] = useState(null);
  // Width of the steps panel (drag the handle; remembered in this browser).
  const [panelWidth, setPanelWidthState] = useState(() =>
    clampPanel(readStoredNumber(PANEL_WIDTH_KEY, PANEL_DEFAULT)),
  );
  const panelStartRef = useRef(panelWidth);
  const setPanelWidth = (width) => {
    setPanelWidthState(width);
    storeValue(PANEL_WIDTH_KEY, width);
  };
  const activeIndex = Math.max(
    0,
    subSteps.findIndex((s) => s.id === activeStepId),
  );
  const active = subSteps[activeIndex];
  // What users see: "Feature 2" of this screen (each screen lists its own features).
  const subNumber = activeIndex + 1;
  const targets = getStepTargets(active);
  const isLast = activeIndex >= subSteps.length - 1;
  // Index of the highlight being redrawn, for the selected step only.
  const [replacing, setReplacing] = useState(null);
  // "+ Add highlight" pressed: the canvas asks for the next box.
  const [wantsAnother, setWantsAnother] = useState(false);
  useEffect(() => {
    setReplacing(null);
    setWantsAnother(false);
  }, [activeStepId]);

  // Next / Previous: after the switch focus that step's description.
  const focusAfterMoveRef = useRef(null);

  // Keep the selected card in view inside the scrolling list.
  useEffect(() => {
    const list = listRef.current;
    const card = list?.querySelector(`[data-area-id="${activeStepId}"]`);
    if (!list || !card) return;
    const moved = focusAfterMoveRef.current === activeStepId;
    focusAfterMoveRef.current = null;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cardTop = card.offsetTop; // the list is the cards' offsetParent
    const cardBottom = cardTop + card.offsetHeight;
    let top = null;
    if (moved) top = Math.max(0, cardTop - 64);
    else if (cardTop < list.scrollTop) top = cardTop - 8;
    else if (cardBottom > list.scrollTop + list.clientHeight)
      top = Math.min(cardTop - 8, cardBottom - list.clientHeight + 8);
    if (top !== null) list.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    if (moved) {
      const box = document.getElementById(`area-desc-${activeStepId}`);
      box?.focus({ preventScroll: true });
      box?.setSelectionRange(box.value.length, box.value.length);
    }
  }, [activeStepId, subSteps.length]);

  /** Step at `index`; past the last one → add a new step. */
  const moveTo = (index) => {
    if (index >= subSteps.length) {
      onAddSubStep();
      return;
    }
    const next = subSteps[Math.max(0, index)];
    if (!next || next.id === active.id) return;
    focusAfterMoveRef.current = next.id;
    onSelect(next.id);
  };

  // ── Highlights of the selected step ──
  const setTargets = (list) => onUpdateStep(active.id, withTargets(list));
  // Drawing is all it takes: the first box belongs to this feature; every further
  // box on the screen becomes the NEXT feature right away (no "Add feature" click
  // needed between them). "Add highlight" (wantsAnother) adds a box to this same
  // feature instead, and "Redraw" replaces one.
  const addTarget = (region) => {
    if (replacing !== null && targets[replacing]) {
      setTargets(targets.map((t, n) => (n === replacing ? region : t)));
      setReplacing(null);
      return;
    }
    if (targets.length > 0 && !wantsAnother && onAddFeatureWithBox) {
      onAddFeatureWithBox(region);
      return;
    }
    setTargets([...targets, region]);
    setWantsAnother(false);
  };
  const changeTarget = (index, region) => {
    if (region) {
      setTargets(targets.map((t, n) => (n === index ? region : t)));
      return;
    }
    // Removing a highlight also removes ITS description (descriptions pair with highlights).
    const texts = targetTexts(active, targets.length);
    texts.splice(index, 1);
    onUpdateStep(active.id, {
      ...withTargets(targets.filter((_, n) => n !== index)),
      text: texts[0] ?? '',
      extraTexts: texts.slice(1),
    });
    setReplacing(null);
  };

  const pickScreenshots = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => input.files?.length && onAddScreens([...input.files]);
    input.click();
  };

  // ── The one next thing to do (blue bar) ──
  const hasText = !!active.text?.trim();
  let status;
  if (replacing !== null || wantsAnother) {
    status = (
      <>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink dark:text-ink-soft-dark">
          <Crosshair className="w-4 h-4 text-ink-faint dark:text-ink-faint-dark" />
          {replacing !== null
            ? `Draw the new box for Highlight ${replacing + 1}`
            : `Drag a box for Highlight ${targets.length + 1}`}
        </p>
        <Tooltip label="Stop and keep things as they are">
          <button
            onClick={() => {
              setReplacing(null);
              setWantsAnother(false);
            }}
            className="flex items-center gap-1 px-2 h-7 rounded-lg text-xs font-semibold text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </Tooltip>
      </>
    );
  } else if (targets.length === 0) {
    status = (
      <>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink dark:text-ink-soft-dark">
          <Crosshair className="w-4 h-4 text-ink-faint dark:text-ink-faint-dark" />
          Drag a box over what the viewer should click
        </p>
        <ShowMe onClick={onShowTutorial && (() => onShowTutorial('highlight'))} />
      </>
    );
  } else if (!hasText && !active.audioId) {
    status = (
      <>
        {/* <p className="flex items-center gap-1.5 text-sm font-semibold text-ink dark:text-ink-soft-dark">
          <Check className="w-4 h-4 text-teal dark:text-teal-dark" />
          Highlighted. Now write what to do
        </p> */}
        <ShowMe onClick={onShowTutorial && (() => onShowTutorial('describe'))} />
      </>
    );
  } else {
    status = (
      <>
        <p className="flex items-center gap-1.5 text-sm font-medium text-teal dark:text-teal-dark">
          <Check className="w-4 h-4" /> Feature {subNumber} is ready
        </p>
        {/* <span className="text-sm text-ink-faint dark:text-ink-faint-dark">
          Draw another box for the next feature, or
        </span> */}
        {/* <Tooltip label="Add the next feature on this screen" shortcut="Ctrl/⌘ + Enter">
          <button
            onClick={onAddSubStep}
            className="flex items-center gap-1 px-2.5 h-7 rounded-lg border border-line dark:border-line-dark text-xs font-semibold text-ink dark:text-ink-soft-dark hover:border-ink-faint dark:hover:border-ink-faint-dark transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add feature
          </button>
        </Tooltip> */}
      </>
    );
  }

  return (
    // Two columns: [blue bar · screenshots · screenshot] | resizer | steps panel.
    // The steps panel is the main working area, so it runs the full height.
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-0 lg:h-full lg:min-h-0">
      <div className="flex-1 min-w-0 flex flex-col gap-3 lg:min-h-0">
        {/* ── Blue bar: where you are · the next thing to do · screenshot tools ── */}
        <div
          key={`${active.id}-${replacing}`}
          className="relative z-30 hs-area-open flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark flex-shrink-0"
        >
          <span className="flex items-center gap-1 text-xs font-semibold whitespace-nowrap">
            <Tooltip label={`Screen ${mainNumber}: one screenshot of your app`}>
              <span className="text-ink-faint dark:text-ink-faint-dark">Screen {mainNumber}</span>
            </Tooltip>
            <Chevron className="w-3.5 h-3.5 text-ink-faint" />
            {/* <Tooltip label={`Feature ${subNumber}: one thing the viewer does on this screen`}>
            <span className="px-1.5 py-0.5 rounded-md bg-accent/15 text-accent">
              Step {subNumber}
            </span>
          </Tooltip> */}
          </span>
          <span className="flex flex-wrap items-center gap-2 mr-auto min-w-0">{status}</span>
          <MoreMenu
            label="Screenshot options"
            buttonClassName="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft dark:text-ink-soft-dark border border-line dark:border-line-dark bg-panel/70 dark:bg-panel-dark/70 hover:text-accent hover:border-accent/50 transition-colors"
            items={[
              { icon: Upload, label: 'Replace this screenshot', onClick: onChangeScreenshot },
              {
                icon: ImagePlus,
                label: 'Add a screenshot after a change',
                onClick: pickScreenshots,
              },
              { icon: Images, label: 'Reuse a screenshot', onClick: onOpenGallery },
              subSteps.length > 1 && {
                icon: Split,
                label: 'Make every feature its own screen',
                onClick: onSplit,
              },
              {
                icon: Trash2,
                label: `Delete Screen ${mainNumber}`,
                onClick: onDeleteAll,
                danger: true,
              },
            ]}
          />
        </div>

        {/* ── Screenshots of this screen: only when there is more than one ── */}
        {screens.length > 1 && (
          <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark whitespace-nowrap">
              Screenshots
            </span>
            <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto py-1 px-0.5">
              {screens.map((screen, n) => {
                const isActive = screen.id === screenOf[active.id];
                return (
                  <Tooltip
                    key={screen.id}
                    label={
                      isActive
                        ? `Feature ${subNumber} shows screenshot ${n + 1}`
                        : `Show screenshot ${n + 1} in Feature ${subNumber}`
                    }
                  >
                    <button
                      onClick={() => !isActive && onUseScreen(screen.id)}
                      className={`relative flex-shrink-0 w-16 h-10 rounded-md overflow-hidden border-2 transition-all bg-paper-2 dark:bg-paper-2-dark ${
                        isActive
                          ? 'border-accent ring-2 ring-accent/25'
                          : 'border-line dark:border-line-dark hover:border-accent/60'
                      }`}
                      aria-label={`Screenshot ${n + 1}`}
                    >
                      {screen.url && (
                        <img
                          src={screen.url}
                          alt=""
                          className="w-full h-full object-cover object-top"
                          draggable={false}
                        />
                      )}
                      <span
                        className={`absolute bottom-0.5 left-0.5 px-1 rounded text-[9px] font-bold leading-[14px] ${
                          isActive ? 'bg-accent text-white' : 'bg-ink/75 text-white'
                        }`}
                      >
                        {n + 1}
                      </span>
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        )}

        <div data-tour="canvas" className="flex-1 min-w-0 min-h-0">
          <TargetCanvas
            imageUrl={imageUrl}
            subSteps={subSteps
              .map((s, k) => ({
                id: s.id,
                number: k + 1,
                targets: getStepTargets(s),
              }))
              .filter((s) => screenOf[s.id] === screenOf[active.id])}
            activeId={active.id}
            replacingIndex={replacing}
            onAddTarget={addTarget}
            onChangeTarget={changeTarget}
            onSelectSubStep={onSelect}
            focusKey={active.id}
            highlightId={hovered ?? highlightId}
            onHoverSubStep={setHovered}
            caption={{ text: active.text || '', action: getStepAction(active) }}
            onCaptionClick={() => document.getElementById(`area-desc-${active.id}`)?.focus()}
          />
        </div>
      </div>

      <PanelResizer
        label="Drag to resize"
        onResizeStart={() => (panelStartRef.current = panelWidth)}
        onResize={(dx) => setPanelWidth(clampPanel(panelStartRef.current - dx))}
        onReset={() => setPanelWidth(PANEL_DEFAULT)}
      />

      {/* ── Steps: fixed header + footer, only the cards scroll ── */}
      <div
        data-tour="steps"
        className="min-w-0 max-h-[80vh] lg:max-h-none lg:h-full lg:w-[var(--panel-w)] flex-shrink-0 rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark flex flex-col"
        style={{ '--panel-w': `${panelWidth}px` }}
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-line dark:border-line-dark flex-shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark">
            Features on this screen
          </p>
          <span className="text-xs font-medium text-ink-faint dark:text-ink-faint-dark tabular-nums whitespace-nowrap">
            {activeIndex + 1} of {subSteps.length}
          </span>
        </div>
        <div
          ref={listRef}
          className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 flex flex-col gap-2"
        >
          {subSteps.map((step, k) => (
            <SubStepCard
              key={step.id}
              step={step}
              number={k + 1}
              isActive={step.id === active.id}
              isHighlighted={(hovered ?? highlightId) === step.id}
              screenNumber={
                screens.length > 1 ? screens.findIndex((sc) => sc.id === screenOf[step.id]) + 1 : 0
              }
              pageName={pageName}
              thumbUrl={screens.find((sc) => sc.id === screenOf[step.id])?.url ?? imageUrl ?? null}
              replacing={step.id === active.id ? replacing : null}
              onSelect={() => step.id !== active.id && onSelect(step.id)}
              onHover={setHovered}
              onUpdate={(patch) => onUpdateStep(step.id, patch)}
              onReselect={(index) => setReplacing(index)}
              onAddTarget={() => setWantsAnother(true)}
              onRemoveTarget={(index) => changeTarget(index, null)}
              onDelete={() => onDeleteSubStep(step.id)}
              onPrevious={() => moveTo(k - 1)}
              onNext={() => moveTo(k + 1)}
            />
          ))}
        </div>

        {/* Footer: "What to do next?" always; Previous when there is one; Next, or
            "Add feature" once this feature has its box */}
        {
          <div className="flex-shrink-0 border-t border-line dark:border-line-dark p-2">
            <div className="flex items-center gap-2">
              <WhatsNext
                options={[
                  {
                    art: 'draw',
                    title: 'Highlight more on this screen',
                    text: 'Just draw another box on the screenshot. Every box becomes the next feature of this screen.',
                    actions: onShowTutorial
                      ? [{ label: 'Show me', onClick: () => onShowTutorial('step') }]
                      : [],
                  },
                  {
                    art: 'screen',
                    title: 'A new page or popup opened?',
                    text: `Press Add screen. You add its screenshot, and it becomes Screen ${mainNumber + 1} with its own features.`,
                    actions: [
                      ...(onAddScreen ? [{ label: 'Add screen', onClick: onAddScreen }] : []),
                      ...(onShowTutorial
                        ? [{ label: 'Show me', onClick: () => onShowTutorial('screen') }]
                        : []),
                    ],
                  },
                  {
                    art: 'save',
                    title: 'All done?',
                    text: 'Press Save. Your walkthrough is saved and opens, ready to watch.',
                    actions: onFinish ? [{ label: 'Save', onClick: onFinish, primary: true }] : [],
                  },
                ]}
              />
              {activeIndex > 0 && (
                <Tooltip label="Go to the previous feature" shortcut="Ctrl/⌘ + Shift + Enter">
                  <button
                    onClick={() => moveTo(activeIndex - 1)}
                    className="flex items-center gap-1 px-2.5 h-9 rounded-lg text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark"
                  >
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </button>
                </Tooltip>
              )}
              {(!isLast || targets.length > 0) && (
                <Tooltip
                  className="ml-auto"
                  label={
                    isLast
                      ? 'Highlight something else on this same screenshot'
                      : 'Go to the next feature'
                  }
                  shortcut="Ctrl/⌘ + Enter"
                >
                  <button
                    data-tour="add-step"
                    onClick={() => moveTo(activeIndex + 1)}
                    className="flex items-center gap-1 pl-3 pr-2.5 h-9 rounded-lg border border-line dark:border-line-dark text-ink dark:text-ink-soft-dark text-sm font-semibold hover:border-ink-faint dark:hover:border-ink-faint-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
                  >
                    {isLast ? (
                      <>
                        <Plus className="w-4 h-4" /> Add feature
                      </>
                    ) : (
                      <>
                        Next feature <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        }
      </div>
    </div>
  );
}

/** One step. The selected one is open; the others are a single line. */
function SubStepCard({
  step,
  number,
  isActive,
  isHighlighted,
  screenNumber,
  pageName,
  thumbUrl,
  replacing,
  onSelect,
  onHover,
  onUpdate,
  onReselect,
  onAddTarget,
  onRemoveTarget,
  onDelete,
  onPrevious,
  onNext,
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const action = getStepAction(step);
  const targets = getStepTargets(step);
  const texts = targetTexts(step, targets.length);
  const label = (step.label || '').trim();
  const customLabel =
    label && !DEFAULT_SUB_LABEL.test(label) && !/^step \d+$/i.test(label) ? label : '';
  const defaultLabel = `Step ${number}`;
  const isDone = targets.length > 0 && (!!step.text?.trim() || !!step.audioId);
  const summary = customLabel || step.text?.trim() || '';

  const badge = (
    <span
      className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${
        isActive
          ? 'bg-accent text-white'
          : 'border border-line dark:border-line-dark text-ink-faint dark:text-ink-faint-dark'
      }`}
    >
      {isDone && !isActive ? <Check className="w-3.5 h-3.5" /> : number}
    </span>
  );
  const screenChip = screenNumber > 0 && (
    <Tooltip label={`Shows screenshot ${screenNumber}`}>
      <span className="px-1 py-px rounded bg-paper-2 dark:bg-paper-2-dark text-[10px] font-semibold text-ink-soft dark:text-ink-faint-dark">
        🖼 {screenNumber}
      </span>
    </Tooltip>
  );

  // ── Collapsed: one line ──
  if (!isActive) {
    return (
      <div
        data-area-id={step.id}
        onClick={onSelect}
        onPointerEnter={() => onHover(step.id)}
        onPointerLeave={() => onHover(null)}
        className={`flex-shrink-0 flex items-center gap-2 rounded-xl border px-2.5 py-2 cursor-pointer transition-all duration-200 ${
          isHighlighted
            ? 'border-ink-faint/60 bg-paper-2/60 dark:bg-paper-2-dark/60'
            : 'border-transparent hover:bg-paper-2/60 dark:hover:bg-paper-2-dark/60'
        }`}
      >
        {badge}
        {thumbUrl && (
          <span className="relative w-14 h-9 flex-shrink-0 rounded-md overflow-hidden border border-line dark:border-line-dark bg-paper-2 dark:bg-paper-2-dark">
            <img
              src={thumbUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-fill"
              draggable={false}
            />
            {targets.map((t, n) => (
              <span
                key={n}
                className="absolute border-2 border-accent bg-accent/20 rounded-[2px]"
                style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%` }}
              />
            ))}
          </span>
        )}
        <p className="flex-1 min-w-0 truncate text-sm text-ink dark:text-ink-soft-dark">
          <span className="font-semibold">Feature {number}</span>
          {summary && <span className="text-ink-soft dark:text-ink-faint-dark"> · {summary}</span>}
        </p>
        {screenChip}
        {targets.length === 0 && (
          <Tooltip label="No highlight yet">
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </Tooltip>
        )}
      </div>
    );
  }

  // ── Open: everything for this step ──
  return (
    <div
      data-area-id={step.id}
      onFocusCapture={onSelect}
      onPointerEnter={() => onHover(step.id)}
      onPointerLeave={() => onHover(null)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        if (e.shiftKey) onPrevious();
        else onNext();
      }}
      className="group hs-area-open flex-1 min-h-[22rem] flex flex-col gap-3 rounded-xl border border-accent/50 bg-panel dark:bg-panel-dark p-2.5"
    >
      <div className="flex items-center gap-2">
        {badge}
        {editingTitle ? (
          <input
            type="text"
            value={customLabel}
            onChange={(e) =>
              onUpdate({ label: e.target.value.trim() ? e.target.value : defaultLabel })
            }
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
            autoFocus
            maxLength={120}
            placeholder={`Feature ${number}`}
            aria-label={`Title of feature ${number}`}
            className="flex-1 min-w-0 px-2 py-0.5 rounded-md bg-panel dark:bg-panel-dark border border-accent text-sm font-semibold text-ink dark:text-ink-soft-dark outline-none"
          />
        ) : (
          <Tooltip
            label="Click to give this feature a title viewers will see"
            className="flex-1 min-w-0"
          >
            <button
              onClick={() => setEditingTitle(true)}
              className="flex items-center gap-1.5 min-w-0 text-left text-sm font-semibold text-ink dark:text-ink-soft-dark"
            >
              <span className="truncate">{customLabel || `Feature ${number}`}</span>
              <Pencil className="w-3 h-3 flex-shrink-0 text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </Tooltip>
        )}
        {screenChip}
        <Tooltip label="Delete this feature">
          <button
            onClick={onDelete}
            className={`${SMALL_ICON_BUTTON_CLASS} w-7 h-7 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger hover:bg-danger/10`}
            aria-label={`Delete feature ${number}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      </div>

      {/* Before the first box: only the hint. The rest appears once it exists. */}
      {targets.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-3 text-center">
          <MiniHint variant="select" />
          <p className="text-sm font-semibold text-ink dark:text-ink-soft-dark">
            Drag a box on the screenshot
          </p>
          <p className="text-xs text-ink-soft dark:text-ink-faint-dark">
            over what the viewer should click
          </p>
        </div>
      ) : (
        <>
          {/* Highlights (redraw / remove appear on hover) */}
          <div>
            <ul className="space-y-1">
              {targets.map((_, n) => (
                <li
                  key={n}
                  className={`group/row flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-xs ${
                    replacing === n
                      ? 'bg-accent/15 text-accent'
                      : 'bg-paper-2 dark:bg-paper-2-dark text-ink dark:text-ink-soft-dark'
                  }`}
                >
                  {replacing === n ? (
                    <RotateCcw className="w-3.5 h-3.5" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-ink-faint dark:text-ink-faint-dark" />
                  )}
                  <span className="font-semibold flex-1">Highlight {n + 1}</span>
                  <span className="flex items-center opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Tooltip label="Draw this highlight again">
                      <button
                        onClick={() => onReselect(n)}
                        className={`${SMALL_ICON_BUTTON_CLASS} hover:text-accent hover:bg-accent/10`}
                        aria-label={`Redraw highlight ${n + 1}`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Remove this highlight">
                      <button
                        onClick={() => onRemoveTarget(n)}
                        className={`${SMALL_ICON_BUTTON_CLASS} hover:text-danger hover:bg-danger/10`}
                        aria-label={`Remove highlight ${n + 1}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                  </span>
                </li>
              ))}
            </ul>
            <Tooltip label="Highlight one more thing in this same feature">
              <button
                onClick={onAddTarget}
                className="mt-1 flex items-center gap-1 px-1 text-xs font-medium text-ink-soft dark:text-ink-faint-dark hover:text-ink dark:hover:text-ink-soft-dark"
              >
                <Plus className="w-3.5 h-3.5" /> Add highlight
              </button>
            </Tooltip>
          </div>

          {/* What the viewer does */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {ACTIONS.map(({ value, Icon, text, tip }) => (
                <Tooltip key={value} label={tip}>
                  <button
                    onClick={() => onUpdate({ action: value })}
                    className={`flex items-center gap-1 px-2.5 h-7 rounded-lg border text-xs font-medium transition-colors ${
                      action === value
                        ? 'border-accent/60 bg-accent/10 text-accent dark:text-accent-ink-dark'
                        : 'border-line dark:border-line-dark text-ink-soft dark:text-ink-faint-dark hover:border-ink-faint dark:hover:border-ink-faint-dark'
                    }`}
                    aria-pressed={action === value}
                  >
                    <Icon className="w-3.5 h-3.5" /> {text}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
          {action === 'type' && (
            <input
              type="text"
              value={step.typeValue || ''}
              onChange={(e) => onUpdate({ typeValue: e.target.value })}
              placeholder="Text to type (optional)"
              className="w-full px-2.5 py-1.5 rounded-lg bg-panel dark:bg-panel-dark border border-line dark:border-line-dark text-xs text-ink dark:text-ink-soft-dark outline-none focus:border-accent"
              aria-label={`Text typed in feature ${number}`}
            />
          )}

          {/* What is said (one text per highlight when there are several) */}
          {targets.length > 1 ? (
            <div className="space-y-2.5">
              {targets.map((_, n) => (
                <div key={n}>
                  <p className="mb-1 text-xs font-semibold text-ink-soft dark:text-ink-faint-dark">
                    Highlight {n + 1}
                  </p>
                  <DescriptionField
                    id={n === 0 ? `area-desc-${step.id}` : undefined}
                    value={texts[n]}
                    onChange={(value) => {
                      if (n === 0) onUpdate({ text: value });
                      else {
                        const extra = texts.slice(1);
                        extra[n - 1] = value;
                        onUpdate({ extraTexts: extra });
                      }
                    }}
                    label={step.label}
                    pageName={pageName}
                    action={action}
                    rows={2}
                  />
                </div>
              ))}
            </div>
          ) : (
            <DescriptionField
              id={`area-desc-${step.id}`}
              value={step.text}
              onChange={(text) => onUpdate({ text })}
              label={step.label}
              pageName={pageName}
              action={action}
              rows={2}
              grow
            />
          )}
        </>
      )}

      {/* Voice recording / upload — switched off for now.
      <AudioRecorderPanel
        key={step.id}
        step={step}
        compact
        onSave={(audioId) => onUpdate({ audioId })}
        onDelete={() => onUpdate({ audioId: null })}
        onTranscribed={(text) => onUpdate({ text, audioId: null })}
      />
      */}
    </div>
  );
}
