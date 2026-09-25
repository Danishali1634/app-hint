/**
 * @file Built-in example walkthroughs shown on #/examples ("See examples").
 *
 * Each one is a COMPLETE feature flow (6–9 steps), not a single button, so
 * visitors see what a real course feels like: navigating to the page,
 * filtering, opening a record, filling a form, confirming, and checking the
 * result. Several consecutive steps share a screen, which shows the player's
 * continuous camera glide from one area to the next.
 *
 * They run in the real WalkthroughPlayer. Screens are drawn in code
 * (src/examples/mockScreens.js) for a fictional ERP app; regions come from the
 * same boxes the screens draw, so highlights always land exactly.
 */

import * as S from './mockScreens';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

/**
 * @typedef {Object} Example
 * @property {string} id           used in the URL: #/examples/:id
 * @property {string} title
 * @property {string} pageName
 * @property {string} useCase      short tag, e.g. "Onboarding"
 * @property {string} description
 * @property {WalkthroughStep[]} steps
 */

/**
 * One step. Screens are memoised by SVG string, so steps that share a screen
 * share the exact same image URL (the player then glides instead of cutting).
 */
const urlCache = new Map();
function step(id, { screen, box, action = 'click', label, text, pad = 6 }) {
  if (!urlCache.has(screen)) urlCache.set(screen, S.svgToDataUrl(screen));
  return {
    id,
    label,
    text,
    action,
    region: box ? S.toRegion(box, pad) : null,
    audioData: null,
    imageData: urlCache.get(screen),
  };
}

// Screens reused by several steps (same image → smooth camera glide).
const rrPendingDrawer = S.returnRepackPage({
  filter: 'Pending',
  selected: 'RR-1043',
  drawer: true,
});
const rrRepacked = S.returnRepackPage({ filter: 'Pending', repacked: 'RR-1043' });
const poForm = S.purchaseOrderForm();
const poListNew = S.purchaseOrdersPage({ withNewRow: true });
const poApproved = S.purchaseOrderDetail({ status: 'Approved' });
const reportOct = S.reportsPage({ month: 'Oct' });
const customerOrders = S.customerProfile({ tab: 'Orders' });

