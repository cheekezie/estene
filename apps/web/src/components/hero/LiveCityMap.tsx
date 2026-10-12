'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { CheckCircle2, Truck } from 'lucide-react';

/**
 * Hero scene: one Estene rider doing a delivery round across a stylised
 * Abuja. Each leg the status card reads "Out for delivery"; on arrival it
 * flips to "Delivered" while the rider pauses, then the next leg starts.
 *
 * The rider and trail are moved by a requestAnimationFrame loop writing
 * straight to SVG attributes (no React re-render per frame); only the status
 * card goes through state. Reduced motion: rider parked, card static.
 */

type Stop = { name: string; at: [number, number] };
type Leg = { to: Stop; d: string };

const STOPS = {
  jabi: { name: 'Jabi', at: [58, 330] },
  asokoro: { name: 'Asokoro', at: [418, 258] },
  maitama: { name: 'Maitama', at: [330, 104] },
  garki: { name: 'Garki', at: [300, 400] },
  wuse: { name: 'Wuse', at: [128, 176] },
} satisfies Record<string, Stop>;

/** The round, in order. Each path starts where the previous one ended. */
const LEGS: Leg[] = [
  { to: STOPS.asokoro, d: 'M58 330 C 130 300, 170 250, 236 262 S 340 300, 418 258' },
  { to: STOPS.maitama, d: 'M418 258 C 430 200, 400 150, 330 104' },
  { to: STOPS.garki, d: 'M330 104 C 250 140, 210 250, 230 320 S 280 390, 300 400' },
  { to: STOPS.wuse, d: 'M300 400 C 230 380, 180 300, 200 250 S 150 190, 128 176' },
  { to: STOPS.jabi, d: 'M128 176 C 90 220, 60 270, 58 330' },
];

const SPEED = 42; // SVG units per second — slow and readable
const PAUSE_MS = 2600; // time on the "Delivered" card before the next leg
const MAX_TILT = 22; // degrees — a side-view bike leans, it never points at the sky

const DISTRICTS = [
  { x: 250, y: 60, w: 150, h: 90, label: 'MAITAMA' },
  { x: 60, y: 120, w: 140, h: 110, label: 'WUSE' },
  { x: 230, y: 340, w: 150, h: 110, label: 'GARKI' },
  { x: 16, y: 290, w: 120, h: 100, label: 'JABI' },
  { x: 350, y: 200, w: 112, h: 120, label: 'ASOKORO' },
];

type Status = { leg: number; phase: 'riding' | 'delivered' };

