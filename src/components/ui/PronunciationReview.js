/**
 * @file Settings → Hindi voices → "Check my courses": teaches the Hindi voice
 * the words of every saved course and lets the user fix any it says wrong.
 *
 * Reads all course text from IndexedDB (titles, descriptions, step labels and
 * texts), looks up each new word once (hinglish.analyzeTexts — so later
 * playback is instant and offline), and lists every word with how the Hindi
 * voice will say it and why. Words it had to guess are shown first; ▶ plays a
 * word, and typing a spelling (Hindi script, or Roman the way it sounds:
 * "baar-kod") saves a fix that beats every other rule (hinglish.setWordOverride).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, Loader2, Play, RotateCcw, Square } from 'lucide-react';
import { toast } from 'react-toastify';
import { getAllCourses } from '@/services/storage/db';
import { analyzeTexts, respell, setWordOverride } from '@/services/text/hinglish';
import { aiVoiceUrl } from '@/services/audio/neuralVoice';

/** Sources worth a look: the voice guessed, or the word could be Hindi or English. */
const GUESSED = new Set(['learned', 'rules', 'corrected', 'dictionary']);

const SOURCE_LABELS = {
  override: 'Fixed by you',
  hindi: 'Hindi list',
  english: 'English list',
  ambiguous: 'Hindi or English, by sentence',
  acronym: 'Letters',
  spelling: 'Short form',
  dictionary: 'English dictionary',
  corrected: 'Typo',
  learned: 'Looked up online',
  rules: 'Guessed by rules',
};

/** Every text of a course a voice may read. */
function courseTexts(course) {
  const steps = [...(course.steps || []), ...(course.videoDraftSteps || [])];
  return [
    course.title,
    course.description,
    ...steps.flatMap((s) => [s.label, s.text, ...(s.extraTexts || [])]),
  ];
}

/**
 * @param {{ voiceId: string, lookup: boolean }} props  voiceId: the Hindi voice used for ▶
 */
