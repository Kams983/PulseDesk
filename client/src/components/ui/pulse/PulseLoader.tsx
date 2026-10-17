// The PulseDesk startup screen.
//
// This is the screen you see while the api is cold starting and while a session is being restored. It is
// one centred column: a morphing line icon, the wordmark, a title that rolls like a slot machine, a
// subtitle, a stage bar and an elapsed timer. Everything else in the app waits behind it.
//
// The animation is a single GSAP timeline per stage change, and the stage changes are driven by real
// events: the health endpoint answering, the refresh call settling, the first screen loading and the
// socket connecting. Nothing advances on a timer alone, and no name, role or patient data is ever shown,
// because this renders before the session is known.
//
// Usage is in StartupScreen.tsx: the loader owns the sequence and hands the session back through
// onSession, which is what the app's auth context stores.

import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { CustomEase } from 'gsap/CustomEase';
import {
  ICONS,
  PATHS_PER_ICON,
  RING_CENTRE,
  STAGES,
  STALLED_STAGE,
  TITLE_LINES,
  stageIndexOf,
  type IconName,
  type Stage,
  type StageId,
} from './icons';
import { loadFirstScreen, pollHealth, restoreSession, type Session } from './startup';
import './pulse-loader.css';

gsap.registerPlugin(MorphSVGPlugin, CustomEase);

// the one movement the eye reads as this product's: a slow settle, not a bounce
const ROLL_EASE = CustomEase.create('pulseRoll', 'M0,0 C0.76,0 0.24,1 1,1');

const CYCLE = {
  icon: 0.6,
  iconStagger: 0.01,
  roll: 0.7,
  rollAt: 0.2,
  wipe: 0.3,
  wipeAt: 0.2,
  subAt: 0.75,
  sub: 0.12,
  minDwell: 1450,
  hold: 500,
  fastHold: 900,
  reducedDwell: 2500,
  reducedSwap: 0.3,
};

const IDLE = { travel: 1.6, pause: 0.4, ring: 2.4 };

// where each stroke flies off to when the screen fragments on the way out
const SCATTER = [
  [-16, -10],
  [14, -12],
  [-20, 8],
  [18, 10],
  [-8, -14],
  [20, 6],
  [-14, 12],
];

const CIRCLE_SIZE = 12;

// Live updates are the last stage and the only one the app can live without: if the socket cannot get
// through, the screen waits a little and then gets out of the way, because the person in front of it has
// work to do and the socket will keep trying on its own.
const LIVE_WAIT_CAP_MS = 6_000;

export type PulseLoaderProps = {
  /** Called once the exit animation has finished, with the screen the app should show next. */
  onComplete: (destination: 'app' | 'login') => void;
  /** How long the health check may take before the screen offers a retry. */
  timeoutMs?: number;
  /** Called when the person presses Retry. The loader restarts its own health poll as well. */
  onRetry?: () => void;
  /** Api base, without a trailing slash. Defaults to the versioned path the app itself uses. */
  apiBase?: string;
  /** Hands the restored session to the app. Null means there was no session to restore. */
  onSession?: (session: Session | null) => void;
  /** Resolves when live updates are connected. Omit it to skip that stage. */
  waitForLive?: () => Promise<void>;
};