export function LiveCityMap() {
  const [status, setStatus] = useState<Status>({ leg: 0, phase: 'riding' });
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const trailRef = useRef<SVGPathElement>(null);
  const riderRef = useRef<SVGGElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let leg = 0;
    let legStart = performance.now();
    let pausedUntil = 0;
    let raf = 0;

    const place = (legIdx: number, t: number) => {
      const path = pathRefs.current[legIdx];
      if (!path || !riderRef.current || !trailRef.current) return;
      const len = path.getTotalLength();
      const at = len * t;
      const p = path.getPointAtLength(at);
      const ahead = path.getPointAtLength(Math.min(len, at + 2));
      const behind = path.getPointAtLength(Math.max(0, at - 2));
      const dx = ahead.x - behind.x;
      const dy = ahead.y - behind.y;
      const facingRight = dx >= 0;
      // Lean with the slope, mirrored when riding left, clamped so it stays a bike.
      const slope = (Math.atan2(dy, Math.abs(dx) || 0.001) * 180) / Math.PI;
      const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, slope)) * (facingRight ? 1 : -1);
      riderRef.current.setAttribute(
        'transform',
        `translate(${p.x} ${p.y}) rotate(${tilt}) scale(${facingRight ? 1 : -1} 1)`,
      );
      trailRef.current.setAttribute('d', path.getAttribute('d') ?? '');
      trailRef.current.style.strokeDashoffset = String(1 - t);
      if (progressRef.current) progressRef.current.style.width = `${Math.round(t * 100)}%`;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now < pausedUntil) return;
      if (pausedUntil) {
        // Pause over — start the next leg.
        pausedUntil = 0;
        leg = (leg + 1) % LEGS.length;
        legStart = now;
        setStatus({ leg, phase: 'riding' });
      }
      const len = pathRefs.current[leg]?.getTotalLength() ?? 1;
      const t = Math.min(1, (now - legStart) / ((len / SPEED) * 1000));
      place(leg, t);
      if (t >= 1) {
        pausedUntil = now + PAUSE_MS;
        setStatus({ leg, phase: 'delivered' });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const current = LEGS[status.leg]!;
  const delivered = status.phase === 'delivered';

  return (
    <div className="relative mx-auto w-full max-w-[480px]" aria-hidden>
      <div className="relative overflow-hidden rounded-[28px] bg-blue-900/40 ring-1 ring-white/10 backdrop-blur-sm">
        <svg viewBox="0 0 480 500" className="block w-full">
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0V24" fill="none" stroke="rgba(141,176,251,0.08)" strokeWidth="1" />
            </pattern>
          </defs>

          <rect width="480" height="500" fill="url(#grid)" />

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
            stroke="rgba(186,207,253,0.14)"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M210 0 C 220 160, 190 330, 230 500"
            stroke="rgba(186,207,253,0.14)"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
          />

          {/* the whole round as faint dotted guides */}
          {LEGS.map((l, i) => (
            <path
              key={i}
              ref={(el) => {
                pathRefs.current[i] = el;
              }}
              d={l.d}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="3"
              strokeDasharray="2 8"
              strokeLinecap="round"
            />
          ))}

          {/* current leg's trail, drawn up to the rider */}
          <path
            ref={trailRef}
            d={LEGS[0]!.d}
            fill="none"
            stroke="var(--color-amber-400)"
            strokeWidth="4"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset="0.5"
          />

          {/* stops: the current destination is highlighted */}
          {Object.values(STOPS).map((s) => {
            const active = s.name === current.to.name;
            return (
              <g key={s.name} transform={`translate(${s.at[0]} ${s.at[1]})`}>
                {active && <circle r="15" fill="var(--color-amber-400)" opacity="0.28" />}
                <circle
                  r={active ? 7 : 5}
                  fill="#fff"
                  stroke={active ? 'var(--color-amber-400)' : 'var(--color-blue-400)'}
                  strokeWidth={active ? 3.5 : 2.5}
                />
              </g>
            );
          })}

          {/* the rider — positioned by the animation loop; initial spot matches the reduced-motion pose */}
          <g ref={riderRef} transform="translate(236 262) rotate(-4)">
            <DeliveryRider />
          </g>
        </svg>

        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-blue-950/80 px-3 py-1.5 text-xs font-medium text-blue-100 ring-1 ring-white/10">
          <span className="size-2 rounded-full bg-emerald-400" />
          Live across Abuja
        </div>

        {/* Status callout pinned to the destination: out for delivery → delivered → next stop */}
        <StatusCallout
          key={`${status.leg}-${status.phase}`}
          stop={current.to}
          delivered={delivered}
          progressRef={progressRef}
        />
      </div>
    </div>
  );
}

const MAP_W = 480;
const MAP_H = 500;

/**
 * A small card anchored to a stop on the map, with a pointer to the pin. It
 * sits above the pin (below near the top edge) and hugs the side of the map
 * the pin is on, so it never spills outside the illustration.
 */
