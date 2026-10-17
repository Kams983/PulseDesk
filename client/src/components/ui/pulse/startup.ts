// The three calls the loader makes on its way in, written as signals rather than as a checklist: each one
// resolves when the thing it waits for is actually true, so the stages on screen mean something.
//
// The loader owns the order and the timing. This file only knows how to wait.

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type Session = {
  accessToken: string;
  user: SessionUser;
};

// A cold server can accept a connection and then answer nothing, so every attempt is abandoned rather
// than left hanging, and the next one starts two seconds later.
const HEALTH_ATTEMPT_TIMEOUT_MS = 8_000;
const HEALTH_SPACING_MS = 2_000;

export type HealthPoll = { stop: () => void };

export function pollHealth(apiBase: string, onHealthy: () => void): HealthPoll {
  let stopped = false;
  let timer: number | undefined;

  const attempt = async () => {
    if (stopped) {
      return;
    }

    try {
      const response = await fetch(`${apiBase}/health`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(HEALTH_ATTEMPT_TIMEOUT_MS),
      });

      if (stopped) {
        return;
      }

      if (response.ok) {
        stopped = true;
        onHealthy();

        return;
      }
    } catch {
      // a refused connection, a timeout and a 502 from the proxy all mean the same thing here: try again
    }

    if (!stopped) {
      timer = window.setTimeout(attempt, HEALTH_SPACING_MS);
    }
  };

  attempt();

  return {
    stop() {
      stopped = true;

      if (timer) {
        window.clearTimeout(timer);
      }
    },
  };
}

// Three different answers, which the loader treats three different ways. A session means carry on. No
// session means the app opens on the login page. Unreachable is not an answer at all, so it is never
// allowed to look like one: the screen goes to its timeout state and keeps looking.
export type RestoreResult =
  | { status: 'session'; session: Session }
  | { status: 'none' }
  | { status: 'unreachable' };

type RestoreOptions = {
  attempts?: number;
  spacingMs?: number;
};

export async function restoreSession(apiBase: string, options: RestoreOptions = {}): Promise<RestoreResult> {
  const { attempts = 3, spacingMs = 1_500 } = options;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      // the one status that means something definite: this browser is not signed in
      if (response.status === 401) {
        return { status: 'none' };
      }

      if (response.ok) {
        const body = await response.json();

        return { status: 'session', session: { accessToken: body.data.accessToken, user: body.data.user } };
      }

      // a 4xx the api chose to send is still an answer: treat it like no session rather than retrying
      if (response.status < 500) {
        return { status: 'none' };
      }
    } catch {
      // offline, or the api went away between the health check and this call
    }

    if (attempt < attempts) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, spacingMs);
      });
    }
  }

  return { status: 'unreachable' };
}

// The first screen the app will show, warmed before it is shown. Both requests are settled rather than
// awaited in sequence, and a failure here still counts as the stage being over: the page can retry its
// own data, and a slow dashboard request should not hold the loader.
export async function loadFirstScreen(apiBase: string, accessToken: string) {
  const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}` };

  await Promise.allSettled([
    fetch(`${apiBase}/auth/me`, { headers }),
    fetch(`${apiBase}/dashboard`, { headers }),
  ]);
}
