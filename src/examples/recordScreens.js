/**
 * @file Drawn "screenshots" of the RECORD flow (#/new?mode=video → #/video/:id),
 * for the recording tutorials in editorTutorials.js. Same approach as
 * editorScreens.js: SVG in code, 1280×800, every element a tutorial points at
 * is exported as a BOX. Large text on purpose (the player zooms in).
 *
 * KEEP IN STEP WITH THE REAL PAGES: pages/VideoTour/GetVideo.js (record card,
 * compact recording card, floating Stop pill) and VideoTourPage.js (status
 * line with ①–④, video + "+ Add step here", step panel with "+ Next step on
 * this picture" / "Done, back to video", steps grouped per picture, "Save
 * walkthrough"), plus the watch page that opens after Save.
 */

import { SCREEN_W, SCREEN_H } from './mockScreens';

const FONT = 'font-family="Inter, Arial, sans-serif"';
const BLUE = '#1570ef';
const BLUE_SOFT = '#eaf3ff';
const INK = '#0f172a';
const SOFT = '#3d4859';
const FAINT = '#7b8698';
const LINE = '#e3e8f0';
const PAPER = '#f6f8fc';
const TEAL = '#0e9f6e';
const NAVY = '#1f2a44';
const RED = '#e5484d';

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function text(x, y, value, { size = 16, weight = 400, color = INK, anchor = 'start' } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" ${FONT} font-size="${size}" font-weight="${weight}" fill="${color}">${esc(value)}</text>`;
}
function rect({ x, y, w, h }, { fill = '#fff', stroke = LINE, r = 10, dash = false } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" ${dash ? 'stroke-dasharray="8 6" stroke-width="2"' : ''}/>`;
}
function button(box, label, { primary = true, size = 16, color = BLUE, dim = false } = {}) {
  const fill = primary ? color : '#fff';
  return `<g opacity="${dim ? 0.45 : 1}">${rect(box, { fill, stroke: primary ? fill : LINE, r: 10 })}
${text(box.x + box.w / 2, box.y + box.h / 2 + size / 3 + 1, label, { size, weight: 600, color: primary ? '#fff' : SOFT, anchor: 'middle' })}</g>`;
}
const svg = (
  body,
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCREEN_W} ${SCREEN_H}" width="${SCREEN_W * 2}" height="${SCREEN_H * 2}">
<rect width="${SCREEN_W}" height="${SCREEN_H}" fill="${PAPER}"/>
${body}
</svg>`;

/** The top bar every page shares. */
function topBar(title) {
  return `<rect width="${SCREEN_W}" height="60" fill="#fff"/>
<line x1="0" y1="60" x2="${SCREEN_W}" y2="60" stroke="${LINE}"/>
${text(24, 38, title, { size: 20, weight: 700 })}`;
}

/** The made-up app being recorded (inside a frame at x, y, w, h). */
function fakeApp({ x, y, w, h }, { box = false, secondBox = false } = {}) {
  const btn = fakeButton({ x, y, w, h });
  const menu = fakeMenuItem({ x, y, w, h });
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#fff" stroke="${LINE}"/>
<rect x="${x}" y="${y}" width="${w}" height="44" rx="8" fill="${NAVY}"/>
${text(x + 20, y + 29, 'Sales app', { size: 17, weight: 700, color: '#fff' })}
<rect x="${menu.x}" y="${menu.y}" width="${menu.w}" height="${menu.h}" rx="6" fill="#e8efff"/>
${text(menu.x + 14, menu.y + 25, 'Orders', { size: 16, weight: 600, color: BLUE })}
${text(x + 190, y + 104, 'Orders', { size: 26, weight: 700 })}
<rect x="${btn.x}" y="${btn.y}" width="${btn.w}" height="${btn.h}" rx="8" fill="#0f766e"/>
${text(btn.x + btn.w / 2, btn.y + 29, '+ New order', { size: 17, weight: 600, color: '#fff', anchor: 'middle' })}`;
  for (let r = 0; r < 6; r++) {
    const ry = y + 140 + r * 50;
    if (ry + 40 > y + h - 16) break;
    out += `<rect x="${x + 190}" y="${ry}" width="${w - 214}" height="40" rx="4" fill="#fff" stroke="#e3e7ef"/>
<rect x="${x + 206}" y="${ry + 14}" width="${100 + ((r * 37) % 60)}" height="12" rx="3" fill="#cfd5e2"/>
<rect x="${x + 420}" y="${ry + 14}" width="90" height="12" rx="3" fill="#e3e7ef"/>`;
  }
  if (box) out += hl(menu, 1);
  if (secondBox) out += hl(btn, 2);
  return out;
}
function hl(b, n) {
  return `<rect x="${b.x - 7}" y="${b.y - 7}" width="${b.w + 14}" height="${b.h + 14}" rx="9" fill="${BLUE}" fill-opacity="0.12" stroke="${BLUE}" stroke-width="3"/>
<circle cx="${b.x - 7}" cy="${b.y - 7}" r="12" fill="${BLUE}"/>
${text(b.x - 7, b.y - 2, String(n), { size: 14, weight: 700, color: '#fff', anchor: 'middle' })}`;
}
const fakeButton = ({ x, y, w }) => ({ x: x + w - 200, y: y + 74, w: 170, h: 44 });
const fakeMenuItem = ({ x, y }) => ({ x: x + 16, y: y + 64, w: 150, h: 38 });

