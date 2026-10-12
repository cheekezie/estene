import { Truck } from 'lucide-react';

/**
 * Hero scene: a stylised Abuja with one Estene rider travelling a single
 * route while the trail draws in behind them. Deliberately calm — one moving
 * thing, everything else static. Pure SVG (SMIL animateMotion), no JS.
 */

// Jabi → across the city → Asokoro. Mostly left-to-right so the side-view rider always faces forward.
const ROUTE = 'M58 330 C 130 300, 170 250, 236 262 S 340 300, 418 258';
const START: [number, number] = [58, 330];
const END: [number, number] = [418, 258];
const DURATION_S = 12;

const DISTRICTS = [
  { x: 250, y: 60, w: 150, h: 90, label: 'MAITAMA' },
  { x: 60, y: 120, w: 140, h: 110, label: 'WUSE' },
  { x: 230, y: 340, w: 150, h: 110, label: 'GARKI' },
  { x: 16, y: 290, w: 120, h: 100, label: 'JABI' },
  { x: 350, y: 200, w: 112, h: 120, label: 'ASOKORO' },
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
            <path id="route" d={ROUTE} />
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

          {/* the route: faint dotted guide + amber trail that draws in with the rider */}
          <use
            href="#route"
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="3"
            strokeDasharray="2 8"
            strokeLinecap="round"
          />
          <path
            d={ROUTE}
            fill="none"
            stroke="var(--color-amber-400)"
            strokeWidth="4"
            strokeLinecap="round"
            pathLength={1}
            className="route-trail"
            style={{ animationDuration: `${DURATION_S}s` }}
          />

          {/* pickup + drop-off pins (static) */}
          <circle
            cx={START[0]}
            cy={START[1]}
            r="6"
            fill="#fff"
            stroke="var(--color-blue-400)"
            strokeWidth="3"
          />
          <g transform={`translate(${END[0]} ${END[1]})`}>
            <circle r="15" fill="var(--color-amber-400)" opacity="0.25" />
            <circle r="7" fill="#fff" stroke="var(--color-amber-400)" strokeWidth="3.5" />
          </g>

          {/* the rider — fades in at pickup, rides the route, fades out at drop-off */}
          <g className="rider-moving">
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              keyTimes="0;0.06;0.9;1"
              dur={`${DURATION_S}s`}
              repeatCount="indefinite"
            />
            <g>
              <animateMotion dur={`${DURATION_S}s`} repeatCount="indefinite" rotate="auto">
                <mpath href="#route" />
              </animateMotion>
              <DeliveryRider />
            </g>
          </g>

          {/* reduced motion: the rider parked mid-route instead */}
          <g className="rider-static" transform="translate(236 262) rotate(-4)">
            <DeliveryRider />
          </g>
        </svg>

        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-blue-950/80 px-3 py-1.5 text-xs font-medium text-blue-100 ring-1 ring-white/10">
          <span className="size-2 rounded-full bg-emerald-400" />
          Live across Abuja
        </div>
      </div>

      {/* One fixed status card — what the customer sees by SMS */}
      <div className="absolute -bottom-6 -left-4 flex w-64 items-center gap-3 rounded-2xl bg-white p-3 text-slate-900 shadow-2xl shadow-black/30 sm:-left-10">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-400 text-amber-950">
          <Truck className="size-4.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Out for delivery</span>
          <span className="block truncate text-xs text-slate-500">Musa is heading to Asokoro</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Side view of an Estene rider on a delivery scooter, facing right.
 * Origin = point between the wheels on the road, so it sits on the route.
 */
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
