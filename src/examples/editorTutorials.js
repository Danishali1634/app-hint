/**
 * @file The app's own tutorials — one short lesson per action — played in the
 * real WalkthroughPlayer, exactly like the examples (src/examples). The screens
 * are drawings of this app (editorScreens.js for the screenshot editor,
 * recordScreens.js for recording), so each lesson shows the very button to
 * press, and every sentence says what to do now and what happens next.
 *
 * Two groups (TUTORIAL_GROUPS): "From screenshots" and "From a recording",
 * each with a "the whole thing" lesson first. Opened from the "Show me" links,
 * the coach's "Watch how", and the Help button.
 */

import { svgToDataUrl, toRegion } from './mockScreens';
import * as E from './editorScreens';
import * as R from './recordScreens';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

const urlCache = new Map();
function step(id, { screen, box, action = 'click', label, text, pad = 6 }) {
  if (!urlCache.has(screen)) urlCache.set(screen, svgToDataUrl(screen));
  return {
    id,
    label,
    text,
    action,
    region: box ? toRegion(box, pad) : null,
    audioData: null,
    imageData: urlCache.get(screen),
  };
}

// Screens shared by several steps (same image → the camera glides).
const upload = E.editorScreen({ stage: 'upload' });
const noBox = E.editorScreen({
  stage: 'edit',
  hint: 'Drag a box over what the viewer should click',
});
const withBox = E.editorScreen({
  stage: 'edit',
  box: true,
  hint: 'Highlighted. Now write what to do',
});
const described = E.editorScreen({
  stage: 'edit',
  box: true,
  description: ['Click New order to start', 'a new order.'],
  hint: 'Feature 1 is ready',
  done: true,
});
const twoSteps = E.editorScreen({
  stage: 'edit',
  steps: 2,
  box: true,
  hint: 'Drag a box over what the viewer should click',
});
const twoStepsBox = E.editorScreen({
  stage: 'edit',
  steps: 2,
  box: true,
  secondBox: true,
  hint: 'Highlighted. Now write what to do',
});
const menuOpen = E.editorScreen({
  stage: 'edit',
  box: true,
  description: ['Click New order to start', 'a new order.'],
  hint: 'Feature 1 is ready',
  done: true,
  showMenu: true,
});
const withStrip = E.editorScreen({
  stage: 'edit',
  box: true,
  description: ['Click New order to start', 'a new order.'],
  hint: 'Feature 1 is ready',
  done: true,
  showStrip: true,
});

const card1 = E.cardBoxes(E.CARD_TOP_FIRST);
const card2 = E.cardBoxes(E.CARD_TOP_SECOND);

/**
 * @typedef {Object} EditorTutorial
 * @property {string} id
 * @property {string} title
 * @property {string} summary
 * @property {WalkthroughStep[]} steps
 */

