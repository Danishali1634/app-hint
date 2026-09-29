/**
 * @file Drawn "screenshots" of THIS editor, used by the in-editor tutorials
 * (src/examples/editorTutorials.js). Same idea as mockScreens.js: SVG in
 * code, 1280×800, every element a tutorial points at is exported as a BOX so
 * the highlight lands exactly on it.
 *
 * KEEP IN STEP WITH THE REAL EDITOR: header (title · Saved · progress · Help ·
 * Save · ⋯), screens list on the left, blue bar (Screen › Step · next thing
 * to do · ⋯), the screenshot, and the steps panel. Buttons appear only when the
 * real editor shows them (Save / Add feature / Add screen once a box exists).
 *
 * Text is drawn large on purpose: the player shows the whole screen small and
 * then zooms in, so small text would be unreadable. The SVG's pixel size is
 * 2× its viewBox so browsers rasterise it sharp when zoomed.
 */

import { SCREEN_W, SCREEN_H } from './mockScreens';

const FONT = 'font-family="Inter, Arial, sans-serif"';
const BLUE = '#1570ef';
const INK = '#0b0b0f';
const SOFT = '#4a5061';
const FAINT = '#7f8594';
const LINE = '#d8dce3';
const PAPER = '#eceef2';
const PANEL = '#f7f8fa';
const TEAL = '#0e9f6e';
const NAVY = '#1f2a44';

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function text(x, y, value, { size = 16, weight = 400, color = INK, anchor = 'start' } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" ${FONT} font-size="${size}" font-weight="${weight}" fill="${color}">${esc(value)}</text>`;
}
function rect({ x, y, w, h }, { fill = '#fff', stroke = LINE, r = 10, dash = false } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" ${dash ? 'stroke-dasharray="8 6" stroke-width="2"' : ''}/>`;
}
function button(box, label, { primary = true, size = 16 } = {}) {
  return `${rect(box, { fill: primary ? BLUE : '#fff', stroke: primary ? BLUE : LINE, r: 10 })}
${text(box.x + box.w / 2, box.y + box.h / 2 + size / 3 + 1, label, { size, weight: 600, color: primary ? '#fff' : SOFT, anchor: 'middle' })}`;
}
/** "⋯" */
function dots(cx, cy, color = SOFT) {
  return [-7, 0, 7]
    .map((d) => `<circle cx="${cx + d}" cy="${cy}" r="2.4" fill="${color}"/>`)
    .join('');
}

// ─── Boxes the tutorials point at ────────────────────────────────────────────

export const HELP_BUTTON = { x: 1000, y: 14, w: 96, h: 36 };
export const PREVIEW_BUTTON = { x: 1106, y: 14, w: 116, h: 36 };
export const MORE_BUTTON = { x: 1232, y: 14, w: 36, h: 36 };
export const UPLOAD_BUTTON = { x: 650, y: 470, w: 240, h: 52 };
export const RAIL_SCREEN_1 = { x: 16, y: 104, w: 240, h: 64 };
export const RAIL_ADD_SCREEN = { x: 16, y: 732, w: 240, h: 48 };
export const TOOLBAR = { x: 272, y: 72, w: 640, h: 48 };
export const SHOT_MENU_BUTTON = { x: 872, y: 79, w: 34, h: 34 };
export const SHOT_MENU = { x: 592, y: 120, w: 314, h: 176 };
/** The "Add a screenshot after a change" row inside the open menu. */
export const SHOT_MENU_ADD = { x: 598, y: 168, w: 302, h: 38 };
export const CANVAS = { x: 272, y: 132, w: 640, h: 648 };
export const PANEL_BOX = { x: 928, y: 72, w: 336, h: 708 };
export const ADD_STEP_BUTTON = { x: 1112, y: 730, w: 140, h: 40 };
export const SCREENS_STRIP = { x: 272, y: 130, w: 260, h: 44 };

