import { request } from './axiosClient';

// { scope, today, counts: { today, upcoming? }, doctor?, doctors? }. The today string is the client's
// only clock: the browser's own date is never used to decide what is past.
export async function getDashboard() {
  const { data } = await request({ url: '/dashboard' });

  return data;
}

// one entry per day ending today, zero filled
export async function getTrend(days = 7) {
  const { data } = await request({ url: '/dashboard/trend', params: { days } });

  return data;
}