// ─── Boxes the tutorials point at ────────────────────────────────────────────

export const RECORD_BUTTON = { x: 530, y: 560, w: 220, h: 56 };
export const RECORD_STEPS = { x: 352, y: 390, w: 576, h: 120 };
export const PILL = { x: 980, y: 700, w: 260, h: 64 };
export const PILL_STOP = { x: 1146, y: 712, w: 82, h: 40 };
export const STATUS_LINE = { x: 16, y: 76, w: 940, h: 48 };
export const ADD_HERE = { x: 396, y: 690, w: 200, h: 50 };
const FRAME = { x: 16, y: 136, w: 940, h: 590 };
export const FRAME_MENU = fakeMenuItem(FRAME);
/** The recorded app fills the screen while recording; its "New order" button. */
const REC_APP = { x: 40, y: 40, w: 1200, h: 720 };
export const REC_NEW_ORDER = fakeButton(REC_APP);
export const FRAME_NEW_ORDER = fakeButton(FRAME);
export const PANEL = { x: 972, y: 76, w: 292, h: 708 };
export const ACTIONS = { x: 986, y: 130, w: 240, h: 38 };
export const DESCRIPTION = { x: 986, y: 184, w: 264, h: 96 };
export const NEXT_ON_PICTURE = { x: 986, y: 300, w: 264, h: 46 };
export const BACK_TO_VIDEO = { x: 986, y: 356, w: 264, h: 40 };
export const SAVE_BUTTON = { x: 1060, y: 12, w: 200, h: 38 };
export const STEP_LIST = { x: 980, y: 116, w: 276, h: 196 };
export const WATCH_BUTTON = { x: 590, y: 360, w: 100, h: 100 };

// ─── Pieces ──────────────────────────────────────────────────────────────────

/** ①–④ pill + the one next action. */
function statusLine(stage, message) {
  let out = rect(STATUS_LINE, { fill: BLUE_SOFT, stroke: '#bcd0fb', r: 12 });
  for (let n = 1; n <= 4; n++) {
    const cx = 44 + (n - 1) * 30;
    const done = n < stage;
    const current = n === stage;
    out += `<circle cx="${cx}" cy="100" r="11" fill="${done ? TEAL : current ? BLUE : '#fff'}" stroke="${done || current ? 'none' : LINE}"/>
${text(cx, 105, done ? '✓' : String(n), { size: 12, weight: 700, color: done || current ? '#fff' : FAINT, anchor: 'middle' })}`;
  }
  return out + text(170, 106, message, { size: 17, weight: 600 });
}

function builderTop({ canSave }) {
  return `${topBar('My first course')}
${text(900, 37, '?', { size: 18, weight: 700, color: FAINT, anchor: 'middle' })}
${text(990, 37, '↻ Replace video', { size: 15, weight: 600, color: SOFT, anchor: 'middle' })}
${button(SAVE_BUTTON, '💾  Save walkthrough', { size: 15, dim: !canSave })}`;
}

function videoControls() {
  return `<circle cx="40" cy="760" r="18" fill="${BLUE}"/>
<path d="M35 751 L48 760 L35 769 Z" fill="#fff"/>
<rect x="72" y="757" width="820" height="6" rx="3" fill="${LINE}"/>
<rect x="72" y="757" width="300" height="6" rx="3" fill="${BLUE}"/>
<circle cx="372" cy="760" r="8" fill="${BLUE}"/>
${text(944, 766, '0:04 / 0:12', { size: 14, color: SOFT, anchor: 'end' })}`;
}