const CANVAS_TOP_WITH_STRIP = 182;

/** Where the fake app's "New order" button sits for a canvas starting at `top`. */
export const fakeButtonBox = (top = CANVAS.y) => ({ x: 720, y: top + 66, w: 164, h: 44 });

/** Boxes inside the open step card (depends on how many cards come before it). */
export function cardBoxes(cardTop) {
  return {
    hint: { x: 944, y: cardTop + 50, w: 304, h: 186 },
    highlight: { x: 944, y: cardTop + 50, w: 304, h: 36 },
    actions: { x: 944, y: cardTop + 122, w: 240, h: 38 },
    description: { x: 944, y: cardTop + 172, w: 304, h: 86 },
    listen: { x: 944, y: cardTop + 266, w: 100, h: 32 },
  };
}
export const CARD_TOP_FIRST = 126;
export const CARD_TOP_SECOND = 184;

// ─── Pieces ──────────────────────────────────────────────────────────────────

function header({ ready, total }) {
  let out = `<rect width="${SCREEN_W}" height="64" fill="${PANEL}"/>
<line x1="0" y1="64" x2="${SCREEN_W}" y2="64" stroke="${LINE}"/>
${text(22, 40, '←', { size: 22, color: SOFT })}
${text(56, 40, 'My first course', { size: 20, weight: 700 })}
${text(236, 39, '✓ Saved', { size: 15, weight: 600, color: FAINT })}`;
  if (total > 0) {
    out += `<rect x="780" y="29" width="64" height="7" rx="3.5" fill="${LINE}"/>
<rect x="780" y="29" width="${(64 * ready) / total}" height="7" rx="3.5" fill="${TEAL}"/>
${text(854, 38, `${ready} of ${total} ready`, { size: 15, weight: 600, color: SOFT })}`;
  }
  out += `${rect(HELP_BUTTON, { r: 10 })}
${text(HELP_BUTTON.x + HELP_BUTTON.w / 2, HELP_BUTTON.y + 24, '?  Help', { size: 15, weight: 600, color: SOFT, anchor: 'middle' })}`;
  if (ready > 0) out += button(PREVIEW_BUTTON, '✓  Save', { size: 15 });
  out += `${rect(MORE_BUTTON, { r: 10 })}${dots(MORE_BUTTON.x + 18, MORE_BUTTON.y + 18)}`;
  return out;
}

function rail({ steps, anyBox }) {
  let out = `${text(20, 94, 'SCREENS', { size: 14, weight: 700, color: FAINT })}
${rect(RAIL_SCREEN_1, { fill: '#fff', stroke: LINE, r: 12 })}
<rect x="28" y="118" width="36" height="36" rx="8" fill="${INK}"/>
${text(46, 142, '1', { size: 17, weight: 700, color: '#fff', anchor: 'middle' })}
${text(76, 133, 'Screen 1', { size: 17, weight: 700 })}
${text(76, 156, steps === 1 ? '1 feature' : `${steps} features`, { size: 14, color: FAINT })}`;
  if (anyBox) {
    out += `${rect(RAIL_ADD_SCREEN, { fill: 'none', dash: true, r: 12 })}
${text(136, 762, '+  Add screen', { size: 16, weight: 600, color: SOFT, anchor: 'middle' })}`;
  }
  return out;
}

function toolbar({ hint, done }) {
  return `${rect(TOOLBAR, { fill: '#fff', stroke: LINE, r: 12 })}
${text(288, 102, 'Screen 1  ›', { size: 14, weight: 600, color: FAINT })}
${text(376, 102, `${done ? '✓ ' : ''}${hint}`, { size: 16, weight: done ? 500 : 600, color: done ? TEAL : INK })}
${rect(SHOT_MENU_BUTTON, { r: 8 })}${dots(SHOT_MENU_BUTTON.x + 17, SHOT_MENU_BUTTON.y + 17)}`;
}

