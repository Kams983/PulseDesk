// Rebuilds the demo clinic from scripts/seedData.js, positioned around the clinic's today so the data
// never goes stale. This file only knows how to turn facts into rows; every person, department and
// purpose lives in the data file.
const mongoose = require('mongoose');
const { DateTime } = require('luxon');

const connectDb = require('../src/config/db');
const env = require('../src/config/env');
const models = require('../src/models');
const patientService = require('../src/services/patientService');
const { APPOINTMENT_STATUS, ROLES } = require('../src/config/constants');
const { hashPassword } = require('../src/services/authService');
const { generateSlots } = require('../src/services/slotGenerator');
const { nowInClinicTz, timeToMinutes } = require('../src/utils/time');
const seedData = require('./seedData');

const { User, RefreshToken, Department, Doctor, Patient, Appointment, AuditLog } = models;

// How far the demo reaches, and the two dials that make it look like a clinic rather than a fixture.
// Six weeks back gives a monthly review at least one earlier visit to sit behind, and a fortnight ahead
// is the horizon the scheduler lets the desk book in.
const PAST_DAYS = 45;
const FUTURE_DAYS = 14;
const SHOWCASE_BUSYNESS = 0.95;
// the one account this file mentions by name, because the rule is about that doctor's next working day
const SHOWCASE_DOCTOR = 'dr.adeyemi@emr.test';
// a fixed seed, so two runs on the same day build the same clinic and a bug can be reproduced
const PRNG_SEED = 20261016;
// how many cancelled slots also get a later active booking, which shows the partial index working
const ROOM_FOR_REBOOKING = 5;

// which departments each demo patient usually attends, keyed by mobile
const DEPT_CODES_BY_MOBILE = new Map(seedData.patients.map((spec) => [spec.mobile, spec.deptCodes]));
// the regular reviews, keyed the same way, so a patient document can be matched back to its plan
const FOLLOW_UP_BY_MOBILE = new Map(
  seedData.patients.filter((spec) => spec.followUp).map((spec) => [spec.mobile, spec.followUp])
);

// mulberry32, the smallest random generator that is honestly reproducible: same seed, same numbers
function mulberry32(seed) {
  let state = seed >>> 0;

  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(PRNG_SEED);

// inclusive on both ends, because every rule here is written as a range a person would say out loud
function randInt(min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function chance(probability) {
  return random() < probability;
}

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

// Fisher-Yates with the same seeded generator, so a shuffled subset is still reproducible
function shuffle(list) {
  const copy = [...list];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));

    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }

  return copy;
}

// A clinic wall clock time as a real instant, which is what the timestamps on a row need.
function atClinicTime(date, time) {
  return DateTime.fromISO(`${date}T${time}`, { zone: env.clinicTimezone });
}

// day 0 is Sunday in the schedule and day 7 is Sunday in luxon, so luxon's 7 wraps to 0
function scheduleFor(spec, weekday) {
  return spec.weeklySchedule.find((day) => day.dayOfWeek === weekday % 7);
}

function currentUserIds(receptionists) {
  return receptionists.map((user) => user._id);
}

async function main() {
  refuseInProduction();

  await connectDb();

  console.log('seed: wiping every demo collection');
  await wipe();
  // indexes are built after the wipe and before any insert, so the partial unique index that prevents a
  // double booking exists while the rebooked slot below is written
  await buildIndexes();

  const users = await createUsers();
  const departments = await createDepartments();
  const doctors = await createDoctors(users, departments);
  const patients = await createPatients(users.receptionists);

  const appointments = await createAppointments(doctors, patients, users.receptionists);
  const auditRows = await createAuditLogs(users, appointments);

  await printSummary({ doctors, appointments, patients, auditRows });

  await mongoose.disconnect();
}

// A seed run deletes everything it can reach, so a production database needs an explicit --force
function refuseInProduction() {
  if (env.nodeEnv !== 'production' || process.argv.includes('--force')) {
    return;
  }

  console.error('Refusing to seed with NODE_ENV=production. Pass --force if you really mean it.');
  process.exit(1);
}

