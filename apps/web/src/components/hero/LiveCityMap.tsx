import { Check, KeyRound, Package, Truck } from 'lucide-react';

/**
 * The hero scene: a stylised Abuja with riders moving along their routes,
 * each trail drawing in behind them and the drop-off pin pulsing. Pure SVG +
 * CSS (SMIL animateMotion for the riders), so it costs no JavaScript and
 * freezes for people who prefer reduced motion (see globals.css).
 */

type Route = { id: string; d: string; dur: number; begin: number; to: [number, number] };

const ROUTES: Route[] = [
  { id: 'r1', d: 'M120 168 C 170 220, 200 300, 300 382', dur: 7, begin: 0, to: [300, 382] }, // Wuse → Garki
  { id: 'r2', d: 'M78 326 C 150 296, 220 196, 334 112', dur: 9, begin: 1.5, to: [334, 112] }, // Jabi → Maitama
  { id: 'r3', d: 'M404 300 C 336 320, 244 248, 150 232', dur: 8, begin: 3, to: [150, 232] }, // Asokoro → Wuse
];

const DISTRICTS = [
  { x: 250, y: 60, w: 150, h: 90, label: 'MAITAMA' },
  { x: 60, y: 120, w: 140, h: 120, label: 'WUSE' },
  { x: 230, y: 330, w: 150, h: 110, label: 'GARKI' },
  { x: 20, y: 280, w: 110, h: 100, label: 'JABI' },
  { x: 350, y: 250, w: 110, h: 110, label: 'ASOKORO' },
];

export function LiveCityMap() {
  return (
    <div className="relative mx-auto w-full max-w-[480px]" aria-hidden>
      <div className="relative overflow-hidden rounded-[28px] bg-blue-900/40 ring-1 ring-white/10 backdrop-blur-sm">
        <svg viewBox="0 0 480 500" className="block w-full">
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0V24" fill="none" stroke="rgba(141,176,251,0.08)" strokeWidth="1" />
            </pattern>
            <g id="rider">
              <circle r="15" fill="var(--color-amber-400)" stroke="#fff" strokeWidth="3" />
              {/* bike glyph */}
              <circle cx="-5" cy="3" r="3.2" fill="none" stroke="#3b1a03" strokeWidth="1.8" />
              <circle cx="5.5" cy="3" r="3.2" fill="none" stroke="#3b1a03" strokeWidth="1.8" />
              <path
                d="M-5 3 L-1 -4 H4 L5.5 3 M-1 -4 L1.5 3"
                fill="none"
                stroke="#3b1a03"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </defs>

          <rect width="480" height="500" fill="url(#grid)" />

          {/* districts */}
          {DISTRICTS.map((d) => (
            <g key={d.label}>
              <rect
                x={d.x}
                y={d.y}
                width={d.w}
                height={d.h}
                rx="18"
                fill="rgba(31,71,214,0.28)"
                stroke="rgba(141,176,251,0.18)"
              />
              <text
                x={d.x + 14}
                y={d.y + 24}
                fill="rgba(186,207,253,0.55)"
                fontSize="10"
                fontWeight="700"
                letterSpacing="2"
              >
                {d.label}
              </text>
            </g>
          ))}

          {/* arterial roads */}
          <path
            d="M0 250 C 120 240, 300 260, 480 210"
            stroke="rgba(186,207,253,0.16)"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M210 0 C 220 160, 190 330, 230 500"
            stroke="rgba(186,207,253,0.16)"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
          />

          {ROUTES.map((r) => (
            <g key={r.id}>
              {/* full route, faint */}
              <path
                id={r.id}
                d={r.d}
                fill="none"
                stroke="rgba(255,255,255,0.14)"
                strokeWidth="3"
                strokeDasharray="2 7"
                strokeLinecap="round"
              />
              {/* trail drawing in behind the rider */}
              <path
                d={r.d}
                fill="none"
                stroke="var(--color-amber-400)"
                strokeWidth="3.5"
                strokeLinecap="round"
                pathLength={1}
                className="route-trail"
                style={{ animationDuration: `${r.dur}s`, animationDelay: `-${r.begin}s` }}
              />
              {/* drop-off pin */}
              <g transform={`translate(${r.to[0]} ${r.to[1]})`}>
                <circle
                  r="16"
                  fill="var(--color-amber-400)"
                  opacity="0.35"
                  className="pin-pulse"
                  style={{ animationDelay: `-${r.begin}s` }}
                />
                <circle r="6" fill="#fff" stroke="var(--color-amber-400)" strokeWidth="3" />
              </g>
              <use href="#rider" className="rider-marker">
                {/* Negative begin = already mid-route on load, so no rider ever sits at the SVG origin. */}
                <animateMotion dur={`${r.dur}s`} begin={`-${r.begin}s`} repeatCount="indefinite">
                  <mpath href={`#${r.id}`} />
                </animateMotion>
              </use>
            </g>
          ))}
        </svg>

        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-blue-950/80 px-3 py-1.5 text-xs font-medium text-blue-100 ring-1 ring-white/10">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          Live across Abuja
        </div>
      </div>

      {/* Status notifications cycle like the SMS updates customers receive */}
      <div className="pointer-events-none absolute -bottom-6 -left-4 w-64 sm:-left-10">
        <Notice
          icon={Package}
          tone="blue"
          title="Picked up · Wuse II"
          body="EST7K3M9 tagged and on its way"
          delay={0}
        />
        <Notice
          icon={Truck}
          tone="amber"
          title="Out for delivery"
          body="Musa is heading to Garki II"
          delay={4}
        />
        <Notice
          icon={KeyRound}
          tone="green"
          title="Delivered ✓"
          body="Handed over with PIN 4821"
          delay={8}
          done
        />
      </div>
    </div>
  );
}

function Notice({
  icon: Icon,
  tone,
  title,
  body,
  delay,
  done,
}: {
  icon: typeof Package;
  tone: 'blue' | 'amber' | 'green';
  title: string;
  body: string;
  delay: number;
  done?: boolean;
}) {
  const toneClass = {
    blue: 'bg-blue-600 text-white',
    amber: 'bg-amber-400 text-amber-950',
    green: 'bg-emerald-500 text-white',
  }[tone];
  return (
    <div
      className="hero-notice absolute inset-x-0 bottom-0 flex items-center gap-3 rounded-2xl bg-white p-3 text-slate-900 shadow-2xl shadow-black/30"
      style={{ animationDelay: `${delay}s` }}
    >
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${toneClass}`}>
        {done ? <Check className="size-5" /> : <Icon className="size-4.5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-slate-500">{body}</span>
      </span>
    </div>
  );
}
