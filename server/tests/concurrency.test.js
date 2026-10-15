const request = require('supertest');
const app = require('../src/app');
const { ACTIVE_STATUSES, APPOINTMENT_STATUS, ROLES } = require('../src/config/constants');
const Appointment = require('../src/models/appointment.model');
const Department = require('../src/models/department.model');
const Doctor = require('../src/models/doctor.model');
const Patient = require('../src/models/patient.model');
const User = require('../src/models/user.model');
const { hashPassword } = require('../src/services/authService');
const { nowInClinicTz } = require('../src/utils/time');

const SLOT = '09:00';
const BURST = 20;
const PASSWORD = 'Password123!';
const API = '/api/v1';

// a weekday that is still ahead, computed per run so the test can never go stale
function nextWeekday() {
  let day = nowInClinicTz().plus({ days: 1 });

  while (day.weekday > 5) {
    day = day.plus({ days: 1 });
  }

  return day.toISODate();
}

// the doctor works every day, so the burst has a grid whatever weekday the run lands on
function everyDaySchedule() {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    sessions: [{ start: '09:00', end: '12:00' }],
    breaks: [],
  }));
}

async function arrange() {
  const department = await Department.create({ name: 'General Medicine', code: 'GEN' });
  // this doctor never signs in, so the hash is not needed and bcrypt is only paid for the receptionist
  const doctorUser = await User.create({
    name: 'Dr. Test',
    email: 'dr.test@emr.test',
    passwordHash: 'not-a-real-hash',
    role: ROLES.DOCTOR,
  });
  const doctor = await Doctor.create({
    userId: doctorUser._id,
    departmentId: department._id,
    name: 'Dr. Test',
    nameLower: 'dr. test',
    slotDurationMinutes: 15,
    schedule: everyDaySchedule(),
  });

  // seeded away from the counter's range, otherwise the first generated code would collide with it
  const patient = await Patient.create({
    patientCode: 'PT-000900',
    name: 'Ada Nwosu',
    nameLower: 'ada nwosu',
    mobile: '08030000001',
  });

  await User.create({
    name: 'Front Desk',
    email: 'reception@emr.test',
    passwordHash: await hashPassword(PASSWORD),
    role: ROLES.RECEPTIONIST,
  });

  const login = await request(app).post(`${API}/auth/login`).send({ email: 'reception@emr.test', password: PASSWORD });

  return { doctor, patient, token: login.body.data.accessToken };
}

function book(doctorId, date, mobile, token) {
  return request(app)
    .post(`${API}/appointments`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      doctorId,
      date,
      startTime: SLOT,
      newPatient: { name: `Walk In ${mobile}`, mobile },
      purpose: 'Walk in',
    });
}

const activeForSlot = (doctorId, date) =>
  Appointment.countDocuments({ doctorId, date, startTime: SLOT, status: { $in: ACTIVE_STATUSES } });

describe('double booking guard', () => {
  it('lets exactly one of twenty parallel bookings win the slot', async () => {
    const { doctor, token } = await arrange();
    const date = nextWeekday();
    const mobiles = Array.from({ length: BURST }, (_, index) => `080311100${String(index).padStart(2, '0')}`);

    // Without this the unique index may not exist yet on a fresh database, and the test would pass
    // for the wrong reason: nothing would be enforcing the slot at all.
    await Appointment.init();

    const responses = await Promise.all(mobiles.map((mobile) => book(doctor._id, date, mobile, token)));

    const created = responses.filter((response) => response.status === 201);
    const conflicts = responses.filter((response) => response.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(BURST - 1);
    // a 500 anywhere here would mean the guard leaked, so nothing but these two outcomes is allowed
    expect(responses.filter((response) => ![201, 409].includes(response.status)).map((r) => [r.status, r.body.message])).toEqual([]);
    for (const conflict of conflicts) {
      expect(conflict.body.meta.code).toBe('CONFLICT');
    }

    expect(await activeForSlot(doctor._id, date)).toBe(1);
    expect(await Appointment.countDocuments({ doctorId: doctor._id, date, startTime: SLOT })).toBe(1);
    // the nineteen losers each registered a patient that must not survive the failed booking
    expect(await Patient.countDocuments({})).toBe(2);

    const winner = created[0].body.data.appointment;
    expect(winner.date).toBe(date);
    expect(winner.status).toBe(APPOINTMENT_STATUS.SCHEDULED);
    // the counter is incremented before the booking is attempted, so a rolled back booking leaves a
    // gap in the sequence. A gap is harmless, two patients sharing a code would not be.
    expect(winner.patient.patientCode).toMatch(/^PT-\d{6}$/);
    expect(winner.endTime).toBe('09:15');
  });

  it('reopens the slot once the winning appointment is cancelled', async () => {
    const { doctor, token } = await arrange();
    const date = nextWeekday();

    await Appointment.init();

    const first = await book(doctor._id, date, '08032220001', token);
    expect(first.status).toBe(201);

    // a second booking while the first is active must still lose
    const blocked = await book(doctor._id, date, '08032220002', token);
    expect(blocked.status).toBe(409);

    const cancelled = await request(app)
      .delete(`${API}/appointments/${first.body.data.appointment.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Patient called to cancel' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.appointment.status).toBe(APPOINTMENT_STATUS.CANCELLED);
    expect(cancelled.body.data.appointment.cancelReason).toBe('Patient called to cancel');

    // the cancelled row is out of the partial index, so the same slot is free again
    expect(await activeForSlot(doctor._id, date)).toBe(0);

    const again = await book(doctor._id, date, '08032220003', token);
    expect(again.status).toBe(201);
    expect(again.body.data.appointment.startTime).toBe(SLOT);

    expect(await activeForSlot(doctor._id, date)).toBe(1);
    // two rows exist, one cancelled as the record of the first visit and one that now holds the slot
    expect(await Appointment.countDocuments({ doctorId: doctor._id, date, startTime: SLOT })).toBe(2);
  });
});