async function wipe() {
  await Promise.all([
    User.deleteMany({}),
    RefreshToken.deleteMany({}),
    Department.deleteMany({}),
    Doctor.deleteMany({}),
    Patient.deleteMany({}),
    Appointment.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);

  // the counter goes too, so patient codes restart at PT-000001 and a reseed looks like a fresh install
  await mongoose.connection.collection('counters').deleteMany({});
}

async function buildIndexes() {
  for (const model of Object.values(models)) {
    // every constraint the api runs against exists before the first insert, otherwise the seed would
    // happily write data the api would have rejected
    await model.syncIndexes();
  }
}

async function createUsers() {
  const passwordHash = await hashPassword(seedData.DEMO_PASSWORD);
  const specs = [
    { ...seedData.staff.admin, role: ROLES.SUPER_ADMIN },
    ...seedData.staff.receptionists.map((receptionist) => ({ ...receptionist, role: ROLES.RECEPTIONIST })),
    ...seedData.doctors.map((doctor) => ({ name: doctor.name, email: doctor.email, role: ROLES.DOCTOR })),
  ];

  const users = await User.insertMany(specs.map(({ name, email, role }) => ({ name, email, role, passwordHash })));
  const byEmail = new Map(users.map((user) => [user.email, user]));

  return {
    admin: byEmail.get(seedData.staff.admin.email),
    receptionists: seedData.staff.receptionists.map((spec) => byEmail.get(spec.email)),
    doctors: new Map(seedData.doctors.map((spec) => [spec.email, byEmail.get(spec.email)])),
  };
}

async function createDepartments() {
  const departments = await Department.insertMany(seedData.departments);

  return new Map(departments.map((department) => [department.code, department]));
}

async function createDoctors(users, departments) {
  const documents = seedData.doctors.map((spec) => ({
    userId: users.doctors.get(spec.email)._id,
    departmentId: departments.get(spec.deptCode)._id,
    // stored without the title so a search on the given name finds them, the ui adds "Dr."
    name: spec.name,
    nameLower: spec.name.toLowerCase(),
    specialization: spec.specialization,
    slotDurationMinutes: spec.slotDurationMinutes,
    schedule: spec.weeklySchedule,
  }));

  const doctors = await Doctor.insertMany(documents);

  // busyness and deptCode are facts about the demo, not columns on a doctor, so they are kept beside the
  // document rather than written into a model that has no field for them
  return doctors.map((doctor, index) => ({ doctor, spec: seedData.doctors[index] }));
}

async function createPatients(receptionists) {
  const patients = [];
  const registered = currentUserIds(receptionists);

  for (const spec of seedData.patients) {
    // one at a time: each patient needs its own code from the counter the booking api also uses
    const patientCode = await patientService.nextPatientCode();
    const createdAt = nowInClinicTz().minus({ days: randInt(5, 120), hours: randInt(0, 20) });

    patients.push(
      await Patient.create({
        patientCode,
        name: spec.name,
        nameLower: spec.name.toLowerCase(),
        mobile: spec.mobile,
        gender: spec.gender,
        dateOfBirth: spec.dateOfBirth,
        // the register is split between the two receptionists, the way a shared desk works
        createdBy: pick(registered),
        // registered between five days and four months ago, so the register has some history
        createdAt: createdAt.toJSDate(),
      })
    );
  }

  return patients;
}

async function createAppointments(doctors, patients, receptionists) {
  const clinicNow = nowInClinicTz();
  const today = clinicNow.startOf('day').toISODate();
  const registered = currentUserIds(receptionists);
  const booked = [];
  // who has been seen by this doctor before, so a returning patient can come back
  const seenBy = new Map();
  // A doctor holds at most one active booking per date and start time, and this set is what keeps the
  // two booking paths below from handing the same slot out twice.
  const taken = new Set();

  // the regular reviews go in before the random fill, so a busy diary can never crowd them out
  booked.push(...bookFollowUpVisits({ doctors, patients, registered, taken, clinicNow, today }));

  for (const entry of doctors) {
    collectDoctorBookings({ entry, patients, registered, booked, taken, seenBy, clinicNow, today });
  }

  // the desk cancels a couple of still pending bookings today, which is both how a real board looks and
  // what leaves a visible free slot behind
  cancelTodaysBookings(booked, today, clinicNow);

  const cancelled = booked.filter((entry) => entry.row.status === APPOINTMENT_STATUS.CANCELLED);
  const rebooked = rebookCancelledSlots({ cancelled, patients, receptionists, clinicNow });
  const rows = booked.map((entry) => entry.row);

  // mongoose drops the keys a status does not use, so one shape can describe every row
  return Appointment.insertMany([...rows, ...rebooked]);
}

function collectDoctorBookings({ entry, patients, registered, booked, taken, seenBy, clinicNow, today }) {
  const { doctor, spec } = entry;
  const showcaseDay = nextWorkingDay(spec, clinicNow);

  for (let offset = -PAST_DAYS; offset <= FUTURE_DAYS; offset += 1) {
    const day = clinicNow.startOf('day').plus({ days: offset });
    const date = day.toISODate();
    const workingDay = scheduleFor(spec, day.weekday);

    // the doctor does not work that weekday, so the day contributes nothing at all
    if (!workingDay) {
      continue;
    }

    // the real generator builds the grid, so the seed can only ever book times the api would accept
    const slots = generateSlots({
      sessions: workingDay.sessions,
      breaks: workingDay.breaks,
      slotDurationMinutes: doctor.slotDurationMinutes,
    });

    // a follow-up visit may already hold one of these, and a slot is never booked twice
    const free = slots.filter((slot) => !isTaken(taken, doctor, date, slot));

    if (free.length === 0) {
      continue;
    }

    const isShowcase = date === showcaseDay;
    // busyness is a share of the slots the day has left, so the reviews that landed on the showcase day
    // and the random fill still add up to the same 95 percent of the grid
    const target = isShowcase
      ? Math.round(free.length * SHOWCASE_BUSYNESS)
      : Math.round(free.length * spec.busyness * (0.85 + random() * 0.3));

    for (const slot of takeSlots(free, target)) {
      const row = bookingRow({ entry, patients, registered, seenBy, clinicNow, today, date, slot, isShowcase });

      if (row) {
        taken.add(slotKey(doctor, date, slot));
        booked.push({ row, doctor, spec, date, slot });
      }
    }
  }
}

// one booking, or null when nobody in that department could be in the pool for that day
function bookingRow({ entry, patients, registered, seenBy, clinicNow, today, date, slot, isShowcase }) {
  const { doctor, spec } = entry;
  const dayStart = atClinicTime(date, '00:00');
  // a patient has to have been registered before the day of the visit, or the booking would predate the
  // person it belongs to
  const pool = patients.filter(
    (patient) => patientBelongsTo(patient, spec.deptCode) && patient.createdAt < dayStart.toJSDate()
  );

  if (pool.length === 0) {
    return null;
  }

  return appointmentRow({
    entry,
    patient: pickPatient(pool, seenBy, doctor),
    purpose: pick(seedData.purposesByDept[spec.deptCode]),
    date,
    slot,
    registered,
    clinicNow,
    today,
    isShowcase,
  });
}

// The row both booking paths write. The purpose is the only part they disagree on: a random visit takes
// one from its department, a review keeps the one the patient is on the books for.
function appointmentRow({ entry, patient, purpose, date, slot, registered, clinicNow, today, isShowcase }) {
  const { doctor, spec } = entry;
  const status = statusFor({ date, today, isShowcase, slot, clinicNow });
  const stamps = timestampsFor({ status, date, slot, clinicNow });

  return {
    patientId: patient._id,
    doctorId: doctor._id,
    departmentId: doctor.departmentId,
    date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    status,
    purpose,
    ...notesFor(spec.deptCode),
    ...snapshot(doctor, patient),
    createdBy: pick(registered),
    createdAt: bookedAt({ date, patient, clinicNow }).toJSDate(),
    ...stamps,
  };
}

// About two visits in five carry a note, and almost all of those are written for the department the visit
// belongs to: a paediatric booking never gets an antenatal note. The rest are general desk notes that fit
// anywhere, and half of all visits carry none at all.
function notesFor(deptCode) {
  const roll = random();
  const departmentNotes = seedData.notesByDept[deptCode] || [];

  if (roll < 0.4 && departmentNotes.length > 0) {
    return { notes: pick(departmentNotes) };
  }

  if (roll >= 0.4 && roll < 0.5) {
    return { notes: pick(seedData.sampleNotes) };
  }

  return {};
}

// A patient on a regular review comes back about every `everyDays` days. The cycle starts at an offset
// drawn from the seeded generator, so two reviews with the same cadence still land on different days,
// and each due date moves to the nearest day that doctor actually works before a free slot is taken from
// the real generator.
function bookFollowUpVisits({ doctors, patients, registered, taken, clinicNow, today }) {
  const visits = [];
  const doctorsByEmail = new Map(doctors.map((entry) => [entry.spec.email, entry]));
  const firstDay = clinicNow.startOf('day').minus({ days: PAST_DAYS });
  const lastDay = clinicNow.startOf('day').plus({ days: FUTURE_DAYS });

  for (const patient of patients) {
    const followUp = FOLLOW_UP_BY_MOBILE.get(patient.mobile);
    const entry = followUp ? doctorsByEmail.get(followUp.doctorEmail) : null;

    if (!entry) {
      continue;
    }

    const showcaseDay = nextWorkingDay(entry.spec, clinicNow);
    let due = firstDay.plus({ days: randInt(0, followUp.everyDays - 1) });

    while (due <= lastDay) {
      const visit = followUpVisit({ entry, patient, followUp, due, showcaseDay, registered, taken, clinicNow, today });

      if (visit) {
        visits.push(visit);
      }

      // the cadence follows the date the review was due, not the day it moved to, so it stays regular
      due = due.plus({ days: followUp.everyDays });
    }
  }

  return visits;
}

function followUpVisit({ entry, patient, followUp, due, showcaseDay, registered, taken, clinicNow, today }) {
  const { doctor, spec } = entry;
  const day = nearestWorkingDay(spec, due);
  const firstDay = clinicNow.startOf('day').minus({ days: PAST_DAYS });
  const lastDay = clinicNow.startOf('day').plus({ days: FUTURE_DAYS });

  // a review that only fits by leaving the seeded range is not booked at all
  if (!day || day < firstDay || day > lastDay) {
    return null;
  }

  const date = day.toISODate();

  // the same rule as every other visit: nobody is seen before the day they registered
  if (patient.createdAt >= atClinicTime(date, '00:00').toJSDate()) {
    return null;
  }

  const workingDay = scheduleFor(spec, day.weekday);
  const free = generateSlots({
    sessions: workingDay.sessions,
    breaks: workingDay.breaks,
    slotDurationMinutes: doctor.slotDurationMinutes,
  }).filter((slot) => !isTaken(taken, doctor, date, slot));

  // a day that is already full cannot hold the review; the next one keeps its own cadence
  if (free.length === 0) {
    return null;
  }

  const slot = pick(free);

  taken.add(slotKey(doctor, date, slot));

  return {
    row: appointmentRow({
      entry,
      patient,
      purpose: followUp.purpose,
      date,
      slot,
      registered,
      clinicNow,
      today,
      isShowcase: date === showcaseDay,
    }),
    doctor,
    spec,
    date,
    slot,
  };
}

// The closest date on which this doctor works, searched forwards first so a review that falls on a day off
// moves later rather than earlier.
function nearestWorkingDay(spec, day) {
  for (let distance = 0; distance <= 7; distance += 1) {
    const candidates = distance === 0 ? [day] : [day.plus({ days: distance }), day.minus({ days: distance })];

    for (const candidate of candidates) {
      if (scheduleFor(spec, candidate.weekday)) {
        return candidate;
      }
    }
  }

  return null;
}

// the key the partial unique index enforces: one active booking per doctor, date and start time
function slotKey(doctor, date, slot) {
  return `${doctor._id}|${date}|${slot.startTime}`;
}

function isTaken(taken, doctor, date, slot) {
  return taken.has(slotKey(doctor, date, slot));
}

// Today is the one day a reviewer can watch change, so one or two of its bookings are cancelled with a
// timestamp and a reason, and the rest keep following the clock.
function cancelTodaysBookings(booked, today, clinicNow) {
  const candidates = booked.filter((entry) => entry.date === today && entry.row.status === APPOINTMENT_STATUS.SCHEDULED);

  for (const entry of shuffle(candidates).slice(0, randInt(1, 2))) {
    // cancelled half an hour to ten hours ago, always before the slot it frees
    entry.row.status = APPOINTMENT_STATUS.CANCELLED;
    entry.row.cancelledAt = clinicNow.minus({ minutes: randInt(30, 600) }).toJSDate();
    entry.row.cancelReason = pick(seedData.cancelReasons);
  }
}

// The desk fills its morning list first, so a morning slot is 1.5 times as likely to be taken.
// Weighted sampling without replacement: one weighted key per slot, take the highest.
function takeSlots(slots, count) {
  return slots
    .map((slot) => ({
      slot,
      key: random() ** (1 / (timeToMinutes(slot.startTime) < 12 * 60 ? 1.5 : 1)),
    }))
    .sort((a, b) => b.key - a.key)
    .slice(0, Math.min(count, slots.length))
    .map((entry) => entry.slot);
}

function patientBelongsTo(patient, deptCode) {
  return DEPT_CODES_BY_MOBILE.get(patient.mobile)?.includes(deptCode) ?? false;
}

// A patient with a history with this doctor comes back about twice as often as a new one, which is how
// a real appointment book fills up. The coin is flipped before the branch, so the generator is drawn
// from the same number of times whatever the pool looks like.
function pickPatient(pool, seenBy, doctor) {
  const key = doctor._id.toString();
  const previous = pool.filter((patient) => (seenBy.get(`${key}:${patient._id}`) || 0) > 0);
  const prefersReturning = chance(0.6);
  const chosen = previous.length > 0 && prefersReturning ? pick(previous) : pick(pool);

  seenBy.set(`${key}:${chosen._id}`, (seenBy.get(`${key}:${chosen._id}`) || 0) + 1);

  return chosen;
}

// A visit that has already happened is almost always completed, a future one is almost always still
// scheduled, and today is decided by the clock. The roll is taken for every row, even when the answer
// ignores it, so the seeded stream does not depend on what time it is.
function statusFor({ date, today, isShowcase, slot, clinicNow }) {
  const roll = random();

  // the showcase day keeps every booking it took, because it is the grid a reviewer opens first
  if (isShowcase) {
    return APPOINTMENT_STATUS.SCHEDULED;
  }

  if (date < today) {
    return roll < 0.85 ? APPOINTMENT_STATUS.COMPLETED : APPOINTMENT_STATUS.CANCELLED;
  }

  if (date > today) {
    return roll < 0.92 ? APPOINTMENT_STATUS.SCHEDULED : APPOINTMENT_STATUS.CANCELLED;
  }

  const start = atClinicTime(date, slot.startTime);
  const end = atClinicTime(date, slot.endTime);

  if (end <= clinicNow.minus({ minutes: 20 })) {
    return APPOINTMENT_STATUS.COMPLETED;
  }

  if (start <= clinicNow) {
    return APPOINTMENT_STATUS.ARRIVED;
  }

  return APPOINTMENT_STATUS.SCHEDULED;
}

// The timestamps have to agree with the status they belong to: a patient arrives before the slot, a
// visit closes after it, and a cancellation always happens before the time it cancels. Every offset is
// drawn up front even when the status will not use it, so the clock cannot change the generator stream.
function timestampsFor({ status, date, slot, clinicNow }) {
  const start = atClinicTime(date, slot.startTime);
  const end = atClinicTime(date, slot.endTime);
  const arriveOffset = randInt(5, 15);
  const completeOffset = randInt(1, 20);
  const cancelOffset = randInt(2, 72);
  const lateCancelOffset = randInt(30, 600);

  if (status === APPOINTMENT_STATUS.ARRIVED || status === APPOINTMENT_STATUS.COMPLETED) {
    return {
      arrivedAt: start.minus({ minutes: arriveOffset }).toJSDate(),
      ...(status === APPOINTMENT_STATUS.COMPLETED
        ? { completedAt: end.plus({ minutes: completeOffset }).toJSDate() }
        : {}),
    };
  }

  if (status === APPOINTMENT_STATUS.CANCELLED) {
    const candidate = start.minus({ hours: cancelOffset });

    return {
      cancelledAt: (candidate <= clinicNow ? candidate : clinicNow.minus({ minutes: lateCancelOffset })).toJSDate(),
      cancelReason: pick(seedData.cancelReasons),
    };
  }

  return {};
}

// Booked one to six days before the visit during desk hours, never in the future and never before the
// patient was registered. The clamp offset is drawn with the rest, so the clock cannot shift the stream.
function bookedAt({ date, patient, clinicNow }) {
  const earliest = DateTime.fromJSDate(patient.createdAt, { zone: env.clinicTimezone }).plus({ hours: 2 });
  const latest = clinicNow.minus({ hours: 1 });
  const daysBefore = randInt(1, 6);
  const hour = randInt(8, 18);
  const minute = randInt(0, 59);
  const clampMinutes = randInt(0, 240);
  let at = atClinicTime(date, '09:00').minus({ days: daysBefore }).set({ hour, minute });

  if (at > latest) {
    at = latest.minus({ minutes: clampMinutes });
  }

  if (at < earliest) {
    at = earliest;
  }

  return at;
}

// The next date on which this doctor actually works, which is the grid a reviewer will open first.
function nextWorkingDay(spec, clinicNow) {
  for (let offset = 1; offset <= 14; offset += 1) {
    const day = clinicNow.plus({ days: offset });

    if (scheduleFor(spec, day.weekday)) {
      return day.toISODate();
    }
  }

  return null;
}

// A cancelled row leaves the partial index, so the same doctor and time can hold an active booking
// again. Five of them get exactly that, which is the double booking rule made visible.
function rebookCancelledSlots({ cancelled, patients, receptionists, clinicNow }) {
  const today = clinicNow.startOf('day').toISODate();
  // today and the days ahead first, so the rebooked visit is something the board can still show
  const candidates = [
    ...cancelled.filter((entry) => entry.date >= today),
    ...cancelled.filter((entry) => entry.date < today),
  ].slice(0, ROOM_FOR_REBOOKING);

  const rows = [];

  for (const entry of candidates) {
    const pool = patients.filter(
      (patient) => patientBelongsTo(patient, entry.spec.deptCode) && String(patient._id) !== String(entry.row.patientId)
    );

    if (pool.length === 0) {
      continue;
    }

    rows.push(rebookedRow({ entry, patient: pick(pool), receptionists, clinicNow }));
  }

  return rows;
}

function rebookedRow({ entry, patient, receptionists, clinicNow }) {
  const cancelledAt = DateTime.fromJSDate(entry.row.cancelledAt, { zone: env.clinicTimezone });

  return {
    ...entry.row,
    patientId: patient._id,
    ...snapshot(entry.doctor, patient),
    status: APPOINTMENT_STATUS.SCHEDULED,
    purpose: pick(seedData.purposesByDept[entry.spec.deptCode]),
    createdBy: pick(currentUserIds(receptionists)),
    // booked after the cancellation that freed the time, and never in the future
    createdAt: DateTime.min(cancelledAt.plus({ hours: randInt(1, 24) }), clinicNow.minus({ minutes: 15 })).toJSDate(),
    arrivedAt: undefined,
    completedAt: undefined,
    cancelledAt: undefined,
    cancelReason: undefined,
  };
}

function snapshot(doctor, patient) {
  return {
    doctorSnapshot: { name: doctor.name, nameLower: doctor.nameLower },
    patientSnapshot: {
      name: patient.name,
      nameLower: patient.nameLower,
      mobile: patient.mobile,
      patientCode: patient.patientCode,
    },
  };
}

async function createAuditLogs(users, appointments) {
  const clinicNow = nowInClinicTz();
  const staff = [users.admin, ...users.receptionists];
  const rows = [...loginRows(staff, clinicNow), ...appointmentRows(appointments, staff, users)];

  await AuditLog.insertMany(rows);

  return rows.length;
}

// the desk signs in each morning, so the last week has a believable login trail
function loginRows(staff, clinicNow) {
  const rows = [];

  for (const user of staff) {
    for (let offset = 0; offset < 7; offset += 1) {
      const at = clinicNow.minus({ days: offset }).set({ hour: randInt(7, 9), minute: randInt(0, 59) });

      if (at > clinicNow) {
        continue;
      }

      rows.push({
        userId: user._id,
        role: user.role,
        action: 'LOGIN',
        entity: 'User',
        entityId: user._id,
        ip: '127.0.0.1',
        createdAt: at.toJSDate(),
      });
    }
  }

  return rows;
}

function appointmentRows(appointments, staff, users) {
  const staffById = new Map(staff.map((user) => [String(user._id), user]));
  const rows = [];

  for (const appointment of appointments) {
    const actor = staffById.get(String(appointment.createdBy)) || users.receptionists[0];

    // the same metadata the api writes for the same event, so the trail reads identically
    rows.push({
      userId: actor._id,
      role: actor.role,
      action: 'APPOINTMENT_CREATED',
      entity: 'Appointment',
      entityId: appointment._id,
      metadata: { date: appointment.date, startTime: appointment.startTime, doctorId: String(appointment.doctorId) },
      ip: '127.0.0.1',
      createdAt: appointment.createdAt,
    });

    const stateChange = stateChangeRow(appointment, actor);

    if (stateChange) {
      rows.push(stateChange);
    }
  }

  return rows;
}

function stateChangeRow(appointment, actor) {
  const base = {
    userId: actor._id,
    role: actor.role,
    entity: 'Appointment',
    entityId: appointment._id,
    ip: '127.0.0.1',
  };

  if (appointment.status === APPOINTMENT_STATUS.CANCELLED && appointment.cancelledAt) {
    return {
      ...base,
      action: 'APPOINTMENT_CANCELLED',
      metadata: { from: APPOINTMENT_STATUS.SCHEDULED, reason: appointment.cancelReason },
      createdAt: appointment.cancelledAt,
    };
  }

  if (appointment.status === APPOINTMENT_STATUS.ARRIVED && appointment.arrivedAt) {
    return {
      ...base,
      action: 'APPOINTMENT_ARRIVED',
      metadata: { date: appointment.date, startTime: appointment.startTime },
      createdAt: appointment.arrivedAt,
    };
  }

  if (appointment.status === APPOINTMENT_STATUS.COMPLETED && appointment.completedAt) {
    return {
      ...base,
      action: 'APPOINTMENT_COMPLETED',
      metadata: { date: appointment.date, startTime: appointment.startTime },
      createdAt: appointment.completedAt,
    };
  }

  return null;
}

async function printSummary({ doctors, appointments, patients, auditRows }) {
  const today = nowInClinicTz().toISODate();
  const tomorrow = nowInClinicTz().plus({ days: 1 }).toISODate();

  printCollections(await countCollections({ patients, appointments, auditRows }));
  printAppointmentsPerDoctor({ doctors, appointments, today, tomorrow });
  printAccounts();
  printDemoNote(today);
}

async function countCollections({ patients, appointments, auditRows }) {
  const [users, departments, doctors] = await Promise.all([
    User.countDocuments({}),
    Department.countDocuments({}),
    Doctor.countDocuments({}),
  ]);

  return {
    users,
    departments,
    doctors,
    patients: patients.length,
    appointments: appointments.length,
    auditLogs: auditRows,
  };
}

function printCollections(counts) {
  console.log('\nCollections');

  for (const [name, value] of Object.entries(counts)) {
    console.log('  %s: %d', name.padEnd(12), value);
  }
}

function printAppointmentsPerDoctor({ doctors, appointments, today, tomorrow }) {
  console.log('\nAppointments per doctor');
  console.log('  %s  %s  %s', 'doctor'.padEnd(18), 'today'.padStart(5), 'tomorrow'.padStart(8));

  for (const { doctor } of doctors) {
    const forDoctor = appointments.filter((row) => String(row.doctorId) === String(doctor._id));
    const on = (date) => forDoctor.filter((row) => row.date === date).length;

    console.log('  %s  %s  %s', doctor.name.padEnd(18), String(on(today)).padStart(5), String(on(tomorrow)).padStart(8));
  }
}

function printAccounts() {
  console.log('\nDemo accounts (password for all of them: %s)\n', seedData.DEMO_PASSWORD);
  console.log('  %s  %s', 'super_admin '.padEnd(13), seedData.staff.admin.email);

  for (const receptionist of seedData.staff.receptionists) {
    console.log('  %s  %s', 'receptionist'.padEnd(13), receptionist.email);
  }

  for (const doctor of seedData.doctors) {
    console.log('  %s  %s', 'doctor'.padEnd(13), doctor.email);
  }
}

function printDemoNote(today) {
  const showcase = seedData.doctors.find((spec) => spec.email === SHOWCASE_DOCTOR);

  console.log('\nThe demo covers %d days back and %d days ahead of %s.', PAST_DAYS, FUTURE_DAYS, today);
  console.log(
    'The showcase day is %s: %s is booked at %d percent there.',
    nextWorkingDay(showcase, nowInClinicTz()),
    showcase.name,
    Math.round(SHOWCASE_BUSYNESS * 100)
  );
  console.log('');
}

main().catch(async (error) => {
  console.error('seed failed:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});