function shotMenu() {
  const items = [
    'Replace this screenshot',
    'Add a screenshot after a change',
    'Reuse a screenshot',
    'Delete Screen 1',
  ];
  return `<rect x="${SHOT_MENU.x}" y="${SHOT_MENU.y}" width="${SHOT_MENU.w}" height="${SHOT_MENU.h}" rx="12" fill="#fff" stroke="${LINE}"/>
<rect x="${SHOT_MENU_ADD.x}" y="${SHOT_MENU_ADD.y}" width="${SHOT_MENU_ADD.w}" height="${SHOT_MENU_ADD.h}" rx="8" fill="${BLUE}" fill-opacity="0.08"/>
${items
  .map((item, n) =>
    text(SHOT_MENU.x + 18, SHOT_MENU.y + 34 + n * 40, item, {
      size: 16,
      weight: n === 1 ? 700 : 500,
      color: n === 3 ? '#e5484d' : n === 1 ? BLUE : INK,
    }),
  )
  .join('')}`;
}

function strip() {
  return `${text(276, 160, 'Screenshots', { size: 14, weight: 700, color: FAINT })}
<rect x="380" y="134" width="68" height="40" rx="6" fill="#fff" stroke="${BLUE}" stroke-width="2"/>
<rect x="382" y="136" width="64" height="8" fill="${NAVY}"/>
<rect x="456" y="134" width="68" height="40" rx="6" fill="#fff" stroke="${LINE}"/>
<rect x="458" y="136" width="64" height="8" fill="${NAVY}"/>
<rect x="486" y="152" width="30" height="16" rx="3" fill="${TEAL}"/>`;
}

/** The screenshot being edited: a small made-up app page. */
function canvas(top, { box, second }) {
  const c = { x: CANVAS.x, y: top, w: CANVAS.w, h: 780 - top };
  const btn = fakeButtonBox(top);
  let out = `${rect(c, { fill: PAPER, r: 14 })}
<rect x="290" y="${top + 16}" width="604" height="${c.h - 32}" rx="6" fill="#fff" stroke="${LINE}"/>
<rect x="290" y="${top + 16}" width="604" height="34" rx="6" fill="${NAVY}"/>
${text(308, top + 39, 'Sales app', { size: 15, weight: 700, color: '#fff' })}
${text(308, top + 97, 'Orders', { size: 24, weight: 700 })}
<rect x="${btn.x}" y="${btn.y}" width="${btn.w}" height="${btn.h}" rx="8" fill="#0f766e"/>
${text(btn.x + btn.w / 2, btn.y + 29, '+ New order', { size: 17, weight: 600, color: '#fff', anchor: 'middle' })}`;
  for (let r = 0; r < 9; r++) {
    const y = top + 134 + r * 48;
    if (y + 40 > top + c.h - 26) break;
    out += `<rect x="308" y="${y}" width="568" height="40" rx="4" fill="${r === 0 ? '#f1f4f9' : '#fff'}" stroke="#e3e7ef"/>
<rect x="322" y="${y + 14}" width="${90 + ((r * 37) % 60)}" height="12" rx="3" fill="#cfd5e2"/>
<rect x="530" y="${y + 14}" width="96" height="12" rx="3" fill="#e3e7ef"/>
<rect x="712" y="${y + 14}" width="64" height="12" rx="3" fill="#e3e7ef"/>`;
  }
  if (box) {
    out += `<rect x="${btn.x - 8}" y="${btn.y - 8}" width="${btn.w + 16}" height="${btn.h + 16}" rx="10" fill="${BLUE}" fill-opacity="0.12" stroke="${BLUE}" stroke-width="3"/>
<circle cx="${btn.x - 8}" cy="${btn.y - 8}" r="12" fill="${BLUE}"/>
${text(btn.x - 8, btn.y - 3, '1', { size: 14, weight: 700, color: '#fff', anchor: 'middle' })}`;
  }
  if (second) {
    const y = top + 134;
    out += `<rect x="300" y="${y - 6}" width="584" height="52" rx="8" fill="${BLUE}" fill-opacity="0.12" stroke="${BLUE}" stroke-width="3"/>
<circle cx="300" cy="${y - 6}" r="12" fill="${BLUE}"/>
${text(300, y - 1, '2', { size: 14, weight: 700, color: '#fff', anchor: 'middle' })}`;
  }
  return out;
}

