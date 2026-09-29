/**
 * @file Home page footer: brand + mission, two link columns (Product,
 * Use cases) and a small © bar. Links use the app's hash routes via
 * react-router <Link>. No social links or addresses on purpose.
 *
 * The logo mark is a copy of the one in ui/Header.js (kept local so the
 * home page does not depend on header internals).
 */

import { Link } from 'react-router-dom';
import { Mic } from 'lucide-react';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { to: '/new', label: 'Create from screenshots' },
      { to: '/new?mode=video', label: 'Record your screen' },
      { to: '/examples', label: 'Examples' },
      { to: '/courses', label: 'All courses' },
    ],
  },
  {
    title: 'Use cases',
    links: [
      { to: '/examples', label: 'Employee onboarding' },
      { to: '/examples', label: 'Help-centre articles' },
      { to: '/examples', label: 'Release notes' },
      { to: '/examples', label: 'Process training' },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-line dark:border-line-dark bg-panel/60 dark:bg-panel-dark/40">
      {/* Thin brand gradient along the top edge */}
      <div
        className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
        aria-hidden="true"
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1 max-w-sm">
            <Link to="/" className="inline-flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-violet flex items-center justify-center shadow-glow">
                <Mic className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
              </span>
              <span className="font-semibold text-sm text-ink dark:text-white tracking-tight">
                Hint Studio
              </span>
            </Link>
            <p className="mt-4 text-sm text-ink-soft dark:text-ink-faint-dark leading-relaxed">
              Short, animated walkthroughs that help everyone use your software without asking for
              help.
            </p>
          </div>

          {/* Link columns */}
          {COLUMNS.map(({ title, links }) => (
            <nav key={title} aria-label={title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink dark:text-ink-soft-dark">
                {title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {links.map(({ to, label }) => (
                  <li key={label}>
                    <Link
                      to={to}
                      className="text-sm text-ink-soft dark:text-ink-faint-dark hover:text-accent dark:hover:text-accent-ink-dark transition-colors"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-line dark:border-line-dark flex flex-col sm:flex-row gap-2 sm:items-center justify-between text-xs text-ink-faint dark:text-ink-faint-dark">
          <p>© {year} Hint Studio</p>
          <p>Zoom in. Show the click. Explain every step.</p>
        </div>
      </div>
    </footer>
  );
}
