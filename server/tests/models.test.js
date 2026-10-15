const mongoose = require('mongoose');
const models = require('../src/models');
const { ACTIVE_STATUSES, ALLOWED_TRANSITIONS, APPOINTMENT_STATUS, ROLES } = require('../src/config/constants');

const patientId = new mongoose.Types.ObjectId();
const doctorId = new mongoose.Types.ObjectId();
const departmentId = new mongoose.Types.ObjectId();

const baseAppointment = {
  patientId,
  doctorId,
  departmentId,
  date: '2026-11-02',
  startTime: '09:00',
  endTime: '09:15',
};

beforeAll(async () => {
  // build the indexes up front, otherwise the first write races the index creation
  await Promise.all(Object.values(models).map((model) => model.syncIndexes()));
});

describe('models', () => {
  it('loads all seven of them', () => {
    expect(Object.keys(models)).toEqual([
      'User',
      'RefreshToken',
      'Department',
      'Doctor',
      'Patient',
      'Appointment',
      'AuditLog',
    ]);
  });

  it('enforces unique email and unique mobile', async () => {
    await models.User.create({ name: 'Ada', email: 'ada@clinic.test', passwordHash: 'hash', role: ROLES.RECEPTIONIST });
    await models.Patient.create({ patientCode: 'PT-000001', name: 'Bola', nameLower: 'bola', mobile: '08030000000' });

    await expect(
      models.User.create({ name: 'Ada Two', email: 'ada@clinic.test', passwordHash: 'hash', role: ROLES.DOCTOR })
    ).rejects.toMatchObject({ code: 11000 });
    await expect(
      models.Patient.create({ patientCode: 'PT-000002', name: 'Bola Two', nameLower: 'bola two', mobile: '08030000000' })
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('never selects the password hash by default', () => {
    expect(models.User.schema.path('passwordHash').options.select).toBe(false);
  });

  it('lets expired refresh tokens delete themselves', () => {
    const ttl = models.RefreshToken.schema.indexes().find(([key]) => key.expiresAt === 1);

    expect(ttl[1].expireAfterSeconds).toBe(0);
  });
});

describe('appointment double booking guard', () => {
  it('is a partial unique index over doctor, date and start time', async () => {
    const indexes = await models.Appointment.collection.indexes();
    const guard = indexes.find((index) => index.key.doctorId === 1 && index.key.date === 1 && index.key.startTime === 1);

    expect(guard.unique).toBe(true);
    expect(guard.partialFilterExpression).toEqual({ status: { $in: ACTIVE_STATUSES } });
  });

  it('rejects a second active appointment in the same slot with 11000', async () => {
    await models.Appointment.create(baseAppointment);

    await expect(models.Appointment.create(baseAppointment)).rejects.toMatchObject({ code: 11000 });
  });

  it('still allows another time on the same day', async () => {
    await models.Appointment.create(baseAppointment);
    await models.Appointment.create({ ...baseAppointment, startTime: '10:30', endTime: '10:45' });

    expect(await models.Appointment.countDocuments({ doctorId })).toBe(2);
  });

  it('frees the slot once the appointment is cancelled', async () => {
    await models.Appointment.create(baseAppointment);
    await models.Appointment.updateOne({ doctorId, startTime: '09:00' }, { status: APPOINTMENT_STATUS.CANCELLED });

    await expect(models.Appointment.create(baseAppointment)).resolves.toBeDefined();
    expect(await models.Appointment.countDocuments({ doctorId })).toBe(2);
  });

  it('rejects a status that is not in the workflow', async () => {
    await expect(models.Appointment.create({ ...baseAppointment, status: 'no_show' })).rejects.toThrow(
      mongoose.Error.ValidationError
    );
  });
});

describe('appointment status workflow', () => {
  it('allows only the transitions from the brief', () => {
    expect(ALLOWED_TRANSITIONS[APPOINTMENT_STATUS.SCHEDULED]).toEqual([
      APPOINTMENT_STATUS.ARRIVED,
      APPOINTMENT_STATUS.CANCELLED,
    ]);
    expect(ALLOWED_TRANSITIONS[APPOINTMENT_STATUS.ARRIVED]).toEqual([
      APPOINTMENT_STATUS.COMPLETED,
      APPOINTMENT_STATUS.CANCELLED,
    ]);
    expect(ALLOWED_TRANSITIONS[APPOINTMENT_STATUS.COMPLETED]).toEqual([]);
    expect(ALLOWED_TRANSITIONS[APPOINTMENT_STATUS.CANCELLED]).toEqual([]);
  });
});
