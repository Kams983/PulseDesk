import { useId } from 'react';

// The product is called PulseDesk and its mark is a heartbeat, so the one loader in the app is a
// heartbeat too: a ring sweeps, a core breathes, a trace travels and a ping widens. It is drawn in
// currentColor and with a plain SVG, so the same shape works at 14px inside a button and at 340px on
// the boot screen, and nothing here depends on a canvas or a third party animation library.
//
// Two shapes share the vocabulary:
//   PulseMark  the compact orb, for a button, a pill or a small status row
//   PulseTrace the wide trace that carries the orb across the screen, for the moments worth a screen

const PING_SECONDS = 2.8;

// one sweep gradient reused by both shapes: transparent at the tail, solid at the head
function SweepGradient({ id }) {
  return (
    <linearGradient id={id} x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
      <stop stopColor="currentColor" stopOpacity="0" />
      <stop offset="0.55" stopColor="currentColor" stopOpacity="0.35" />
      <stop offset="1" stopColor="currentColor" />
    </linearGradient>
  );
}

export function PulseMark({ size = 24, className = '' }) {
  // useId keeps two loaders on one page from sharing (and overwriting) each other's gradients
  const raw = useId().replace(/:/g, '');
  const ids = { sweep: `astra-sweep-${raw}`, halo: `astra-halo-${raw}` };
  // below about 24px the orbit dot and the second ping collapse into noise, so the small size is
  // deliberately reduced rather than squashed
  const detailed = size >= 24;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <SweepGradient id={ids.sweep} />
        <radialGradient id={ids.halo}>
          <stop stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* the light the orb sits in, breathing just out of step with the core */}
      <circle cx="32" cy="32" r="30" fill={`url(#${ids.halo})`} className="astra-origin animate-astra-breathe" />

      <circle cx="32" cy="32" r="26" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.6" />

      <g className="astra-origin animate-astra-sweep">
        <circle
          cx="32"
          cy="32"
          r="26"
          stroke={`url(#${ids.sweep})`}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray="40 124"
        />
      </g>

      {detailed ? (
        <g className="astra-origin animate-astra-orbit">
          <circle cx="32" cy="6" r="1.8" fill="currentColor" fillOpacity="0.7" />
        </g>
      ) : null}

      {size >= 20 ? (
        <circle
          cx="32"
          cy="32"
          r="10"
          stroke="currentColor"
          strokeOpacity="0.5"
          strokeWidth="1.2"
          className="astra-origin animate-astra-ping"
        />
      ) : null}
      {detailed ? (
        <circle
          cx="32"
          cy="32"
          r="10"
          stroke="currentColor"
          strokeOpacity="0.5"
          strokeWidth="1.2"
          className="astra-origin animate-astra-ping"
          style={{ animationDelay: `${PING_SECONDS / 2}s` }}
        />
      ) : null}

      <circle
        cx="32"
        cy="32"
        r="3.6"
        fill="currentColor"
        className="astra-origin animate-astra-breathe"
        style={{ animationDelay: '-1.4s' }}
      />
    </svg>
  );
}

// The wide version: the same orb, with a heartbeat running through it and out to both edges. The base
// line is always there so the shape reads even before the animation starts, and the comet is a single
// lit dash travelling along it.
// The complex sits across the middle so the beat happens inside the orb rather than beside it.
const TRACE_PATH = 'M4 55 H140 L148 45 L155 63 L164 22 L174 88 L182 47 L189 55 H336';

export default function PulseTrace({ className = '' }) {
  const raw = useId().replace(/:/g, '');
  const ids = {
    sweep: `astra-sweep-${raw}`,
    halo: `astra-halo-${raw}`,
    fade: `astra-fade-${raw}`,
    mask: `astra-mask-${raw}`,
  };

  return (
    <svg viewBox="0 0 340 110" fill="none" aria-hidden="true" className={className}>
      <defs>
        <SweepGradient id={ids.sweep} />
        <radialGradient id={ids.halo}>
          <stop stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="0.55" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        {/* The line has to wrap somewhere to loop, and the seam is at the left end. Fading both ends
            out hides it: the beat arrives out of nothing and leaves the same way. */}
        <linearGradient id={ids.fade} x1="0" y1="0" x2="340" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.1" stopColor="#FFFFFF" />
          <stop offset="0.92" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <mask id={ids.mask} maskUnits="userSpaceOnUse" x="0" y="0" width="340" height="110">
          <rect width="340" height="110" fill={`url(#${ids.fade})`} />
        </mask>
      </defs>

      <circle cx="170" cy="55" r="56" fill={`url(#${ids.halo})`} className="astra-origin animate-astra-breathe" />

      {/* the line the heartbeat runs along: quiet enough to sit under the orb, not compete with it */}
      <g mask={`url(#${ids.mask})`}>
        <path
          d={TRACE_PATH}
          stroke="currentColor"
          strokeOpacity="0.16"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={TRACE_PATH}
          pathLength="100"
          className="astra-comet animate-astra-trace"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="14 86"
        />
      </g>

      <circle cx="170" cy="55" r="30" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.6" />
      <g className="astra-origin animate-astra-sweep">
        <circle
          cx="170"
          cy="55"
          r="30"
          stroke={`url(#${ids.sweep})`}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="46 142"
        />
      </g>

      <g className="astra-origin animate-astra-orbit">
        <circle cx="170" cy="25" r="2" fill="currentColor" fillOpacity="0.75" />
      </g>

      <circle
        cx="170"
        cy="55"
        r="13"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.3"
        className="astra-origin animate-astra-ping"
      />
      <circle
        cx="170"
        cy="55"
        r="13"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.3"
        className="astra-origin animate-astra-ping"
        style={{ animationDelay: `${PING_SECONDS / 2}s` }}
      />

      <circle
        cx="170"
        cy="55"
        r="3.6"
        fill="currentColor"
        className="astra-origin animate-astra-breathe"
        style={{ animationDelay: '-1.4s' }}
      />
    </svg>
  );
}

