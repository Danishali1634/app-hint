/**
 * @file Features bento grid — only things the product really does, each tile
 * with a small live illustration:
 *
 *   Camera zoom (wide)   a mini app zooms onto the feature, the rest dims
 *   Click + ripple       the pointer presses a button, a ripple spreads
 *   AI voice             equaliser bars pulse under the spoken caption
 *   Share (wide)         link · embed · MP4, one after another
 *   Any software         ERP, CRM, in-house tools orbit the app window
 *   Record or screenshot the two ways to start
 *
 * LAYOUT: 6-column grid on desktop with tiles of 4/2, 2/4, 3/3 columns;
 * 2 columns on tablets; 1 on phones. Every tile has the same visual height,
 * so rows line up.
 *
 * HOVER: a gradient border and a soft spotlight follow the pointer
 * (useSpotlight writes --mx/--my; the gradients live in HomeMotion.js).
 */

import {
  ZoomIn,
  MousePointerClick,
  AudioLines,
  Share2,
  MonitorPlay,
  Link2,
  Code2,
  Film,
  AppWindow,
  Database,
  Users,
  Wrench,
  Images,
} from 'lucide-react';
import { Reveal, SectionHeading, useSpotlight } from './HomeMotion';

function Pointer({ className = '' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M3 2 L3 19.5 L7.8 15.2 L11 22 L14.2 20.6 L11.1 13.9 L17.6 13.9 Z"
        fill="#ffffff"
        stroke="#111827"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ZoomArt() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl bg-[#f5f6fa] border border-black/5">
      {/* The camera: zooms toward the "Export" button */}
      <div className="hm-zoom absolute inset-0" style={{ transformOrigin: '80% 22%' }}>
        <div className="absolute inset-x-0 top-0 h-[14%] bg-[#1f2a44]" />
        <div className="absolute left-[5%] top-[22%] h-[7%] w-[30%] rounded bg-[#1f2a44]/70" />
        <div className="absolute left-[70%] top-[18%] w-[20%] h-[10%] rounded-md bg-accent flex items-center justify-center">
          <span className="text-[8px] font-semibold text-white">Export</span>
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="absolute left-[5%] right-[5%] h-[9%] rounded bg-white border border-[#dde1ea]"
            style={{ top: `${36 + i * 12}%` }}
          />
        ))}
        {/* Spotlight on the feature */}
        <div
          className="hm-spot absolute left-[69%] top-[16.5%] w-[22%] h-[13%] rounded-lg ring-2 ring-accent"
          style={{ boxShadow: '0 0 0 999px rgba(8,8,10,0.5)' }}
        />
      </div>
    </div>
  );
}

function ClickArt() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative">
        <div className="hm-press px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold shadow-glow">
          Approve
        </div>
        <span
          className="hm-ripple absolute left-1/2 top-1/2 w-16 h-16 rounded-full border-4 border-accent"
          aria-hidden="true"
        />
        <div className="absolute left-1/2 top-1/2 ml-1">
          <div className="hm-pointer">
            <Pointer className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.35)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function VoiceArt() {
  const bars = [0.5, 0.9, 0.65, 1, 0.45, 0.8, 0.6, 0.95, 0.5, 0.75, 0.4, 0.85];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4">
      <div className="flex items-end gap-1 h-12" aria-hidden="true">
        {bars.map((h, i) => (
          <span
            key={i}
            className="hm-eq w-1.5 rounded-full bg-gradient-to-t from-accent to-violet dark:to-violet-dark"
            style={{ height: `${h * 100}%`, animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
      <p className="max-w-[16rem] text-center text-xs font-medium text-ink dark:text-ink-soft-dark rounded-xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark px-3 py-2 shadow-sm">
        “Click Approve to send the order.”
      </p>
    </div>
  );
}

function ShareArt() {
  const items = [
    { Icon: Link2, label: 'Link', sub: 'Anyone can watch' },
    { Icon: Code2, label: 'Embed', sub: 'Wikis, help centres' },
    { Icon: Film, label: 'MP4 video', sub: 'With the voice' },
  ];
  return (
    <div className="absolute inset-0 grid grid-cols-3 gap-2 sm:gap-3 items-center px-1">
      {items.map(({ Icon, label, sub }, i) => (
        <div
          key={label}
          className="hm-pop rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark p-2.5 sm:p-4 text-center shadow-sm"
          style={{ animationDelay: `${i * 0.4}s` }}
        >
          <span className="mx-auto w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-accent to-violet text-white flex items-center justify-center shadow-glow">
            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
          </span>
          <p className="mt-2 text-xs sm:text-sm font-semibold text-ink dark:text-white">{label}</p>
          <p className="hidden sm:block text-[11px] text-ink-faint dark:text-ink-faint-dark">
            {sub}
          </p>
        </div>
      ))}
    </div>
  );
}

function AnySoftwareArt() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative w-36 h-36">
        {/* ERP · CRM · in-house tools orbiting the app window */}
        <div className="hm-orbit absolute inset-0" aria-hidden="true">
          {[Database, Users, Wrench].map((Icon, i) => (
            <span
              key={i}
              className="absolute w-9 h-9 -ml-[1.125rem] -mt-[1.125rem] rounded-full bg-panel dark:bg-panel-dark border border-line dark:border-line-dark flex items-center justify-center text-accent shadow-sm"
              style={{
                left: `${50 + 50 * Math.cos((i * 2 * Math.PI) / 3)}%`,
                top: `${50 + 50 * Math.sin((i * 2 * Math.PI) / 3)}%`,
              }}
            >
              <span className="hm-orbit-rev flex">
                <Icon className="w-4 h-4" />
              </span>
            </span>
          ))}
        </div>
        <span className="absolute inset-8 rounded-3xl bg-gradient-to-br from-accent to-violet text-white flex items-center justify-center shadow-glow">
          <AppWindow className="w-7 h-7" />
        </span>
      </div>
    </div>
  );
}

function RecordArt() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-3 px-2">
      <div className="flex-1 max-w-[9rem] rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark p-3 shadow-sm">
        <Images className="w-5 h-5 text-accent" />
        <p className="mt-2 text-xs font-semibold text-ink dark:text-white">Screenshots</p>
        <p className="text-[11px] text-ink-faint dark:text-ink-faint-dark">One per screen</p>
      </div>
      <span className="text-xs font-semibold text-ink-faint dark:text-ink-faint-dark">or</span>
      <div className="flex-1 max-w-[9rem] rounded-2xl border border-accent/40 bg-accent/5 dark:bg-accent/10 p-3 shadow-sm">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-danger hm-rec" />
          <span className="text-[11px] font-semibold tabular-nums text-ink dark:text-ink-soft-dark">
            REC
          </span>
        </span>
        <p className="mt-2 text-xs font-semibold text-ink dark:text-white">Record screen</p>
        <p className="text-[11px] text-ink-faint dark:text-ink-faint-dark">Do the task once</p>
      </div>
    </div>
  );
}