export function PronunciationReview({ voiceId, lookup }) {
  const [status, setStatus] = useState('idle'); // idle | loading | done
  const [words, setWords] = useState([]);
  const [courseCount, setCourseCount] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState({}); // word → typed spelling
  const [playing, setPlaying] = useState(null); // word | null
  const audio = useRef(null);

  useEffect(() => () => audio.current?.pause(), []);

  const check = async () => {
    setStatus('loading');
    try {
      const courses = await getAllCourses();
      setCourseCount(courses.length);
      setWords(await analyzeTexts(courses.flatMap(courseTexts), { lookup }));
      setDrafts({});
      setStatus('done');
    } catch (error) {
      toast.error(`Couldn't read your courses: ${error.message}`);
      setStatus('idle');
    }
  };

  const play = async (row, spoken) => {
    audio.current?.pause();
    if (playing === row.word) {
      setPlaying(null);
      return;
    }
    setPlaying(row.word);
    try {
      const url = await aiVoiceUrl(spoken, { voiceId, hinglishLookup: false });
      const player = new Audio(url);
      audio.current = player;
      player.onended = () => setPlaying((w) => (w === row.word ? null : w));
      await player.play();
    } catch (error) {
      setPlaying(null);
      toast.error(`Couldn't play: ${error?.message || 'please try again'}`);
    }
  };

  const save = (row) => {
    const spoken = setWordOverride(row.word, drafts[row.word] ?? '');
    if (!spoken) return;
    setWords((all) =>
      all.map((w) => (w.word === row.word ? { ...w, spoken, source: 'override' } : w)),
    );
    setDrafts((d) => {
      const rest = { ...d };
      delete rest[row.word];
      return rest;
    });
    toast.success(`“${row.word}” will be said ${spoken}`);
  };

  const reset = async (row) => {
    setWordOverride(row.word, null);
    const again = (await analyzeTexts([row.example], { lookup })).find((w) => w.word === row.word);
    if (!again) return;
    setWords((all) =>
      all.map((w) => (w.word === row.word ? { ...again, example: w.example, count: w.count } : w)),
    );
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return words
      .filter((w) => showAll || GUESSED.has(w.source) || w.source === 'override')
      .filter((w) => !q || w.word.includes(q) || w.spoken.includes(q))
      .slice(0, 300);
  }, [words, showAll, query]);
  const guessedCount = words.filter((w) => GUESSED.has(w.source)).length;

  return (
    <div className="mt-3 p-3 rounded-xl border border-line dark:border-line-dark">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-ink dark:text-ink-soft-dark">
            Teach the Hindi voice your words
          </p>
          <p className="text-[11px] text-ink-faint dark:text-ink-faint-dark">
            Reads the text of every saved course, learns each new word once, and lists the words it
            had to guess so you can check and fix them.
          </p>
        </div>
        <button
          type="button"
          onClick={check}
          disabled={status === 'loading'}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold text-accent ring-1 ring-accent/30 hover:bg-accent/10 disabled:opacity-60"
        >
          {status === 'loading' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <BookOpenCheck className="w-3.5 h-3.5" />
          )}
          {status === 'done' ? 'Check again' : 'Check my courses'}
        </button>
      </div>

      {status === 'done' && (
        <>
          <p className="mt-2 text-[11px] text-ink-soft dark:text-ink-faint-dark">
            {courseCount} course{courseCount === 1 ? '' : 's'} · {words.length} different words ·{' '}
            <span className="font-semibold">{guessedCount} to check</span>
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a word"
              className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-paper-2 dark:bg-paper-2-dark border border-line dark:border-line-dark text-xs outline-none focus:border-accent"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-ink-soft dark:text-ink-faint-dark cursor-pointer">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent"
              />
              All words
            </label>
          </div>
          {shown.length === 0 ? (
            <p className="mt-3 text-xs text-ink-faint dark:text-ink-faint-dark">
              Nothing to check — every word is in the built-in lists.
            </p>
          ) : (
            <ul className="mt-2 max-h-80 overflow-y-auto divide-y divide-line dark:divide-line-dark">
              {shown.map((row) => {
                const draft = drafts[row.word];
                const preview = draft ? respell(draft) : '';
                return (
                  <li key={row.word} className="py-2 flex items-center gap-2">
                    <div className="w-32 flex-shrink-0 min-w-0" title={row.example}>
                      <p className="text-sm font-medium text-ink dark:text-ink-soft-dark truncate">
                        {row.word}
                        <span className="ml-1 text-[10px] text-ink-faint">×{row.count}</span>
                      </p>
                      <p className="text-[10px] text-ink-faint dark:text-ink-faint-dark truncate">
                        {SOURCE_LABELS[row.source] ?? row.source}
                        {row.meant ? ` → ${row.meant}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => play(row, preview || row.spoken)}
                      className="flex-shrink-0 w-7 h-7 grid place-items-center rounded-full text-accent ring-1 ring-accent/30 hover:bg-accent/10"
                      aria-label={`Play ${row.word}`}
                    >
                      {playing === row.word ? (
                        <Square className="w-3 h-3" fill="currentColor" />
                      ) : (
                        <Play className="w-3 h-3" fill="currentColor" />
                      )}
                    </button>
                    <span className="w-24 flex-shrink-0 text-sm text-ink dark:text-ink-soft-dark truncate">
                      {preview || row.spoken}
                    </span>
                    <input
                      value={draft ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.word]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && draft && save(row)}
                      placeholder="Fix: बारकोड or baar-kod"
                      aria-label={`How to say ${row.word}`}
                      className="flex-1 min-w-0 h-7 px-2 rounded-lg bg-paper-2 dark:bg-paper-2-dark border border-line dark:border-line-dark text-xs outline-none focus:border-accent"
                    />
                    {draft ? (
                      <button
                        type="button"
                        onClick={() => save(row)}
                        className="flex-shrink-0 px-2.5 h-7 rounded-lg text-xs font-semibold bg-accent text-white"
                      >
                        Save
                      </button>
                    ) : row.source === 'override' ? (
                      <button
                        type="button"
                        onClick={() => reset(row)}
                        className="flex-shrink-0 w-7 h-7 grid place-items-center rounded-lg text-ink-faint hover:text-accent"
                        aria-label={`Forget the fix for ${row.word}`}
                        title="Forget my fix"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
