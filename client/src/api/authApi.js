import { request, refreshAccessToken, setAccessToken } from './axiosClient';

// The token is stored here the moment it arrives, so the interceptor can attach it to every later call
// without any component passing it around.
export async function login(email, password) {
  const { data } = await request({ url: '/auth/login', method: 'post', data: { email, password } });

  setAccessToken(data.accessToken);

  return data;
}

export async function logout() {
  try {
    await request({ url: '/auth/logout', method: 'post' });
  } finally {
    // the cookie is cleared server side, but the in memory token has to go even if that call failed
    setAccessToken(null);
  }
}

export async function me() {
  const { data } = await request({ url: '/auth/me' });

  return data.user;
}

export { refreshAccessToken };
