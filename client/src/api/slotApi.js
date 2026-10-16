import { request } from './axiosClient';

// the generated grid for one doctor and one day, each slot marked available, booked or past
export async function listSlots(doctorId, date) {
  const { data, meta } = await request({ url: '/slots', params: { doctorId, date } });

  return { slots: data.slots, meta };
}