function stepList(steps) {
  let out = `${rect(PANEL, { r: 16 })}
${text(986, 104, 'STEPS', { size: 14, weight: 700, color: FAINT })}`;
  if (!steps) {
    return `${out}${text(1118, 420, 'No features yet. Pause the video', { size: 15, color: SOFT, anchor: 'middle' })}
${text(1118, 444, 'and press Add feature here.', { size: 15, color: SOFT, anchor: 'middle' })}`;
  }
  out += `${rect(STEP_LIST, { fill: '#fff', r: 12 })}
${text(994, 140, 'Picture at 0:04 · 2 features', { size: 13, weight: 600, color: FAINT })}`;
  ['Open Orders', 'Click New order'].forEach((label, n) => {
    const y = 154 + n * 72;
    out += `<rect x="990" y="${y}" width="256" height="62" rx="10" fill="#fff" stroke="${LINE}"/>
<rect x="1000" y="${y + 10}" width="64" height="42" rx="5" fill="${PAPER}" stroke="${LINE}"/>
<rect x="1000" y="${y + 10}" width="64" height="8" fill="${NAVY}"/>
${text(1076, y + 28, `Feature ${n + 1}`, { size: 15, weight: 700 })}
${text(1140, y + 28, '0:04', { size: 13, color: FAINT })}
${text(1076, y + 48, label, { size: 14, color: SOFT })}`;
  });
  return out;
}

function stepPanel({ number, text: words }) {
  return `${rect(PANEL, { r: 16 })}
${text(986, 110, `Feature ${number} · 0:04`, { size: 16, weight: 700 })}
${rect(ACTIONS, { r: 8 })}
<rect x="${ACTIONS.x + 3}" y="${ACTIONS.y + 3}" width="78" height="32" rx="6" fill="${BLUE}"/>
${text(ACTIONS.x + 42, ACTIONS.y + 25, 'Click', { size: 15, weight: 600, color: '#fff', anchor: 'middle' })}
${text(ACTIONS.x + 122, ACTIONS.y + 25, 'Look', { size: 15, weight: 600, color: SOFT, anchor: 'middle' })}
${text(ACTIONS.x + 200, ACTIONS.y + 25, 'Type', { size: 15, weight: 600, color: SOFT, anchor: 'middle' })}
${rect(DESCRIPTION, { fill: '#eef1f5', r: 10 })}
${
  words
    ? text(DESCRIPTION.x + 14, DESCRIPTION.y + 32, words, { size: 16 })
    : text(DESCRIPTION.x + 14, DESCRIPTION.y + 32, 'What should the viewer do?', {
        size: 16,
        color: FAINT,
      })
}
${button(NEXT_ON_PICTURE, '+  Next feature on this picture', { size: 15, dim: !words })}
${button(BACK_TO_VIDEO, '✓  Done, back to video', { primary: false, size: 15 })}`;
}

// ─── The screens ─────────────────────────────────────────────────────────────

/** #/video/:id before a video exists: the record card. */
export function recordStartScreen() {
  const card = { x: 330, y: 150, w: 620, h: 520 };
  const steps = [
    ['Pick what to record', 'a tab, a window or your screen'],
    ['Do the task', 'switch tabs freely'],
    ['Press Stop', 'your video opens here'],
  ];
  let body = `${topBar('My first course')}
${rect(card, { r: 24 })}
<rect x="608" y="190" width="64" height="64" rx="16" fill="${BLUE_SOFT}"/>
<rect x="622" y="206" width="36" height="26" rx="4" fill="none" stroke="${BLUE}" stroke-width="3"/>
${text(640, 320, 'Record your screen', { size: 30, weight: 700, anchor: 'middle' })}`;
  steps.forEach(([what, detail], n) => {
    const x = 352 + n * 196;
    body += `<rect x="${x}" y="390" width="184" height="120" rx="14" fill="${PAPER}"/>
<circle cx="${x + 26}" cy="420" r="13" fill="${BLUE}"/>
${text(x + 26, 425, String(n + 1), { size: 14, weight: 700, color: '#fff', anchor: 'middle' })}
${text(x + 48, 426, what, { size: 15, weight: 700 })}
${text(x + 20, 466, detail, { size: 14, color: SOFT })}`;
  });
  body += `${button(RECORD_BUTTON, '●  Start recording', { size: 19 })}
${text(640, 646, '⤒ or upload a video', { size: 15, weight: 600, color: BLUE, anchor: 'middle' })}`;
  return svg(body);
}

/** While recording: the user is in their own app; the small Stop pill floats on top. */
export function recordingScreen() {
  const app = REC_APP;
  return svg(`<rect width="${SCREEN_W}" height="${SCREEN_H}" fill="#dfe5ee"/>
${fakeApp(app)}
<rect x="${PILL.x}" y="${PILL.y}" width="${PILL.w}" height="${PILL.h}" rx="32" fill="#1c1c1f"/>
<circle cx="${PILL.x + 30}" cy="${PILL.y + 32}" r="8" fill="${RED}"/>
${text(PILL.x + 50, PILL.y + 39, '0:07', { size: 20, weight: 700, color: '#fff' })}
<rect x="${PILL_STOP.x}" y="${PILL_STOP.y}" width="${PILL_STOP.w}" height="${PILL_STOP.h}" rx="20" fill="${RED}"/>
${text(PILL_STOP.x + PILL_STOP.w / 2, PILL_STOP.y + 26, '■ Stop', { size: 16, weight: 700, color: '#fff', anchor: 'middle' })}`);
}

