import { request } from './axiosClient';

// filters, sorting and paging all live in the query string, so the list page never fetches everything
export async function listAppointments(params = {}) {
  const { data, meta } = await request({ url: '/appointments', params });

  return { appointments: data.appointments, meta };
}

export async function getAppointment(id) {
  const { data } = await request({ url: `/appointments/${id}` });

  return data.appointment;
}

export async function createAppointment(payload) {
  const { data } = await request({ url: '/appointments', method: 'post', data: payload });

  return data.appointment;
}

export async function updateAppointment(id, payload) {
  const { data } = await request({ url: `/appointments/${id}`, method: 'put', data: payload });

  return data.appointment;
}

export async function cancelAppointment(id, reason) {
  const { data } = await request({ url: `/appointments/${id}`, method: 'delete', data: { reason } });

  return data.appointment;
}

export async function arriveAppointment(id) {
  const { data } = await request({ url: `/appointments/${id}/arrive`, method: 'post' });

  return data.appointment;
}

export async function completeAppointment(id) {
  const { data } = await request({ url: `/appointments/${id}/complete`, method: 'post' });

  return data.appointment;
}
