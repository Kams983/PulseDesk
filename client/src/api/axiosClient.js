import axios from 'axios';

const BASE_URL = '/api/v1';

// The access token lives in memory only, never in localStorage: script on the page (or an XSS payload)
// cannot read a value that was never persisted, and a reload restores the session from the httpOnly
// refresh cookie instead.
let accessToken = null;

// One refresh in flight at a time. When five requests expire at once they all await this same promise,
// so the server sees a single refresh and the queue behind it resumes together.
let refreshPromise = null;

// AuthContext registers here so a silent refresh updates React state, and a failed one clears it.
let handlers = {};

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setAuthHandlers(next) {
  handlers = next || {};
}

const axiosClient = axios.create({ baseURL: BASE_URL, withCredentials: true });

axiosClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthRoute = config && config.url && config.url.startsWith('/auth/');

    // An expired access token is the one 401 that is worth retrying: the cookie may still be good, so
    // refresh once and replay the original request. Everything else keeps its own error.
    if (response?.status !== 401 || isAuthRoute || config?._retried) {
      throw normalizeError(error);
    }

    config._retried = true;

    try {
      await refreshAccessToken();
    } catch (refreshError) {
      if (handlers.onExpired) {
        handlers.onExpired();
      }

      throw normalizeError(refreshError);
    }

    return axiosClient(config);
  }
);

// Every api module goes through this, so a component only ever receives data and meta, and an error
// only ever arrives as { message, code, details, status }.
export async function request(config) {
  const response = await axiosClient(config);

  return { data: response.data.data, meta: response.data.meta, message: response.data.message };
}

export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${BASE_URL}/auth/refresh`, null, { withCredentials: true })
      .then((response) => {
        accessToken = response.data.data.accessToken;

        if (handlers.onRefreshed) {
          handlers.onRefreshed(response.data.data.user);
        }

        return response.data.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

// A raw status code or a stack trace is never shown to a user: the shape here is what ErrorMessage and
// the form error banner render.
export function normalizeError(error) {
  const body = error.response?.data;

  return {
    message: body?.message || error.message || 'Something went wrong',
    code: body?.meta?.code,
    details: body?.meta?.details || [],
    status: error.response?.status,
  };
}
