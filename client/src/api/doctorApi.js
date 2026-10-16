import { request } from './axiosClient';

// a doctor only ever gets their own record back from this, so the caller does not filter by role
export async function listDoctors(params = {}) {
  const { data } = await request({ url: '/doctors', params });

  return data.doctors;
}

export async function getDoctor(id) {
  const { data } = await request({ url: `/doctors/${id}` });

  return data.doctor;
}

// the department filter chips on the scheduler read this
export async function listDepartments() {
  const { data } = await request({ url: '/departments' });

  return data.departments;
}

// creates the login and the profile together, which is why it takes an email and a password
export async function createDoctor(payload) {
  const { data } = await request({ url: '/doctors', method: 'post', data: payload });

  return data.doctor;
}

export async function createReceptionist(payload) {
  const { data, message } = await request({ url: '/users/receptionists', method: 'post', data: payload });

  return { user: data.user, message };
}

// replaces the slot length and the whole week in one call, the way the editor edits them
export async function updateDoctorSchedule(id, payload) {
  const { data } = await request({ url: `/doctors/${id}/schedule`, method: 'put', data: payload });

  return data.doctor;
}