/** @type {Record<string, Omit<EditorTutorial, 'id'>>} */
const TUTORIALS = {
  screenshot: {
    title: 'Add a screenshot',
    summary: 'Every screen of your walkthrough starts with a screenshot.',
    steps: [
      step('ss-1', {
        screen: upload,
        box: E.UPLOAD_BUTTON,
        label: 'Add the screenshot',
        text: 'First, take a screenshot of the page in your app. Then drop it here, paste it with Control V, or press Upload screenshot.',
      }),
      step('ss-2', {
        screen: noBox,
        box: E.CANVAS,
        pad: 0,
        action: 'look',
        label: 'It appears here',
        text: 'Done. Your screenshot now fills the work area. Next, you mark what to click.',
      }),
    ],
  },
  highlight: {
    title: 'Highlight what to click',
    summary: 'Drag a box over the button or field the viewer should use.',
    steps: [
      step('hl-1', {
        screen: noBox,
        box: E.TOOLBAR,
        action: 'look',
        label: 'Follow the blue bar',
        text: 'Look at the blue bar. It always tells you the one thing to do now.',
      }),
      step('hl-2', {
        screen: withBox,
        box: E.fakeButtonBox(),
        pad: 14,
        action: 'look',
        label: 'Drag a box',
        text: 'Press and drag on the screenshot to draw a box over the button. Let go, and the box stays.',
      }),
      step('hl-3', {
        screen: withBox,
        box: card1.highlight,
        action: 'look',
        label: 'Redraw or remove',
        text: 'Made a mistake? Point at the highlight here. Use the arrow to draw it again, or the cross to remove it.',
      }),
    ],
  },
  action: {
    title: 'Click, look or type',
    summary: 'Tell the viewer what to do with the highlight.',
    steps: [
      step('ac-1', {
        screen: withBox,
        box: card1.actions,
        action: 'look',
        label: 'Pick what happens',
        text: 'Choose what the viewer does. Click shows a click. Look just points at it. Type shows typing.',
      }),
    ],
  },
  describe: {
    title: 'Write what to do',
    summary: 'A short sentence the AI voice reads out.',
    steps: [
      step('ds-1', {
        screen: described,
        box: card1.description,
        action: 'type',
        label: 'Write one sentence',
        text: 'Now write one short sentence, like: Click New order to start. The AI voice reads it out.',
      }),
      step('ds-2', {
        screen: described,
        box: card1.listen,
        label: 'Listen to it',
        text: 'Press Listen to hear exactly how it will sound.',
      }),
    ],
  },
  step: {
    title: 'Add the next feature',
    summary: 'Something else on the same screen? Add a feature.',
    steps: [
      step('st-1', {
        screen: described,
        box: E.ADD_STEP_BUTTON,
        label: 'Add a feature',
        text: 'Feature 1 is ready. To show the next thing on this screen, just draw another box, or press Add feature.',
      }),
      step('st-2', {
        screen: twoSteps,
        box: card2.hint,
        action: 'look',
        label: 'Feature 2 is ready',
        text: 'Every new box on this screen becomes the next feature by itself. Write its sentence, and keep going.',
      }),
      step('st-3', {
        screen: twoStepsBox,
        box: E.PANEL_BOX,
        pad: 0,
        action: 'look',
        label: 'All features of this screen',
        text: 'All features of this screen are listed here, in order. Click any one to change it.',
      }),
    ],
  },
  screen: {
    title: 'A new page or popup',
    summary: 'When the app shows something new, add a screen.',
    steps: [
      step('sc-1', {
        screen: described,
        box: E.RAIL_ADD_SCREEN,
        label: 'Add a screen',
        text: 'Did the app open a new page or a popup? Press Add screen, then add the screenshot of that new page.',
      }),
      step('sc-2', {
        screen: described,
        box: E.SHOT_MENU_BUTTON,
        label: 'Same screen, changed',
        text: 'Only a small part changed, like a table after Save? Open this menu instead.',
      }),
      step('sc-3', {
        screen: menuOpen,
        box: E.SHOT_MENU_ADD,
        label: 'Add the new screenshot',
        text: 'Choose Add a screenshot after a change, then pick the new screenshot.',
      }),
      step('sc-4', {
        screen: withStrip,
        box: E.SCREENS_STRIP,
        action: 'look',
        label: 'Pick the screenshot',
        text: 'Each feature can show its own screenshot. Pick the right one here.',
      }),
    ],
  },
  share: {
    title: 'Save it',
    summary: 'Finish, then watch it right away.',
    steps: [
      step('sh-1', {
        screen: described,
        box: E.PREVIEW_BUTTON,
        label: 'Save',
        text: 'Finished? Press Save. Your walkthrough is saved and opens right away, ready to watch.',
      }),
    ],
  },
};

// ─── From a recording ────────────────────────────────────────────────────────

const recStart = R.recordStartScreen();
const recording = R.recordingScreen();
const paused = R.builderScreen('paused');
const drawing = R.builderScreen('drawing');
const boxed = R.builderScreen('boxed');
const second = R.builderScreen('second');
const listed = R.builderScreen('list');
const ready = R.readyScreen();

