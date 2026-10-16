import { request } from './axiosClient';

// one box: a PT- code, a mobile number or a name, decided by the shape of the term
export async function searchPatients(term) {
  const { data, meta } = await request({ url: '/patients', params: { q: term } });

  return { patients: data.patients, meta };
}

export async function getPatient(id) {
  const { data } = await request({ url: `/patients/${id}` });

  return data.patient;
}