export default function PulseLoader({
  onComplete,
  timeoutMs = 60_000,
  onRetry,
  apiBase = '/api/v1',
  onSession,
  waitForLive,
}: PulseLoaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<SVGSVGElement>(null);
  const ringRef = useRef<SVGGElement>(null);
  const highlightRef = useRef<SVGPathElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const maskRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const oldFillRef = useRef<HTMLSpanElement>(null);
  const newFillRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const circleRef = useRef<HTMLDivElement>(null);

  // everything the animation needs to know lives in refs: the ticker and the timelines read them, and
  // none of it belongs in React state, which would re-render the screen mid-morph
  const stageIndexRef = useRef(-1);
  const completedRef = useRef<StageId[]>([]);
  const finishedRef = useRef<'app' | 'login' | null>(null);
  const fastPathRef = useRef(false);
  const busyRef = useRef(false);
  const exitedRef = useRef(false);
  const wokeRef = useRef(false);
  const stalledRef = useRef(false);
  const reducedRef = useRef(false);
  const lastCycleAtRef = useRef(0);
  const mountedAtRef = useRef(0);
  const cycleRef = useRef<gsap.core.Timeline | null>(null);
  const idleRef = useRef<gsap.core.Timeline | null>(null);
  const spinRef = useRef<gsap.core.Tween | null>(null);
  const pollRef = useRef<{ stop: () => void } | null>(null);
  const healthyRef = useRef(false);
  const healthWaitRef = useRef<Promise<void> | null>(null);
  const healthResolveRef = useRef<(() => void) | null>(null);
  const runningRef = useRef(false);
  const walkedAwayRef = useRef(false);

  const onCompleteRef = useRef(onComplete);
  const onRetryRef = useRef(onRetry);
  const onSessionRef = useRef(onSession);
  const waitForLiveRef = useRef(waitForLive);

  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onRetryRef.current = onRetry;
    onSessionRef.current = onSession;
    waitForLiveRef.current = waitForLive;
  }, [onComplete, onRetry, onSession, waitForLive]);

  const paths = () => pathRefs.current.filter(Boolean) as SVGPathElement[];

  const latestCompletedIndex = () =>
    completedRef.current.reduce((highest, id) => Math.max(highest, stageIndexOf(id)), -1);

  // A stage is only drawn once its signal has arrived, so this is called by the sequence, never by a clock
  const complete = useCallback((id: StageId) => {
    if (!completedRef.current.includes(id)) {
      completedRef.current.push(id);
    }
  }, []);

  // The ring is an arc, so turning it around its own centre is visible. The centre moves between icons,
  // which is why it is passed in on every morph.
  const spinRing = useCallback((icon: IconName) => {
    if (reducedRef.current || !ringRef.current) {
      return;
    }

    const [cx, cy] = RING_CENTRE[icon];
    const origin = `${cx} ${cy}`;

    // The ring turns around a point that moves between icons (the badge on the right, the middle for the
    // pulse), so the tween is rebuilt on every morph. The transform has to be cleared first: starting a
    // second rotation tween on an element that is already rotated leaves the origin composed with the old
    // angle, and the ring drifts out of the icon instead of turning where it is.
    spinRef.current?.kill();
    gsap.set(ringRef.current, { clearProps: 'transform', svgOrigin: origin, rotation: 0 });
    spinRef.current = gsap.to(ringRef.current, {
      rotation: 360,
      duration: IDLE.ring,
      ease: 'none',
      repeat: -1,
      svgOrigin: origin,
    });
  }, []);

  // The bright segment that keeps travelling along the pulse line while the screen waits
  const startIdle = useCallback(() => {
    if (reducedRef.current || !highlightRef.current) {
      return;
    }

    idleRef.current?.kill();
    idleRef.current = gsap
      .timeline({ repeat: -1, repeatDelay: IDLE.pause })
      .fromTo(
        highlightRef.current,
        { strokeDashoffset: 0 },
        { strokeDashoffset: -100, duration: IDLE.travel, ease: 'none' }
      );
  }, []);

  const morphTo = (icon: IconName, timeline: gsap.core.Timeline, at: number) => {
    const target = ICONS[icon];

    paths().forEach((path, index) => {
      timeline.to(
        path,
        {
          morphSVG: { shape: target[index], shapeIndex: 'auto' },
          duration: CYCLE.icon,
          ease: 'power2.inOut',
        },
        at + index * CYCLE.iconStagger
      );
    });

    if (highlightRef.current) {
      timeline.to(
        highlightRef.current,
        { morphSVG: { shape: target[4], shapeIndex: 'auto' }, duration: CYCLE.icon, ease: 'power2.inOut' },
        at
      );
    }

    timeline.call(() => spinRing(icon), undefined, at);
  };

  // One timeline per stage change. intro is the first paint, which also grows the bar from its middle.
  const playCycle = useCallback(
    (targetIndex: number, asIntro = false) => {
      const stage: Stage = TITLE_LINES[targetIndex];
      const root = rootRef.current;
      const mask = maskRef.current;

      if (!root || !mask || !columnRef.current || !subtitleRef.current) {
        return;
      }

      const distance = mask.clientHeight;
      const timeline = gsap.timeline({
        onStart: () => {
          busyRef.current = true;
        },
        onComplete: () => {
          busyRef.current = false;
          lastCycleAtRef.current = performance.now();
        },
      });

      cycleRef.current = timeline;
      stageIndexRef.current = targetIndex;

      // the accent runs through the icon strokes, the glow and the bar, so it is animated in one place
      timeline.to(root, { '--pl-accent': stage.accent, duration: asIntro ? 0.5 : CYCLE.wipe, ease: 'power2.out' }, 0);

      morphTo(stage.icon, timeline, 0);

      timeline.to(
        columnRef.current,
        { y: -distance * targetIndex, duration: CYCLE.roll, ease: ROLL_EASE },
        asIntro ? 0 : CYCLE.rollAt
      );

      if (asIntro) {
        timeline.to(subtitleRef.current, { opacity: 1, duration: 0.3, ease: 'power1.out' }, 0);

        if (newFillRef.current && oldFillRef.current) {
          timeline
            .fromTo(
              newFillRef.current,
              { scaleX: 0, transformOrigin: 'center center', backgroundColor: stage.accent },
              { scaleX: 1, duration: 0.5, ease: 'power2.out' },
              0
            )
            .set(oldFillRef.current, { backgroundColor: stage.accent }, 0.5)
            .set(newFillRef.current, { scaleX: 0, transformOrigin: 'left center' }, 0.5);
        }
      } else {
        // the subtitle does not roll: it swaps once the title has nearly settled
        timeline
          .to(subtitleRef.current, { opacity: 0, duration: CYCLE.sub / 2 }, CYCLE.subAt)
          .call(() => {
            if (subtitleRef.current) {
              subtitleRef.current.textContent = stage.sub;
            }
          })
          .to(subtitleRef.current, { opacity: 1, duration: CYCLE.sub / 2 }, CYCLE.subAt + CYCLE.sub / 2);

        if (newFillRef.current && oldFillRef.current) {
          const accent = stage.accent;

          // the new colour wipes in from the left and pushes the old one out through the right
          timeline
            .set(newFillRef.current, { backgroundColor: accent, transformOrigin: 'left center', scaleX: 0 }, CYCLE.wipeAt)
            .to(newFillRef.current, { scaleX: 1, duration: CYCLE.wipe, ease: 'power2.inOut' }, CYCLE.wipeAt)
            .set(oldFillRef.current, { backgroundColor: accent }, CYCLE.wipeAt + CYCLE.wipe)
            .set(newFillRef.current, { scaleX: 0 }, CYCLE.wipeAt + CYCLE.wipe);
        }
      }

      if (stage.sub !== subtitleRef.current.textContent && asIntro) {
        subtitleRef.current.textContent = stage.sub;
      }
    },
    [spinRing]
  );

  // Reduced motion: no morph and no roll, just a crossfade between stages
  const crossfadeTo = useCallback((targetIndex: number) => {
    const stage = TITLE_LINES[targetIndex];
    const root = rootRef.current;
    const mask = maskRef.current;

    if (!root || !mask || !columnRef.current || !subtitleRef.current) {
      return;
    }

    busyRef.current = true;
    stageIndexRef.current = targetIndex;

    paths().forEach((path, index) => {
      path.setAttribute('d', ICONS[stage.icon][index]);
    });

    if (highlightRef.current) {
      highlightRef.current.setAttribute('d', ICONS[stage.icon][4]);
    }

    root.style.setProperty('--pl-accent', stage.accent);

    gsap
      .timeline({
        onComplete: () => {
          busyRef.current = false;
          lastCycleAtRef.current = performance.now();
        },
      })
      .to([mask, subtitleRef.current], { opacity: 0, duration: CYCLE.reducedSwap / 2 })
      .call(() => {
        if (columnRef.current) {
          gsap.set(columnRef.current, { y: -mask.clientHeight * targetIndex });
        }

        if (subtitleRef.current) {
          subtitleRef.current.textContent = stage.sub;
        }

        if (oldFillRef.current) {
          gsap.set(oldFillRef.current, { backgroundColor: stage.accent });
        }
      })
      .to([mask, subtitleRef.current], { opacity: 1, duration: CYCLE.reducedSwap / 2 });
  }, []);

  const playExit = useCallback((destination: 'app' | 'login') => {
    const root = rootRef.current;
    const circle = circleRef.current;
    const distance = maskRef.current?.clientHeight ?? 0;

    if (exitedRef.current || !root) {
      return;
    }

    exitedRef.current = true;

    const finish = () => onCompleteRef.current(destination);

    if (reducedRef.current) {
      // no circle to grow: the screen simply fades out from under the app
      gsap.to(root, { opacity: 0, duration: 0.3, ease: 'power1.out', onComplete: finish });

      return;
    }

    const spread = (2 * Math.hypot(window.innerWidth, window.innerHeight)) / CIRCLE_SIZE;
    const timeline = gsap.timeline({ onComplete: finish });

    cycleRef.current = timeline;
    idleRef.current?.kill();
    spinRef.current?.kill();

    timeline
      .to(columnRef.current, { y: `-=${distance}`, duration: 0.5, ease: 'power3.in' }, 0)
      .to(subtitleRef.current, { opacity: 0, y: -6, duration: 0.35, ease: 'power1.out' }, 0.1)
      .to(barRef.current, { scaleX: 0.06, duration: 0.4, ease: 'power2.inOut' }, 0.15)
      .to(
        paths(),
        {
          opacity: 0,
          x: (index: number) => SCATTER[index % SCATTER.length][0],
          y: (index: number) => SCATTER[index % SCATTER.length][1],
          duration: 0.25,
          stagger: 0.02,
          ease: 'power1.in',
        },
        0.2
      );

    if (highlightRef.current) {
      timeline.to(highlightRef.current, { opacity: 0, duration: 0.15 }, 0.2);
    }

    if (circle) {
      timeline.fromTo(circle, { scale: 0, opacity: 1 }, { scale: spread, duration: 0.6, ease: 'power3.inOut' }, 0.6);
    }
  }, []);

  // The rules for moving on: the next stage is drawn when its signal has arrived and the last change has
  // finished, and if several signals are already in, the jump goes straight to the latest one.
  const advance = useCallback(() => {
    if (exitedRef.current) {
      return;
    }

    const now = performance.now();

    if (busyRef.current) {
      return;
    }

    if (finishedRef.current) {
      const hold = fastPathRef.current ? CYCLE.fastHold : CYCLE.hold;

      if (now - lastCycleAtRef.current >= hold) {
        playExit(finishedRef.current);
      }

      return;
    }

    const dwell = reducedRef.current ? CYCLE.reducedDwell : CYCLE.minDwell;

    if (now - lastCycleAtRef.current < dwell) {
      return;
    }

    const target = Math.max(latestCompletedIndex(), stalledRef.current ? stageIndexOf('stalled') : -1);

    if (target > stageIndexRef.current) {
      if (reducedRef.current) {
        crossfadeTo(target);
      } else {
        playCycle(target);
      }
    }
  }, [crossfadeTo, playCycle, playExit]);

  // The wait is created by whoever needs it, not armed up front: an effect can run twice (React does that
  // on purpose in development) and a promise nobody kept would strand the sequence forever.
  const waitForHealth = useCallback(() => {
    if (healthyRef.current) {
      return Promise.resolve();
    }

    if (!healthWaitRef.current) {
      healthWaitRef.current = new Promise<void>((resolve) => {
        healthResolveRef.current = () => {
          healthWaitRef.current = null;
          healthResolveRef.current = null;
          resolve();
        };
      });
    }

    return healthWaitRef.current;
  }, []);

  // The health poll outlives any single attempt: it runs until the server answers, which is what makes
  // the retry button and the background wait the same thing.
  const startHealth = useCallback(() => {
    pollRef.current?.stop();

    pollRef.current = pollHealth(apiBase, () => {
      healthyRef.current = true;
      wokeRef.current = true;
      stalledRef.current = false;
      setStalled(false);
      complete('wake');
      healthResolveRef.current?.();

      // the server came back after the refresh call could not reach it: pick the sequence up again
      if (walkedAwayRef.current) {
        walkedAwayRef.current = false;
        runSequenceRef.current?.();
      }
    });
  }, [apiBase, complete]);

  // The sequence itself. One async function, reporting each stage as its signal arrives.
  const runSequence = useCallback(async () => {
    if (runningRef.current || finishedRef.current) {
      return;
    }

    runningRef.current = true;

    try {
      await waitForHealth();
      complete('wake');

      const restored = await restoreSession(apiBase, { attempts: 3, spacingMs: 1500 });

      if (restored.status === 'unreachable') {
        // no answer at all: the timeout state is the honest screen, and the poll keeps looking
        walkedAwayRef.current = true;

        return;
      }

      onSessionRef.current?.(restored.status === 'session' ? restored.session : null);
      complete('session');

      if (restored.status === 'none') {
        finishedRef.current = 'login';

        return;
      }

      await loadFirstScreen(apiBase, restored.session.accessToken);
      complete('schedule');

      await Promise.race([
        Promise.resolve(waitForLiveRef.current?.()).then(() => undefined),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, LIVE_WAIT_CAP_MS);
        }),
      ]);

      complete('live');
      finishedRef.current = 'app';
    } finally {
      runningRef.current = false;
    }
  }, [apiBase, complete, waitForHealth]);

  // kept in a ref so the health callback can restart the sequence without depending on it
  const runSequenceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    runSequenceRef.current = runSequence;
  }, [runSequence]);

  // Mount: seed the resting icon, wait for the fonts, then play the intro and start the clock
  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return undefined;
    }

    mountedAtRef.current = performance.now();
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const context = gsap.context(() => {
      if (reducedRef.current) {
        gsap.set(newFillRef.current, { scaleX: 1, backgroundColor: STAGES[0].accent });
        gsap.set(oldFillRef.current, { backgroundColor: STAGES[0].accent });
        gsap.set(subtitleRef.current, { opacity: 1 });
      } else {
        gsap.set(root, { '--pl-accent': STALLED_STAGE.accent });
        gsap.set([maskRef.current, subtitleRef.current], { opacity: 1 });
        gsap.set(subtitleRef.current, { opacity: 0 });
        gsap.set(columnRef.current, { y: () => maskRef.current?.clientHeight ?? 0 });
      }
    }, root);

    let cancelled = false;

    const intro = () => {
      if (cancelled) {
        return;
      }

      // a warm api that answered before the first paint goes straight to the last stage instead of
      // walking through the ones it skipped
      const target = Math.max(0, latestCompletedIndex());
      fastPathRef.current = finishedRef.current !== null && performance.now() - mountedAtRef.current < 1000;

      if (reducedRef.current) {
        crossfadeTo(target);
      } else {
        playCycle(target, true);
        startIdle();
      }
    };

    if (document.fonts?.ready) {
      document.fonts.ready.then(intro).catch(intro);
    } else {
      requestAnimationFrame(intro);
    }

    startHealth();

    runSequence().catch(() => {
      // a signal that never arrives is the timeout state's business, not an error to draw
    });

    return () => {
      cancelled = true;
      context.revert();
    };
  }, [crossfadeTo, playCycle, runSequence, startHealth, startIdle]);

  // The ticker only decides when the next timeline starts
  useEffect(() => {
    const id = window.setInterval(advance, 100);

    return () => window.clearInterval(id);
  }, [advance]);

  // The timer counts from the first paint of this screen and never restarts
  useEffect(() => {
    const started = performance.now();

    const tick = () => {
      if (timerRef.current) {
        timerRef.current.textContent = formatClock((performance.now() - started) / 1000);
      }
    };

    tick();

    const id = window.setInterval(tick, 1000);

    return () => window.clearInterval(id);
  }, []);

  // The retry state is the only thing on this screen that is React state, because it adds a control
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (wokeRef.current) {
        return;
      }

      stalledRef.current = true;
      setStalled(true);
    }, timeoutMs);

    return () => window.clearTimeout(id);
  }, [timeoutMs]);

  useEffect(
    () => () => {
      pollRef.current?.stop();
      cycleRef.current?.kill();
      idleRef.current?.kill();
      spinRef.current?.kill();
    },
    []
  );

  const retry = () => {
    // the poll is replaced and the sequence is asked for again, which now starts from health and picks up
    // the session and the rest as they answer
    startHealth();
    walkedAwayRef.current = false;

    runSequenceRef.current?.();
    onRetryRef.current?.();
  };

  return (
    <div className="pulse-loader" ref={rootRef} role="status" aria-live="polite">
      <div className="pulse-loader__stack">
        <div className="pulse-loader__mark">
          <span className="pulse-loader__glow" aria-hidden="true" />

          <svg
            className="pulse-loader__icon"
            ref={iconRef}
            viewBox="0 0 160 60"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            {Array.from({ length: PATHS_PER_ICON }, (_, index) => (
              <path
                key={index}
                className="pulse-loader__path"
                ref={(element) => {
                  pathRefs.current[index] = element;
                }}
                d={ICONS[STALLED_STAGE.icon][index]}
              />
            ))}

            {/* the ring sits above the strokes so its gap reads while it turns */}
            <g ref={ringRef} style={{ transformOrigin: '132px 30px' }}>
              <path className="pulse-loader__path" d={ICONS[STALLED_STAGE.icon][5]} />
            </g>

            <path
              className="pulse-loader__highlight"
              ref={highlightRef}
              d={ICONS[STALLED_STAGE.icon][4]}
              pathLength={100}
              strokeDasharray="12 88"
              aria-hidden="true"
            />
          </svg>
        </div>

        <p className="pulse-loader__wordmark" aria-hidden="true">
          PulseDesk
        </p>

        <div className="pulse-loader__title-mask" ref={maskRef} aria-hidden="true">
          <div className="pulse-loader__title-column" ref={columnRef}>
            {TITLE_LINES.map((stage) => (
              <span className="pulse-loader__title-line" key={stage.id}>
                {stage.title}
              </span>
            ))}
          </div>
        </div>

        <p className="pulse-loader__subtitle" ref={subtitleRef} aria-hidden="true">
          {STAGES[0].sub}
        </p>

        <div className="pulse-loader__bar" ref={barRef} aria-hidden="true">
          <span className="pulse-loader__bar-fill pulse-loader__bar-fill--old" ref={oldFillRef} />
          <span className="pulse-loader__bar-fill pulse-loader__bar-fill--new" ref={newFillRef} />
        </div>

        <span className="pulse-loader__timer" ref={timerRef} aria-hidden="true">
          0:00
        </span>

        {stalled ? (
          <button className="pulse-loader__retry" type="button" onClick={retry}>
            Retry
          </button>
        ) : null}
      </div>

      {/* the only thing a screen reader is told, once, and again if the server never answers */}
      <span className="pulse-loader__announce">
        {stalled ? STALLED_STAGE.title : 'Restoring your session'}
      </span>

      <div className="pulse-loader__circle" ref={circleRef} aria-hidden="true" />
    </div>
  );
}

function formatClock(seconds: number) {
  const whole = Math.floor(seconds);

  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