/** @type {Record<string, Omit<EditorTutorial, 'id'>>} */
const RECORDING = {
  record: {
    title: 'Record your screen',
    summary: 'Press Start, do the task, press Stop.',
    steps: [
      step('rc-1', {
        screen: recStart,
        box: R.RECORD_STEPS,
        pad: 0,
        action: 'look',
        label: 'Three simple steps',
        text: 'Recording takes three steps: pick what to record, do the task, then press Stop.',
      }),
      step('rc-2', {
        screen: recStart,
        box: R.RECORD_BUTTON,
        label: 'Start recording',
        text: 'Press Start recording. Your browser asks what to share: pick the tab, window or screen of your app.',
      }),
      step('rc-3', {
        screen: recording,
        box: R.REC_NEW_ORDER,
        pad: 10,
        label: 'Do the task',
        text: 'Now simply use your app as usual. You can switch tabs; the recording goes with you.',
      }),
      step('rc-4', {
        screen: recording,
        box: R.PILL_STOP,
        label: 'Press Stop',
        text: 'Done? Press Stop on the small floating bar. Your video opens in Hint Studio by itself.',
      }),
    ],
  },
  'video-steps': {
    title: 'Turn a moment into a feature',
    summary: 'Pause, add a feature, draw a box, write one sentence.',
    steps: [
      step('vs-1', {
        screen: paused,
        box: R.STATUS_LINE,
        pad: 0,
        action: 'look',
        label: 'Follow the blue line',
        text: 'The blue line at the top always tells you the one thing to do now.',
      }),
      step('vs-2', {
        screen: paused,
        box: R.ADD_HERE,
        label: 'Add a feature here',
        text: 'Play the video and pause where something happens. Then press Add feature here. It takes a picture of that moment.',
      }),
      step('vs-3', {
        screen: drawing,
        box: R.FRAME_MENU,
        pad: 12,
        action: 'look',
        label: 'Draw a box',
        text: 'On the picture, press and drag to draw a box over what the viewer should click.',
      }),
      step('vs-4', {
        screen: boxed,
        box: R.DESCRIPTION,
        action: 'type',
        label: 'Write one sentence',
        text: 'Then write one short sentence: what should the viewer do here? The AI voice reads it out.',
      }),
    ],
  },
  'video-more': {
    title: 'More features on one picture',
    summary: 'Highlight several things without going back to the video.',
    steps: [
      step('vm-1', {
        screen: boxed,
        box: R.NEXT_ON_PICTURE,
        label: 'Next feature on this picture',
        text: 'Something else to click on the same picture? Just draw another box. It becomes the next feature by itself.',
      }),
      step('vm-2', {
        screen: second,
        box: R.FRAME_NEW_ORDER,
        pad: 12,
        action: 'look',
        label: 'Draw the next box',
        text: 'Feature 2 opens on the same picture. The first box is shown faintly, so draw the new one and write its sentence.',
      }),
      step('vm-3', {
        screen: boxed,
        box: R.BACK_TO_VIDEO,
        label: 'Back to the video',
        text: 'When this picture is done, press Done, back to video, and pause at the next moment.',
      }),
    ],
  },
  'video-save': {
    title: 'Save and watch it',
    summary: 'One save at the end, then watch your walkthrough.',
    steps: [
      step('sv-1', {
        screen: listed,
        box: R.STEP_LIST,
        pad: 0,
        action: 'look',
        label: 'Your features',
        text: 'All your features are listed here, grouped by picture. Click one to change it.',
      }),
      step('sv-2', {
        screen: listed,
        box: R.SAVE_BUTTON,
        label: 'Save once at the end',
        text: 'All done? Press Save walkthrough. You only save once, at the very end.',
      }),
      step('sv-3', {
        screen: ready,
        box: R.WATCH_BUTTON,
        label: 'Watch it',
        text: 'It is saved and opens right away. Press play to watch it the way your viewers will.',
      }),
    ],
  },
};

/** Lessons per way of making a course; the first entry of each is "the whole thing". */
const SCREENSHOT_ORDER = [
  'screenshot',
  'highlight',
  'action',
  'describe',
  'step',
  'screen',
  'share',
];
const RECORDING_ORDER = ['record', 'video-steps', 'video-more', 'video-save'];
/** Kept for callers that list the screenshot lessons. */
export const TUTORIAL_ORDER = SCREENSHOT_ORDER;

const ALL = { ...TUTORIALS, ...RECORDING };

/** @type {EditorTutorial} */
const START = {
  id: 'start',
  title: 'The whole thing in 1 minute',
  summary: 'From the first screenshot to the finished walkthrough.',
  steps: SCREENSHOT_ORDER.flatMap((key) => TUTORIALS[key].steps),
};
/** @type {EditorTutorial} */
const START_RECORDING = {
  id: 'start-recording',
  title: 'The whole thing in 1 minute',
  summary: 'From pressing Record to watching it.',
  steps: RECORDING_ORDER.flatMap((key) => RECORDING[key].steps),
};

/** @type {{ id: string, title: string, tutorials: EditorTutorial[] }[]} */
export const TUTORIAL_GROUPS = [
  {
    id: 'screenshots',
    title: 'From screenshots',
    tutorials: [START, ...SCREENSHOT_ORDER.map((id) => ({ id, ...TUTORIALS[id] }))],
  },
  {
    id: 'recording',
    title: 'From a recording',
    tutorials: [START_RECORDING, ...RECORDING_ORDER.map((id) => ({ id, ...RECORDING[id] }))],
  },
];

/** @returns {EditorTutorial} */
export function getEditorTutorial(id) {
  if (id === 'start-recording') return START_RECORDING;
  if (id && ALL[id]) return { id, ...ALL[id] };
  return START;
}

/** @returns {EditorTutorial[]} every lesson, group by group, in playing order. */
export function listEditorTutorials() {
  return TUTORIAL_GROUPS.flatMap((group) => group.tutorials);
}
