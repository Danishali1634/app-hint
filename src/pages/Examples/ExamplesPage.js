/**
 * @file Route #/examples/:exampleId? — ready-made example walkthroughs.
 *
 * Opened from "See examples" on Home and the sidebar. Pick an example on the
 * left (a horizontal row on phones); it plays on the right in the REAL player
 * (inline, paused until ▶), so people see exactly what they can build.
 * The selected example is in the URL, so an example can be linked directly.
 *
 * Examples and their drawn screens live in src/examples/.
 */

import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Sparkles, Layers, MousePointerClick, Eye } from 'lucide-react';
import { EXAMPLES, getExample } from '@/examples';
import { WalkthroughPlayer } from '@/components/walkthrough/WalkthroughPlayer';
import { CourseInfo } from '@/components/walkthrough/CourseInfo';

export function ExamplesPage() {
  const { exampleId } = useParams();
  const navigate = useNavigate();
  const example = getExample(exampleId);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-accent mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Examples
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink dark:text-white">
            See what Hint Studio makes
          </h1>
          <p className="mt-2 text-sm sm:text-base text-ink-soft dark:text-ink-faint-dark max-w-2xl">
            Complete feature walkthroughs of a sample ERP app. Press ▶ once and it plays through on
            its own — this is exactly what your users will see.
          </p>
        </div>
        <button
          onClick={() => navigate('/new')}
          className="self-start md:self-auto flex items-center gap-2 px-5 h-11 rounded-xl bg-accent text-white text-sm font-semibold shadow-glow hover:bg-accent-dark transition-colors"
        >
          <Plus className="w-4 h-4" /> Create one like this
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* ── Example picker ── */}
        <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-visible -mx-4 px-4 lg:mx-0 lg:px-0 pb-2 lg:pb-0 snap-x">
          {EXAMPLES.map((ex) => {
            const active = ex.id === example.id;
            const clicks = ex.steps.filter((s) => s.action === 'click').length;
            return (
              <button
                key={ex.id}
                onClick={() => navigate(`/examples/${ex.id}`)}
                className={`snap-start flex-shrink-0 w-[260px] lg:w-auto text-left rounded-2xl border p-3 transition-all ${
                  active
                    ? 'border-accent bg-accent/5 dark:bg-accent/10 ring-4 ring-accent/10'
                    : 'border-line dark:border-line-dark bg-panel dark:bg-panel-dark hover:border-accent/50'
                }`}
                aria-current={active ? 'true' : undefined}
              >
                <div className="flex gap-3">
                  <img
                    src={ex.steps[0].imageData}
                    alt=""
                    className="w-24 aspect-[16/10] rounded-lg border border-line dark:border-line-dark object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-accent">
                      {ex.useCase}
                    </span>
                    <p className="text-sm font-semibold text-ink dark:text-white leading-snug">
                      {ex.title}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-faint dark:text-ink-faint-dark">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" /> {ex.steps.length} steps
                      </span>
                      <span className="flex items-center gap-1">
                        <MousePointerClick className="w-3 h-3" /> {clicks} click
                        {clicks !== 1 ? 's' : ''}
                      </span>
                      {ex.steps.length - clicks > 0 && (
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {ex.steps.length - clicks} look
                          {ex.steps.length - clicks !== 1 ? 's' : ''}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <p className="hidden lg:block mt-2 text-xs text-ink-soft dark:text-ink-faint-dark">
                  {ex.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* ── Player ── */}
        <div className="min-w-0">
          <div className="h-[min(64vh,640px)] min-h-[380px]">
            <WalkthroughPlayer
              key={example.id}
              steps={example.steps}
              title={example.title}
              variant="inline"
            />
          </div>
          <CourseInfo
            title={example.title}
            pageName={example.pageName}
            description={example.description}
            steps={example.steps}
          />
        </div>
      </div>
    </div>
  );
}