function openCard(top, number, { box, description }) {
  const b = cardBoxes(top);
  let out = `${rect({ x: 936, y: top, w: 320, h: box ? 316 : 250 }, { fill: '#fff', stroke: '#9cc0f7', r: 12 })}
<circle cx="962" cy="${top + 26}" r="13" fill="${BLUE}"/>
${text(962, top + 31, String(number), { size: 14, weight: 700, color: '#fff', anchor: 'middle' })}
${text(986, top + 32, `Feature ${number}`, { size: 17, weight: 700 })}`;
  if (!box) {
    // Before the first box: only the hint
    const cx = 1096;
    return `${out}
<rect x="${cx - 80}" y="${top + 58}" width="160" height="100" rx="10" fill="${PAPER}" stroke="${LINE}"/>
<rect x="${cx - 36}" y="${top + 94}" width="72" height="26" rx="5" fill="#0f766e"/>
<rect x="${cx - 44}" y="${top + 86}" width="88" height="42" rx="6" fill="none" stroke="${BLUE}" stroke-width="2.5" stroke-dasharray="6 4"/>
${text(cx, top + 192, 'Drag a box on the screenshot', { size: 17, weight: 700, anchor: 'middle' })}
${text(cx, top + 218, 'over what the viewer should click', { size: 15, color: SOFT, anchor: 'middle' })}`;
  }
  out += `${rect(b.highlight, { fill: '#eef1f5', stroke: '#eef1f5', r: 8 })}
${text(b.highlight.x + 12, b.highlight.y + 24, '✓  Highlight 1', { size: 15, weight: 600, color: SOFT })}
${text(944, b.highlight.y + 60, '+ Add highlight', { size: 14, weight: 600, color: BLUE })}
<rect x="${b.actions.x}" y="${b.actions.y + 3}" width="74" height="32" rx="8" fill="${BLUE}" fill-opacity="0.1" stroke="${BLUE}" stroke-opacity="0.6"/>
${text(b.actions.x + 37, b.actions.y + 25, 'Click', { size: 15, weight: 600, color: BLUE, anchor: 'middle' })}
${rect({ x: b.actions.x + 82, y: b.actions.y + 3, w: 72, h: 32 }, { r: 8 })}
${text(b.actions.x + 118, b.actions.y + 25, 'Look', { size: 15, weight: 500, color: SOFT, anchor: 'middle' })}
${rect({ x: b.actions.x + 162, y: b.actions.y + 3, w: 72, h: 32 }, { r: 8 })}
${text(b.actions.x + 198, b.actions.y + 25, 'Type', { size: 15, weight: 500, color: SOFT, anchor: 'middle' })}
${rect(b.description, { fill: '#eef1f5', r: 10 })}`;
  out += description
    ? `${text(b.description.x + 14, b.description.y + 30, description[0], { size: 16 })}
${text(b.description.x + 14, b.description.y + 54, description[1] || '', { size: 16 })}`
    : text(b.description.x + 14, b.description.y + 30, 'What should the viewer do here?', {
        size: 16,
        color: FAINT,
      });
  out += text(b.listen.x + 8, b.listen.y + 22, '🔊 Listen', {
    size: 15,
    weight: 600,
    color: '#0891b2',
  });
  return out;
}

