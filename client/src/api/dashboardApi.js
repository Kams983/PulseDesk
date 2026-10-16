import { request } from './axiosClient';

// { scope, today, counts: { today, upcoming? }, doctor?, doctors?, byDoctor?, next? }. The today string
// is the client's only clock: the browser's own date is never used to decide what is past, and which of
// the extra fields come back depends on who is asking.
export async function getDashboard() {
  const { data } = await request({ url: '/dashboard' });

  return data;
}

// one entry per day ending today, zero filled
export async function getTrend(days = 7) {
  const { data } = await request({ url: '/dashboard/trend', params: { days } });

  return data;
}

// one entry per day of one month, zero filled, which is what the calendar dots read
export async function getCalendar(month) {
  const { data } = await request({ url: '/dashboard/calendar', params: { month } });

  return data;
}
