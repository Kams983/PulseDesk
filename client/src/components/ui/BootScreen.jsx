import { useEffect, useState } from 'react';
import PulseTrace from './PulseMark';
import { APP_NAME } from '@/utils/constants';

// One screen for every wait that is longer than a click: restoring a session after a reload, and the
// stretch where a sleeping api has to wake up before it can answer. It says what is happening in plain
// words and, after a while, admits how long it has been so a cold start is not mistaken for a hang.

const WAKING_AFTER = 5;
const COLD_START_AFTER = 15;
const STALLED_AFTER = 40;

function stageFor(seconds) {
  if (seconds >= STALLED_AFTER) {
    return 'The server has not answered yet';
  }

  if (seconds >= COLD_START_AFTER) {
    return 'A cold start can take up to a minute';
  }

  if (seconds >= WAKING_AFTER) {
    return 'Waking the server';
  }

  return 'Connecting to the clinic server';
}

function useElapsed(active) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const startedAt = Date.now();
    const tick = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);

    return () => clearInterval(tick);
  }, [active]);

  return seconds;
}

export default function BootScreen({
  label = 'Restoring your session',
  note,
  overlay = false,
  timed = true,
  className = '',
}) {
  const seconds = useElapsed(timed);
  const showTimer = timed && seconds >= WAKING_AFTER;
  const isStalled = timed && seconds >= STALLED_AFTER;
  const status = note || stageFor(seconds);

  return (
    <div
      role="status"
      aria-live="polite"
      // `relative` and `fixed` cannot both be in one list: whichever Tailwind emits later wins, and the
      // overlay has to be fixed or it only covers a strip of the page
      className={`${
        overlay
          ? 'fixed inset-0 z-[60] animate-astra-rise bg-page/90 backdrop-blur-md'
          : 'relative min-h-screen bg-page'
      } flex flex-col items-center justify-center px-6 ${className}`}
    >
      {/* a pool of white behind the trace, so the indigo reads as lit rather than printed */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_48%_at_50%_40%,#FFFFFF_0%,rgba(255,255,255,0)_72%)]"
      />

      <div className="relative flex w-full max-w-[26rem] flex-col items-center text-center">
        <PulseTrace className={`w-full text-primary ${overlay ? 'max-w-[16rem]' : ''}`} />

        <p className="mt-6 text-[0.65rem] font-bold uppercase tracking-[0.46em] text-primary/60">{APP_NAME}</p>

        <h1 className="mt-4 text-base font-semibold tracking-tight text-ink">{label}</h1>
        {/* reserved height: the line changes as the wait goes on and must not shift the trace above it */}
        <p className="mt-1.5 min-h-[1.25rem] text-sm text-ink-muted">{status}</p>

        <div aria-hidden="true" className="mt-7 h-px w-36 overflow-hidden rounded-pill bg-line">
          <span className="block h-px w-1/3 rounded-pill bg-primary animate-astra-shimmer" />
        </div>

        <div className="mt-3 flex h-6 items-center gap-3">
          {showTimer ? (
            <span className="font-mono text-xs tabular-nums text-ink-muted/80">{formatClock(seconds)}</span>
          ) : null}

          {isStalled ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-control text-xs font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition hover:text-primary-hover"
            >
              Reload
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatClock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
