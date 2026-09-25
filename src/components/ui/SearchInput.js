/**
 * @file Large search box used on Home and Library.
 * "/" or Ctrl/Cmd+K focuses it from anywhere on the page; Esc clears it.
 */

import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

/**
 * @param {{ value: string, onChange: (v: string) => void, placeholder: string, autoFocus?: boolean }} props
 */
export function SearchInput({ value, onChange, placeholder, autoFocus = false }) {
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative flex-1">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-faint dark:text-ink-faint-dark pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        enterKeyHint="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder={placeholder}
        className="w-full py-3.5 pl-12 pr-24 rounded-2xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark text-sm text-ink dark:text-ink-soft-dark placeholder:text-ink-faint dark:placeholder:text-ink-faint-dark shadow-premium outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-all"
        aria-label="Search courses"
      />
      {value ? (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-paper-2 dark:hover:bg-paper-2-dark"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      ) : (
        <kbd className="hidden sm:block absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-mono text-ink-faint dark:text-ink-faint-dark border border-line dark:border-line-dark rounded-md px-1.5 py-0.5">
          /
        </kbd>
      )}
    </div>
  );
}
