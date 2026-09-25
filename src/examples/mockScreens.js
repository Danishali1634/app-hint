/**
 * @file Drawn "screenshots" of a fictional ERP app, used by the example
 * walkthroughs (src/examples/index.js).
 *
 * WHY SVG IN CODE (not image files)
 *   - Crisp at any zoom (the player zooms up to 2.5×).
 *   - Tiny and versioned with the code; no assets to host.
 *   - The player only needs an image URL, and an SVG data URL is one.
 *
 * All screens use a 1280×800 coordinate space. Every clickable/lookable
 * element is exported as a BOX; the examples turn those boxes into regions
 * (toRegion), so the highlight always lands exactly on what was drawn.
 */

export const SCREEN_W = 1280;
export const SCREEN_H = 800;

const FONT = 'font-family="Inter, Arial, sans-serif"';
const NAVY = '#1f2a44';
const BLUE = '#2563eb';
const LINE = '#e3e7ef';
const GREEN = '#0e9f6e';

/** Screen-space box → region in % (what Step.region expects). */
export function toRegion({ x, y, w, h }, pad = 0) {
  return {
    x: ((x - pad) / SCREEN_W) * 100,
    y: ((y - pad) / SCREEN_H) * 100,
    w: ((w + pad * 2) / SCREEN_W) * 100,
    h: ((h + pad * 2) / SCREEN_H) * 100,
  };
}

/** SVG markup → data URL usable as <img src> / WalkthroughStep.imageData. */
export function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ─── Building blocks ─────────────────────────────────────────────────────────

function text(x, y, value, { size = 15, weight = 400, color = '#1f2937', anchor = 'start' } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" ${FONT} font-size="${size}" font-weight="${weight}" fill="${color}">${esc(value)}</text>`;
}

function button({ x, y, w, h }, label, { color = BLUE, outline = false, disabled = false } = {}) {
  const fill = outline ? '#fff' : disabled ? '#cbd2df' : color;
  const stroke = outline ? `stroke="${color}" stroke-width="2"` : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${fill}" ${stroke}/>
${text(x + w / 2, y + h / 2 + 6, label, { size: 16, weight: 600, color: outline ? color : '#fff', anchor: 'middle' })}`;
}

function chip({ x, y, w, h }, label, active) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${active ? BLUE : '#fff'}" stroke="${active ? BLUE : '#cfd5e2'}"/>
${text(x + w / 2, y + h / 2 + 5, label, { size: 14, weight: 600, color: active ? '#fff' : '#475069', anchor: 'middle' })}`;
}

function badge(x, y, label, color) {
  const w = label.length * 8.5 + 24;
  return `<rect x="${x}" y="${y}" width="${w}" height="28" rx="14" fill="${color}22"/>
${text(x + w / 2, y + 19, label, { size: 13, weight: 700, color, anchor: 'middle' })}`;
}

function table({ x, y, w, rows, columns, highlightRow = -1 }) {
  const rowH = 42;
  const colW = w / columns.length;
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${rowH}" fill="#eef1f7"/>`;
  columns.forEach((c, i) => {
    out += text(x + 16 + i * colW, y + 27, c, { size: 14, weight: 700, color: '#475069' });
  });
  rows.forEach((row, r) => {
    const ry = y + rowH * (r + 1);
    out += `<rect x="${x}" y="${ry}" width="${w}" height="${rowH}" fill="${r === highlightRow ? '#e8efff' : '#fff'}" stroke="${LINE}"/>`;
    row.forEach((cell, i) => {
      out += text(x + 16 + i * colW, ry + 27, cell, { size: 14 });
    });
  });
  return out;
}
/** Box of table row `r` (0-based) for a table drawn at (x, y, w). */
const rowBox = (x, y, w, r) => ({ x, y: y + 42 * (r + 1), w, h: 42 });

export const TOAST = { x: 880, y: 716, w: 360, h: 56 };
function toast(box, message) {
  return `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="12" fill="${GREEN}"/>
${text(box.x + 22, box.y + 35, `✓ ${message}`, { size: 16, weight: 600, color: '#fff' })}`;
}