/** @type {Example[]} */
export const EXAMPLES = [
  {
    id: 'return-repack',
    title: 'Repack a return and check the trend',
    pageName: 'Return Repack',
    useCase: 'Employee onboarding',
    description:
      'The full daily task: open Return Repack, filter pending returns, repack one, then see the monthly graph.',
    steps: [
      step('rr-1', {
        screen: S.dashboardPage(),
        box: S.menuBox('Return Repack'),
        label: 'Open Return Repack',
        text: 'From the menu on the left, open Return Repack.',
      }),
      step('rr-2', {
        screen: S.returnRepackPage(),
        box: S.RR_CHIP_PENDING,
        label: 'Show pending returns',
        text: 'Click Pending to see only the returns that still need repacking.',
      }),
      step('rr-3', {
        screen: S.returnRepackPage({ filter: 'Pending' }),
        box: S.rrRowBox('Pending', 'RR-1043'),
        label: 'Open a return',
        text: 'Click a return to open its details. Here, RR-1043 with 21 belts.',
      }),
      step('rr-4', {
        screen: rrPendingDrawer,
        box: S.RR_DRAWER_FIELDS,
        action: 'look',
        label: 'Check the details',
        text: 'Check the condition and how many pieces can go back into stock.',
      }),
      step('rr-5', {
        screen: rrPendingDrawer,
        box: S.RR_REPACK_BUTTON,
        label: 'Repack',
        text: 'Click Repack items to put them back into stock.',
      }),
      step('rr-6', {
        screen: rrRepacked,
        box: S.TOAST,
        action: 'look',
        label: 'Stock updated',
        text: 'The return disappears from the pending list and stock is updated.',
      }),
      step('rr-7', {
        screen: rrRepacked,
        box: S.RR_GRAPH_BUTTON,
        label: 'Open the graph',
        text: 'To see the trend, click View graph data.',
      }),
      step('rr-8', {
        screen: S.returnRepackGraphModal(),
        box: S.RR_CHART,
        action: 'look',
        label: 'Read the trend',
        text: 'The chart shows repacked items per month. August was the busiest month.',
      }),
    ],
  },
  {
    id: 'purchase-order',
    title: 'Purchase order: create, approve, receive',
    pageName: 'Purchase orders',
    useCase: 'Process training',
    description:
      'A complete lifecycle across three screens: create the order, approve it, and receive the goods into stock.',
    steps: [
      step('po-1', {
        screen: S.purchaseOrdersPage(),
        box: S.PO_NEW_BUTTON,
        label: 'Start a new order',
        text: 'On Purchase orders, click New order.',
      }),
      step('po-2', {
        screen: poForm,
        box: S.PO_FORM_FIELDS,
        action: 'look',
        label: 'Fill in the order',
        text: 'Choose the supplier and item, then enter the quantity and delivery date.',
      }),
      step('po-3', {
        screen: poForm,
        box: S.PO_SAVE_BUTTON,
        label: 'Save it',
        text: 'Click Save order.',
      }),
      step('po-4', {
        screen: poListNew,
        box: S.TOAST,
        action: 'look',
        label: 'Order created',
        text: 'The new order PO-1042 is created as a draft.',
      }),
      step('po-5', {
        screen: poListNew,
        box: S.PO_NEW_ROW,
        label: 'Open the order',
        text: 'Click the order to open it.',
      }),
      step('po-6', {
        screen: S.purchaseOrderDetail(),
        box: S.PO_APPROVE_BUTTON,
        label: 'Approve',
        text: 'Check the lines, then click Approve.',
      }),
      step('po-7', {
        screen: poApproved,
        box: S.PO_STATUS,
        action: 'look',
        label: 'Approved',
        text: 'The status changes to Approved, and Receive goods becomes available.',
      }),
      step('po-8', {
        screen: poApproved,
        box: S.PO_RECEIVE_BUTTON,
        label: 'Receive the goods',
        text: 'When the delivery arrives, click Receive goods.',
      }),
      step('po-9', {
        screen: S.purchaseOrderDetail({ status: 'Received', received: true }),
        box: S.TOAST,
        action: 'look',
        label: 'Done',
        text: 'Stock goes up by 600 cartons and the order is complete.',
      }),
    ],
  },
  {
    id: 'monthly-report',
    title: 'Monthly sales report: pick a month and export',
    pageName: 'Reports',
    useCase: 'Help centre',
    description:
      'Date pickers, charts and menus: switch to October, read the result, export it as CSV.',
    steps: [
      step('mr-1', {
        screen: S.reportsPage(),
        box: S.REPORT_MONTH_BUTTON,
        label: 'Change the month',
        text: 'Click the month selector at the top left.',
      }),
      step('mr-2', {
        screen: S.reportsPage({ picker: true }),
        box: S.REPORT_MONTH_OCT,
        label: 'Choose October',
        text: 'Pick October.',
      }),
      step('mr-3', {
        screen: reportOct,
        box: S.REPORT_CHART,
        action: 'look',
        label: 'Read the report',
        text: 'The chart now shows October: revenue is up 19 percent on September.',
      }),
      step('mr-4', {
        screen: reportOct,
        box: S.REPORT_EXPORT_BUTTON,
        label: 'Export',
        text: 'Click Export at the top right.',
      }),
      step('mr-5', {
        screen: S.reportsPage({ month: 'Oct', menuOpen: true }),
        box: S.REPORT_CSV_OPTION,
        label: 'Choose CSV',
        text: 'Pick CSV to open it in Excel or Google Sheets.',
      }),
      step('mr-6', {
        screen: S.reportsPage({ month: 'Oct', downloaded: true }),
        box: S.REPORT_DOWNLOAD_BAR,
        action: 'look',
        label: 'Downloaded',
        text: 'The October report downloads straight away.',
      }),
    ],
  },
  {
    id: 'customer-lookup',
    title: 'Find a customer and get their statement',
    pageName: 'Customers',
    useCase: 'Release notes',
    description:
      'Search, open a profile, switch tabs and download a statement — a new feature, end to end.',
    steps: [
      step('cu-1', {
        screen: S.customersPage(),
        box: S.CUSTOMER_SEARCH,
        label: 'Search',
        text: 'Click the new search box and type part of the customer name.',
      }),
      step('cu-2', {
        screen: S.customersPage({ query: 'Metro' }),
        box: S.CUSTOMER_FIRST_ROW,
        label: 'Open the customer',
        text: 'Matching customers appear instantly. Click Metro Supplies.',
      }),
      step('cu-3', {
        screen: S.customerProfile(),
        box: S.CUSTOMER_KPIS,
        action: 'look',
        label: 'Overview',
        text: 'The overview shows orders, revenue and what is still outstanding.',
      }),
      step('cu-4', {
        screen: S.customerProfile(),
        box: S.CUSTOMER_TAB_ORDERS,
        label: 'See their orders',
        text: 'Click the Orders tab.',
      }),
      step('cu-5', {
        screen: customerOrders,
        box: S.CUSTOMER_ORDERS,
        action: 'look',
        label: 'Order history',
        text: 'Every order with its date, amount and status.',
      }),
      step('cu-6', {
        screen: customerOrders,
        box: S.CUSTOMER_STATEMENT_BUTTON,
        label: 'Download the statement',
        text: 'Click Download statement to save a PDF for the customer.',
      }),
    ],
  },
];

/** @param {string} id */
export function getExample(id) {
  return EXAMPLES.find((example) => example.id === id) || EXAMPLES[0];
}