function StatusCallout({
  stop,
  delivered,
  progressRef,
}: {
  stop: Stop;
  delivered: boolean;
  progressRef: RefObject<HTMLSpanElement | null>;
}) {
  const [x, y] = stop.at;
  const below = y / MAP_H < 0.3;
  const align = x / MAP_W > 0.6 ? 'right' : x / MAP_W < 0.4 ? 'left' : 'center';
  const PIN_GAP = 16; // px between pin and card
  const shiftX = align === 'right' ? 'calc(-100% + 28px)' : align === 'left' ? '-28px' : '-50%';
  const shiftY = below ? `${PIN_GAP}px` : `calc(-100% - ${PIN_GAP}px)`;
  const pointerX =
    align === 'right'
      ? 'right-[22px]'
      : align === 'left'
        ? 'left-[22px]'
        : 'left-1/2 -translate-x-1/2';

  return (
    // Outer box owns the position transform; the inner one owns the fade-in (both use `transform`).
    <div
      className="absolute w-52"
      style={{
        left: `${(x / MAP_W) * 100}%`,
        top: `${(y / MAP_H) * 100}%`,
        transform: `translate(${shiftX}, ${shiftY})`,
      }}
    >
      <div className="status-swap relative rounded-xl bg-white text-slate-900 shadow-xl shadow-black/30">
        <span
          className={`absolute size-3 rotate-45 bg-white ${pointerX} ${below ? '-top-1.5' : '-bottom-1.5'}`}
        />
        <div className="relative flex items-center gap-2.5 p-2.5">
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-lg ${delivered ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-amber-950'}`}
          >
            {delivered ? <CheckCircle2 className="size-4.5" /> : <Truck className="size-4" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold leading-tight">
              {delivered ? `Delivered · ${stop.name}` : 'Out for delivery'}
            </span>
            <span className="block truncate text-[11px] text-slate-500">
              {delivered ? 'Handed over with PIN' : `Musa → ${stop.name}`}
            </span>
          </span>
        </div>
        <div className="relative h-1 overflow-hidden rounded-b-xl bg-slate-100">
          <span
            ref={progressRef}
            className={`block h-full ${delivered ? 'bg-emerald-500' : 'bg-amber-400'}`}
            style={{ width: delivered ? '100%' : '50%' }}
          />
        </div>
      </div>
    </div>
  );
}

function DeliveryRider() {
  return (
    <g transform="translate(-2 -2) scale(1.05)">
      {/* shadow */}
      <ellipse cx="0" cy="1.5" rx="27" ry="3" fill="rgba(0,0,0,0.25)" />

      {/* delivery box with the Estene mark */}
      <rect
        x="-31"
        y="-44"
        width="20"
        height="19"
        rx="3.5"
        fill="var(--color-amber-400)"
        stroke="#3b1a03"
        strokeOpacity="0.25"
      />
      <rect x="-27" y="-39.5" width="8" height="2" rx="1" fill="#fff" />
      <rect x="-27" y="-35.5" width="10" height="2" rx="1" fill="var(--color-blue-700)" />
      <rect x="-27" y="-31.5" width="8" height="2" rx="1" fill="#fff" />
      <rect x="-27" y="-39.5" width="2" height="10" rx="1" fill="#fff" />

      {/* scooter body */}
      <path
        d="M-27 -14 Q -28 -25 -16 -25 L 1 -25 Q 5 -25 5 -19 L 5 -14 Z"
        fill="var(--color-blue-600)"
      />
      <rect x="-22" y="-15" width="34" height="4.5" rx="2" fill="var(--color-blue-700)" />
      <path d="M7 -12 L 13 -34 L 19 -34 L 14 -12 Z" fill="var(--color-blue-500)" />
      <line
        x1="16.5"
        y1="-31"
        x2="19.5"
        y2="-7"
        stroke="#0f172a"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="-36.5"
        x2="19"
        y2="-37.5"
        stroke="#0f172a"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="20.5" cy="-30" r="2.2" fill="var(--color-amber-300)" />

      {/* wheels */}
      {[-18, 19.5].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="-7" r="7.5" fill="#0f172a" />
          <circle cx={cx} cy="-7" r="3" fill="#cbd5e1" />
        </g>
      ))}

      {/* rider: leg, torso, arm, helmet */}
      <path
        d="M-7 -28 L 3 -22 L 6 -15"
        fill="none"
        stroke="#1c2f6e"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M-7 -27 L -2 -42"
        fill="none"
        stroke="#1c338a"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M-1 -40 L 12.5 -36"
        fill="none"
        stroke="#1c338a"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="0.5" cy="-49" r="6.5" fill="#fff" />
      <path
        d="M2 -52 Q 7.5 -50.5 6.8 -46"
        fill="none"
        stroke="var(--color-blue-600)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </g>
  );
}