const TILES = [
  {
    Icon: ZoomIn,
    title: 'The camera zooms onto the feature',
    text: 'Viewers never hunt for the button — the page glides in and everything else dims.',
    Art: ZoomArt,
    span: 'sm:col-span-2 lg:col-span-4',
  },
  {
    Icon: MousePointerClick,
    title: 'It shows the click',
    text: 'A pointer moves to the exact spot and clicks, with a ripple.',
    Art: ClickArt,
    span: 'lg:col-span-2',
  },
  {
    Icon: AudioLines,
    title: 'A voice reads each step',
    text: 'A natural AI voice speaks your text, or record your own.',
    Art: VoiceArt,
    span: 'lg:col-span-2',
  },
  {
    Icon: Share2,
    title: 'Share it any way you like',
    text: 'A link that opens in any browser, an embed code for your help centre, or a video file.',
    Art: ShareArt,
    span: 'lg:col-span-4',
  },
  {
    Icon: AppWindow,
    title: 'Works with any software',
    text: 'ERP, CRM, web, desktop or in-house tools. If you can see it on screen, you can explain it.',
    Art: AnySoftwareArt,
    span: 'lg:col-span-3',
  },
  {
    Icon: MonitorPlay,
    title: 'Record your screen or use screenshots',
    text: 'Do the task once while recording and add steps where things happen — or start from images.',
    Art: RecordArt,
    span: 'sm:col-span-2 lg:col-span-3',
  },
];

function Tile({ tile, index }) {
  const onPointerMove = useSpotlight();
  const { Icon, title, text, Art, span } = tile;
  return (
    <Reveal delay={(index % 3) * 100} className={`${span} h-full`}>
      <div
        onPointerMove={onPointerMove}
        className="hm-tile group relative h-full rounded-3xl p-px bg-line dark:bg-line-dark shadow-premium transition-transform duration-300 hover:-translate-y-0.5"
      >
        {/* Gradient border that follows the pointer */}
        <div
          className="hm-tile-border absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          aria-hidden="true"
        />
        <div className="relative h-full rounded-[calc(1.5rem-1px)] bg-panel dark:bg-panel-dark overflow-hidden p-5 sm:p-6 flex flex-col">
          <div
            className="hm-tile-light absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            aria-hidden="true"
          />
          <div className="relative h-44 sm:h-48 mb-5" aria-hidden="true">
            <Art />
          </div>
          <div className="relative mt-auto flex gap-3">
            <span className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
              <Icon className="w-[18px] h-[18px]" />
            </span>
            <div>
              <h3 className="font-bold tracking-tight text-ink dark:text-white">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft dark:text-ink-faint-dark leading-relaxed">
                {text}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

export function FeatureBento() {
  return (
    <section>
      <SectionHeading
        eyebrow="Features"
        title="Everything a great walkthrough needs"
        intro="Built to explain one feature at a time — clearly, quickly, and in a way people actually watch."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {TILES.map((tile, i) => (
          <Tile key={tile.title} tile={tile} index={i} />
        ))}
      </div>
    </section>
  );
}
