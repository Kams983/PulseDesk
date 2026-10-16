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