function doneCard() {
  return `${rect({ x: 936, y: 126, w: 320, h: 48 }, { r: 12 })}
<circle cx="962" cy="150" r="12" fill="#fff" stroke="${LINE}"/>
${text(962, 155, '✓', { size: 13, weight: 700, color: FAINT, anchor: 'middle' })}
${text(986, 156, 'Feature 1', { size: 16, weight: 700 })}
${text(1046, 156, '· Click New order', { size: 15, color: SOFT })}`;
}

function panel({ steps, box, description, secondBox }) {
  const activeHasBox = steps === 1 ? box : secondBox;
  let out = `${rect(PANEL_BOX, { fill: PANEL, r: 16 })}
${text(944, 104, 'FEATURES ON THIS SCREEN', { size: 14, weight: 700, color: FAINT })}
${text(1248, 104, `${steps} of ${steps}`, { size: 14, weight: 700, color: BLUE, anchor: 'end' })}
<line x1="928" y1="116" x2="1264" y2="116" stroke="${LINE}"/>`;
  if (steps === 1) out += openCard(CARD_TOP_FIRST, 1, { box, description });
  else out += doneCard() + openCard(CARD_TOP_SECOND, 2, { box: secondBox, description: null });
  if (steps > 1 || activeHasBox)
    out += `<line x1="928" y1="718" x2="1264" y2="718" stroke="${LINE}"/>`;
  if (steps > 1) out += text(944, 756, '‹ Previous', { size: 16, weight: 500, color: FAINT });
  if (activeHasBox) out += button(ADD_STEP_BUTTON, '+  Add feature', { primary: false });
  return out;
}

// ─── The screen ──────────────────────────────────────────────────────────────

/**
 * @param {{
 *   stage: 'upload' | 'edit',
 *   steps?: 1 | 2,
 *   box?: boolean,            // step 1's highlight drawn
 *   secondBox?: boolean,      // step 2's highlight drawn
 *   description?: string[],   // step 1's text, up to two lines
 *   hint?: string,
 *   done?: boolean,           // the hint is a "✓ ready" message
 *   showStrip?: boolean,
 *   showMenu?: boolean,       // the screenshot "⋯" menu is open
 * }} state
 */
export function editorScreen({
  stage,
  steps = 1,
  box = false,
  secondBox = false,
  description = null,
  hint = '',
  done = false,
  showStrip = false,
  showMenu = false,
}) {
  const ready = stage === 'edit' ? (box ? 1 : 0) + (steps === 2 && secondBox ? 1 : 0) : 0;
  let body = header({ ready, total: steps });
  if (stage === 'upload') {
    body += rail({ steps: 1, anyBox: false });
    body += `${rect({ x: 272, y: 76, w: 992, h: 704 }, { fill: 'none', dash: true, r: 16 })}
<rect x="700" y="270" width="140" height="88" rx="10" fill="#fff" stroke="${LINE}"/>
<rect x="700" y="270" width="140" height="18" rx="6" fill="${NAVY}"/>
<rect x="690" y="260" width="160" height="108" rx="12" fill="none" stroke="${BLUE}" stroke-width="2" stroke-dasharray="6 5"/>
${text(770, 414, 'Drop a screenshot here', { size: 20, weight: 700, anchor: 'middle' })}
${text(770, 444, 'or paste it with Ctrl/⌘ + V', { size: 16, color: SOFT, anchor: 'middle' })}
${button(UPLOAD_BUTTON, 'Upload screenshot', { size: 17 })}`;
  } else {
    body += rail({ steps, anyBox: box });
    body += toolbar({ hint, done });
    if (showStrip) body += strip();
    body += canvas(showStrip ? CANVAS_TOP_WITH_STRIP : CANVAS.y, { box, second: secondBox });
    body += panel({ steps, box, description, secondBox });
    if (showMenu) body += shotMenu();
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCREEN_W} ${SCREEN_H}" width="${SCREEN_W * 2}" height="${SCREEN_H * 2}">
<rect width="${SCREEN_W}" height="${SCREEN_H}" fill="${PAPER}"/>
${body}
</svg>`;
}