function field({ x, y, w }, label, value) {
  return `${text(x, y, label, { size: 14, weight: 600, color: '#475069' })}
<rect x="${x}" y="${y + 10}" width="${w}" height="44" rx="8" fill="#fff" stroke="#cfd5e2"/>
${text(x + 14, y + 38, value || 'Select…', { color: value ? '#111827' : '#9aa3b2' })}`;
}

function modal({ x, y, w, h }, title, body) {
  return `<rect width="${SCREEN_W}" height="${SCREEN_H}" fill="#0b1020" opacity="0.45"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#fff"/>
${text(x + 28, y + 46, title, { size: 21, weight: 700, color: '#111827' })}
<line x1="${x}" y1="${y + 70}" x2="${x + w}" y2="${y + 70}" stroke="${LINE}"/>
${text(x + w - 36, y + 44, '×', { size: 22, color: '#9aa3b2' })}
${body}`;
}

const MENU = ['Dashboard', 'Purchase orders', 'Return Repack', 'Customers', 'Reports', 'Settings'];
/** Box of a left-menu item. */
export const menuBox = (name) => ({ x: 12, y: 78 + MENU.indexOf(name) * 48, w: 196, h: 38 });

/** App chrome: top bar, left menu (with the active item), page title. */
function page({ module, title, activeMenu, body }) {
  const items = MENU.map((m) => {
    const box = menuBox(m);
    const active = m === activeMenu;
    return `${active ? `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="8" fill="#e8efff"/>` : ''}
${text(32, box.y + 26, m, { weight: active ? 700 : 500, color: active ? BLUE : '#475069' })}`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCREEN_W} ${SCREEN_H}" width="${SCREEN_W}" height="${SCREEN_H}">
<rect width="${SCREEN_W}" height="${SCREEN_H}" fill="#f5f6fa"/>
<rect width="${SCREEN_W}" height="56" fill="${NAVY}"/>
${text(24, 36, `ERP · ${module}`, { size: 19, weight: 700, color: '#fff' })}
<circle cx="1240" cy="28" r="15" fill="#3b4a6b"/>
<rect x="0" y="56" width="220" height="${SCREEN_H - 56}" fill="#fff" stroke="${LINE}"/>
${items}
${text(252, 112, title, { size: 26, weight: 700, color: '#111827' })}
${body}
</svg>`;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function dashboardPage() {
  const cards = [
    ['Open returns', '38'],
    ['Orders this week', '124'],
    ['Low stock items', '9'],
  ]
    .map(
      (
        [label, value],
        i,
      ) => `<rect x="${252 + i * 336}" y="150" width="316" height="130" rx="14" fill="#fff" stroke="${LINE}"/>
${text(276 + i * 336, 190, label, { color: '#6b7280' })}
${text(276 + i * 336, 246, value, { size: 40, weight: 700, color: '#111827' })}`,
    )
    .join('');
  return page({
    module: 'Home',
    title: 'Good morning',
    activeMenu: 'Dashboard',
    body:
      cards +
      `<rect x="252" y="304" width="988" height="440" rx="14" fill="#fff" stroke="${LINE}"/>` +
      text(276, 344, 'Recent activity', { size: 17, weight: 700 }) +
      [
        'RR-1043 returned by Sharma Retail',
        'PO-1041 approved',
        'Stock received for Carton box 40×30',
      ]
        .map((t, i) => text(276, 392 + i * 44, `• ${t}`, { color: '#475069' }))
        .join(''),
  });
}

// ─── Return Repack ───────────────────────────────────────────────────────────

const RR_ALL = [
  ['RR-1040', 'Shoes', '12 pcs', 'Pending'],
  ['RR-1041', 'Bags', '7 pcs', 'Repacked'],
  ['RR-1042', 'Belts', '4 pcs', 'Repacked'],
  ['RR-1043', 'Belts', '21 pcs', 'Pending'],
  ['RR-1044', 'Socks', '30 pcs', 'Pending'],
  ['RR-1045', 'Shoes', '9 pcs', 'Repacked'],
  ['RR-1046', 'Bags', '16 pcs', 'Pending'],
];
export const RR_GRAPH_BUTTON = { x: 1036, y: 82, w: 204, h: 46 };
export const RR_CHIP_ALL = { x: 252, y: 140, w: 70, h: 36 };
export const RR_CHIP_PENDING = { x: 332, y: 140, w: 104, h: 36 };
export const RR_CHIP_REPACKED = { x: 446, y: 140, w: 116, h: 36 };
const RR_TABLE = { x: 252, y: 196, w: 988 };
export const RR_DRAWER_FIELDS = { x: 846, y: 176, w: 370, h: 330 };
export const RR_REPACK_BUTTON = { x: 860, y: 620, w: 340, h: 50 };
export const RR_CHART = { x: 340, y: 230, w: 700, h: 420 };

function rrRows(filter, removed) {
  return RR_ALL.filter((r) => filter === 'All' || r[3] === filter).filter((r) => r[0] !== removed);
}
/** Row box of a return in the (filtered) Return Repack table. */
export function rrRowBox(filter, id) {
  return rowBox(
    RR_TABLE.x,
    RR_TABLE.y,
    RR_TABLE.w,
    rrRows(filter).findIndex((r) => r[0] === id),
  );
}

export function returnRepackPage({
  filter = 'All',
  selected = null,
  drawer = false,
  repacked = null,
} = {}) {
  const rows = rrRows(filter, repacked);
  const highlight = rows.findIndex((r) => r[0] === selected);
  const drawerSvg = drawer
    ? `<rect x="820" y="56" width="460" height="744" fill="#fff" stroke="${LINE}"/>
${text(846, 112, `Return ${selected}`, { size: 22, weight: 700 })}
${text(846, 142, 'Sharma Retail · received 2 Oct', { size: 14, color: '#6b7280' })}
${field({ x: 846, y: 190, w: 370 }, 'Item', 'Belts – brown, size M')}
${field({ x: 846, y: 280, w: 170 }, 'Returned', '21 pcs')}
${field({ x: 1046, y: 280, w: 170 }, 'Condition', 'Good')}
${field({ x: 846, y: 370, w: 370 }, 'Repack quantity', '21')}
${text(846, 486, 'All 21 pieces can go back to stock.', { size: 14, color: GREEN, weight: 600 })}
${button(RR_REPACK_BUTTON, 'Repack items')}`
    : '';
  return page({
    module: 'Returns',
    title: 'Return Repack',
    activeMenu: 'Return Repack',
    body:
      button(RR_GRAPH_BUTTON, 'View graph data') +
      chip(RR_CHIP_ALL, 'All', filter === 'All') +
      chip(RR_CHIP_PENDING, 'Pending', filter === 'Pending') +
      chip(RR_CHIP_REPACKED, 'Repacked', filter === 'Repacked') +
      table({
        ...RR_TABLE,
        rows,
        columns: ['Return #', 'Item', 'Quantity', 'Status'],
        highlightRow: highlight,
      }) +
      drawerSvg +
      (repacked ? toast(TOAST, `${repacked} repacked · stock updated`) : ''),
  });
}

export function returnRepackGraphModal() {
  const bars = [38, 64, 52, 88, 44, 72]
    .map((v, i) => {
      const bh = (v / 100) * 340;
      const bx = RR_CHART.x + 50 + i * 105;
      return `<rect x="${bx}" y="${RR_CHART.y + 380 - bh}" width="70" height="${bh}" rx="6" fill="${i === 3 ? '#f97316' : '#635bff'}"/>
${text(bx + 35, RR_CHART.y + 404, ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'][i], { size: 13, color: '#6b7280', anchor: 'middle' })}`;
    })
    .join('');
  return returnRepackPage({ filter: 'Pending', repacked: 'RR-1043' }).replace(
    '</svg>',
    modal(
      { x: 300, y: 110, w: 780, h: 580 },
      'Repacked items per month',
      `<line x1="${RR_CHART.x + 20}" y1="${RR_CHART.y + 380}" x2="${RR_CHART.x + RR_CHART.w - 20}" y2="${RR_CHART.y + 380}" stroke="#9aa3b2"/>${bars}`,
    ) + '</svg>',
  );
}

// ─── Purchase orders ─────────────────────────────────────────────────────────

export const PO_NEW_BUTTON = { x: 1060, y: 82, w: 180, h: 46 };
export const PO_FORM_FIELDS = { x: 400, y: 222, w: 480, h: 262 };
export const PO_SAVE_BUTTON = { x: 700, y: 596, w: 200, h: 48 };
const PO_TABLE = { x: 252, y: 150, w: 988 };
export const PO_NEW_ROW = rowBox(PO_TABLE.x, PO_TABLE.y, PO_TABLE.w, 0);
export const PO_APPROVE_BUTTON = { x: 1080, y: 82, w: 160, h: 46 };
export const PO_RECEIVE_BUTTON = { x: 880, y: 82, w: 180, h: 46 };
export const PO_STATUS = { x: 252, y: 128, w: 150, h: 36 };

const PO_ROWS = [
  ['PO-1041', 'Metro Supplies', '₹ 48,200', 'Approved'],
  ['PO-1040', 'Kiran Traders', '₹ 12,750', 'Draft'],
  ['PO-1039', 'Metro Supplies', '₹ 9,300', 'Received'],
  ['PO-1038', 'Apex Packaging', '₹ 22,040', 'Approved'],
];

export function purchaseOrdersPage({ withNewRow = false } = {}) {
  const rows = withNewRow
    ? [['PO-1042', 'Apex Packaging', '₹ 18,000', 'Draft'], ...PO_ROWS]
    : PO_ROWS;
  return page({
    module: 'Purchasing',
    title: 'Purchase orders',
    activeMenu: 'Purchase orders',
    body:
      button(PO_NEW_BUTTON, '+ New order') +
      table({
        ...PO_TABLE,
        rows,
        columns: ['Order', 'Supplier', 'Amount', 'Status'],
        highlightRow: withNewRow ? 0 : -1,
      }) +
      (withNewRow ? toast(TOAST, 'Order PO-1042 created') : ''),
  });
}

export function purchaseOrderForm() {
  return purchaseOrdersPage().replace(
    '</svg>',
    modal(
      { x: 360, y: 140, w: 560, h: 530 },
      'New purchase order',
      field({ x: 400, y: 240, w: 480 }, 'Supplier', 'Apex Packaging') +
        field({ x: 400, y: 330, w: 480 }, 'Item', 'Carton box 40×30') +
        field({ x: 400, y: 420, w: 220 }, 'Quantity', '600') +
        field({ x: 660, y: 420, w: 220 }, 'Delivery date', '12 Oct') +
        button({ x: 480, y: 596, w: 200, h: 48 }, 'Cancel', { outline: true, color: '#6b7280' }) +
        button(PO_SAVE_BUTTON, 'Save order'),
    ) + '</svg>',
  );
}

export function purchaseOrderDetail({ status = 'Draft', received = false } = {}) {
  const color = status === 'Draft' ? '#6b7280' : status === 'Approved' ? BLUE : GREEN;
  return page({
    module: 'Purchasing',
    title: 'PO-1042 · Apex Packaging',
    activeMenu: 'Purchase orders',
    body:
      badge(PO_STATUS.x, PO_STATUS.y + 4, status, color) +
      button(PO_RECEIVE_BUTTON, 'Receive goods', {
        disabled: status !== 'Approved',
        color: GREEN,
      }) +
      (status === 'Draft'
        ? button(PO_APPROVE_BUTTON, 'Approve')
        : badge(PO_APPROVE_BUTTON.x + 10, PO_APPROVE_BUTTON.y + 9, '✓ Approved', BLUE)) +
      table({
        x: 252,
        y: 186,
        w: 988,
        rows: [
          ['Carton box 40×30', '600', '₹ 30', '₹ 18,000'],
          ['Delivery', '1', '₹ 0', '₹ 0'],
        ],
        columns: ['Item', 'Qty', 'Rate', 'Total'],
      }) +
      `<rect x="252" y="330" width="988" height="120" rx="14" fill="#fff" stroke="${LINE}"/>` +
      text(276, 370, 'Delivery by 12 Oct · Warehouse A', { color: '#475069' }) +
      text(276, 410, 'Total ₹ 18,000', { size: 20, weight: 700 }) +
      (received ? toast(TOAST, 'Goods received · stock +600') : ''),
  });
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export const REPORT_MONTH_BUTTON = { x: 252, y: 136, w: 170, h: 44 };
export const REPORT_MONTH_OCT = { x: 262, y: 318, w: 80, h: 40 };
export const REPORT_CHART = { x: 252, y: 196, w: 988, h: 420 };
export const REPORT_EXPORT_BUTTON = { x: 1100, y: 82, w: 140, h: 46 };
export const REPORT_CSV_OPTION = { x: 1040, y: 232, w: 200, h: 46 };
export const REPORT_DOWNLOAD_BAR = { x: 252, y: 720, w: 460, h: 56 };

export function reportsPage({
  month = 'Sep',
  picker = false,
  menuOpen = false,
  downloaded = false,
} = {}) {
  const values = month === 'Oct' ? [48, 62, 55, 81, 70, 88, 84] : [42, 58, 51, 73, 66, 80, 77];
  const chart = values
    .map(
      (v, i) =>
        `<rect x="${300 + i * 130}" y="${590 - v * 3.4}" width="70" height="${v * 3.4}" rx="6" fill="${month === 'Oct' ? '#635bff' : '#93a4ff'}"/>`,
    )
    .join('');
  // Month picker: 3 × 2 grid; Oct is the first cell of the second row.
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pickerSvg = picker
    ? `<rect x="252" y="188" width="300" height="190" rx="12" fill="#fff" stroke="${LINE}"/>
${text(272, 220, '2026', { weight: 700 })}
${months
  .map((m, i) => {
    const x = 262 + (i % 3) * 90;
    const y = 238 + Math.floor(i / 3) * 80;
    const isOct = m === 'Oct';
    return `<rect x="${x}" y="${y}" width="80" height="40" rx="8" fill="${isOct ? '#e8efff' : '#f5f6fa'}"/>
${text(x + 40, y + 26, m, { weight: isOct ? 700 : 500, color: isOct ? BLUE : '#1f2937', anchor: 'middle' })}`;
  })
  .join('')}`
    : '';
  const menu = menuOpen
    ? `<rect x="1030" y="136" width="220" height="152" rx="12" fill="#fff" stroke="${LINE}"/>
${['PDF', 'Excel (.xlsx)', 'CSV']
  .map((o, i) => {
    const y = 140 + i * 46;
    const active = o === 'CSV';
    return `${active ? `<rect x="${REPORT_CSV_OPTION.x}" y="${y}" width="${REPORT_CSV_OPTION.w}" height="46" rx="8" fill="#e8efff"/>` : ''}
${text(1060, y + 29, o, { weight: active ? 700 : 500, color: active ? BLUE : '#1f2937' })}`;
  })
  .join('')}`
    : '';
  return page({
    module: 'Reports',
    title: `Sales report · ${month === 'Oct' ? 'October' : 'September'}`,
    activeMenu: 'Reports',
    body:
      `<rect x="${REPORT_MONTH_BUTTON.x}" y="${REPORT_MONTH_BUTTON.y}" width="${REPORT_MONTH_BUTTON.w}" height="${REPORT_MONTH_BUTTON.h}" rx="9" fill="#fff" stroke="#cfd5e2"/>` +
      text(REPORT_MONTH_BUTTON.x + 18, REPORT_MONTH_BUTTON.y + 28, `📅  ${month} 2026  ▾`, {
        weight: 600,
      }) +
      button(REPORT_EXPORT_BUTTON, 'Export ▾') +
      `<rect x="${REPORT_CHART.x}" y="${REPORT_CHART.y}" width="${REPORT_CHART.w}" height="${REPORT_CHART.h}" rx="14" fill="#fff" stroke="${LINE}"/>${chart}` +
      text(
        276,
        650,
        month === 'Oct' ? 'Total revenue ₹ 21.9 L · up 19% on September' : 'Total revenue ₹ 18.4 L',
        {
          color: '#475069',
        },
      ) +
      pickerSvg +
      menu +
      (downloaded
        ? `<rect x="${REPORT_DOWNLOAD_BAR.x}" y="${REPORT_DOWNLOAD_BAR.y}" width="${REPORT_DOWNLOAD_BAR.w}" height="${REPORT_DOWNLOAD_BAR.h}" rx="12" fill="#111827"/>
${text(REPORT_DOWNLOAD_BAR.x + 22, REPORT_DOWNLOAD_BAR.y + 35, '⬇ sales-report-oct-2026.csv — downloaded', { size: 16, weight: 600, color: '#fff' })}`
        : ''),
  });
}

// ─── Customers ───────────────────────────────────────────────────────────────

export const CUSTOMER_SEARCH = { x: 252, y: 140, w: 560, h: 48 };
const CUSTOMER_TABLE = { x: 252, y: 208, w: 988 };
export const CUSTOMER_FIRST_ROW = rowBox(CUSTOMER_TABLE.x, CUSTOMER_TABLE.y, CUSTOMER_TABLE.w, 0);
export const CUSTOMER_TAB_ORDERS = { x: 370, y: 206, w: 110, h: 42 };
export const CUSTOMER_ORDERS = { x: 252, y: 266, w: 988, h: 252 };
export const CUSTOMER_STATEMENT_BUTTON = { x: 1020, y: 82, w: 220, h: 46 };
export const CUSTOMER_KPIS = { x: 252, y: 266, w: 988, h: 130 };

export function customersPage({ query = '' } = {}) {
  const all = [
    ['Sharma Retail', 'Delhi', '42 orders'],
    ['Kiran Traders', 'Pune', '17 orders'],
    ['Metro Supplies', 'Mumbai', '88 orders'],
    ['Apex Packaging', 'Chennai', '31 orders'],
    ['Nova Foods', 'Jaipur', '9 orders'],
  ];
  const rows = query ? all.filter((r) => r[0].toLowerCase().includes(query.toLowerCase())) : all;
  return page({
    module: 'Sales',
    title: 'Customers',
    activeMenu: 'Customers',
    body:
      `<rect x="${CUSTOMER_SEARCH.x}" y="${CUSTOMER_SEARCH.y}" width="${CUSTOMER_SEARCH.w}" height="${CUSTOMER_SEARCH.h}" rx="10" fill="#fff" stroke="${query ? BLUE : '#cfd5e2'}" stroke-width="${query ? 2 : 1}"/>` +
      text(
        CUSTOMER_SEARCH.x + 18,
        CUSTOMER_SEARCH.y + 31,
        `🔍  ${query || 'Search customers by name…'}`,
        {
          size: 16,
          color: query ? '#111827' : '#9aa3b2',
        },
      ) +
      table({
        ...CUSTOMER_TABLE,
        rows,
        columns: ['Customer', 'City', 'Activity'],
        highlightRow: query ? 0 : -1,
      }),
  });
}

export function customerProfile({ tab = 'Overview' } = {}) {
  const tabs = ['Overview', 'Orders', 'Invoices']
    .map((t, i) => {
      const x = 252 + i * 118;
      const active = t === tab;
      return `${text(x + 12, 234, t, { weight: active ? 700 : 500, color: active ? BLUE : '#6b7280' })}
${active ? `<rect x="${x}" y="244" width="${t.length * 10 + 24}" height="3" fill="${BLUE}"/>` : ''}`;
    })
    .join('');
  const overview = [
    ['Orders', '88'],
    ['Revenue', '₹ 42.6 L'],
    ['Outstanding', '₹ 1.2 L'],
  ]
    .map(
      (
        [l, v],
        i,
      ) => `<rect x="${252 + i * 336}" y="266" width="316" height="130" rx="14" fill="#fff" stroke="${LINE}"/>
${text(276 + i * 336, 304, l, { color: '#6b7280' })}${text(276 + i * 336, 356, v, { size: 32, weight: 700 })}`,
    )
    .join('');
  const orders = table({
    x: CUSTOMER_ORDERS.x,
    y: CUSTOMER_ORDERS.y,
    w: CUSTOMER_ORDERS.w,
    rows: [
      ['SO-5530', '3 Oct', '₹ 64,000', 'Delivered'],
      ['SO-5487', '21 Sep', '₹ 38,500', 'Delivered'],
      ['SO-5402', '2 Sep', '₹ 91,200', 'Paid'],
      ['SO-5391', '28 Aug', '₹ 12,900', 'Paid'],
      ['SO-5320', '9 Aug', '₹ 55,000', 'Paid'],
    ],
    columns: ['Order', 'Date', 'Amount', 'Status'],
  });
  return page({
    module: 'Sales',
    title: 'Metro Supplies',
    activeMenu: 'Customers',
    body:
      text(252, 146, 'Mumbai · customer since 2021', { color: '#6b7280' }) +
      button(CUSTOMER_STATEMENT_BUTTON, 'Download statement', { outline: true }) +
      `<line x1="252" y1="247" x2="1240" y2="247" stroke="${LINE}"/>` +
      tabs +
      (tab === 'Overview' ? overview : orders),
  });
}