/**
 * The step builder.
 *   paused  — on the video, "+ Add step here" waiting
 *   drawing — step 1 on its picture, no box yet
 *   boxed   — step 1 has its box and text: "+ Next step on this picture"
 *   second  — step 2 on the same picture (step 1's box faint), no box yet
 *   list    — back on the video, both steps listed, Save ready
 * @param {'paused' | 'drawing' | 'boxed' | 'second' | 'list'} state
 */
export function builderScreen(state) {
  const onVideo = state === 'paused' || state === 'list';
  const canSave = state === 'list';
  let body = builderTop({ canSave });
  const messages = {
    paused: [2, '② Press + Add feature here'],
    drawing: [3, '③ Drag a box over what the viewer should click'],
    boxed: [4, 'Add the next feature on this picture, or go back to the video'],
    second: [3, '③ Drag a box over what the viewer should click'],
    list: [4, "Add more features, or press Save walkthrough when you're done"],
  };
  const [stage, message] = messages[state];
  body += statusLine(stage, message);
  if (onVideo) {
    body += `<rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" rx="14" fill="#000"/>
${fakeApp({ x: FRAME.x + 20, y: FRAME.y + 20, w: FRAME.w - 40, h: FRAME.h - 40 })}
${videoControls()}`;
    if (state === 'paused') {
      body += `<rect x="${ADD_HERE.x - 6}" y="${ADD_HERE.y - 6}" width="${ADD_HERE.w + 12}" height="${ADD_HERE.h + 12}" rx="16" fill="none" stroke="#fff" stroke-width="3"/>
${button(ADD_HERE, '+  Add feature here', { size: 18 })}`;
    }
    body += stepList(state === 'list' ? true : null);
  } else {
    body += `${rect(FRAME, { fill: '#edf1f7', r: 14 })}
${fakeApp(FRAME, { box: state === 'boxed' })}`;
    // Step 1's box, faint, while step 2 is drawn on the same picture
    if (state === 'second')
      body += `<rect x="${FRAME_MENU.x - 7}" y="${FRAME_MENU.y - 7}" width="${FRAME_MENU.w + 14}" height="${FRAME_MENU.h + 14}" rx="9" fill="none" stroke="#9aa3b2" stroke-width="2.5" stroke-dasharray="6 4"/>`;
    body += stepPanel({
      number: state === 'second' ? 2 : 1,
      text: state === 'boxed' ? 'Open the Orders page.' : '',
    });
  }
  return svg(body);
}

/** The watch page that opens right after Save: the finished walkthrough, ready to play. */
export function readyScreen() {
  const player = { x: 140, y: 150, w: 1000, h: 560 };
  return svg(`${topBar('My first course')}
${text(150, 118, '←  All courses', { size: 15, weight: 600, color: SOFT })}
${rect({ x: 1010, y: 92, w: 130, h: 40 }, { r: 10 })}
${text(1075, 118, '✎  Edit course', { size: 14, weight: 600, color: SOFT, anchor: 'middle' })}
${text(150, 140, '✓ Saved. Your walkthrough is ready.', { size: 14, weight: 600, color: TEAL })}
${rect(player, { fill: '#0b0b0f', stroke: '#0b0b0f', r: 20 })}
${fakeApp({ x: 240, y: 200, w: 800, h: 420 })}
<rect x="240" y="200" width="800" height="420" rx="8" fill="#000" opacity="0.35"/>
<circle cx="${WATCH_BUTTON.x + WATCH_BUTTON.w / 2}" cy="${WATCH_BUTTON.y + WATCH_BUTTON.h / 2}" r="48" fill="${BLUE}"/>
<path d="M${WATCH_BUTTON.x + WATCH_BUTTON.w / 2 - 14} ${WATCH_BUTTON.y + WATCH_BUTTON.h / 2 - 22} L${WATCH_BUTTON.x + WATCH_BUTTON.w / 2 + 22} ${WATCH_BUTTON.y + WATCH_BUTTON.h / 2} L${WATCH_BUTTON.x + WATCH_BUTTON.w / 2 - 14} ${WATCH_BUTTON.y + WATCH_BUTTON.h / 2 + 22} Z" fill="#fff"/>
<rect x="200" y="660" width="880" height="6" rx="3" fill="#2a2a2f"/>`);
}
