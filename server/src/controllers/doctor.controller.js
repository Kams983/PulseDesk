const doctorService = require('../services/doctorService');
const { sendSuccess } = require('../utils/response');

async function listDoctors(req, res) {
  const doctors = await doctorService.listDoctors({ ...req.query, requester: req.user });

  return sendSuccess(res, {
    data: { doctors: doctors.map(toDoctorDto) },
    meta: { total: doctors.length },
  });
}

async function getDoctor(req, res) {
  const doctor = await doctorService.getDoctorById(req.params.id, req.user);

  return sendSuccess(res, { data: { doctor: toDoctorDto(doctor) } });
}

async function createDoctor(req, res) {
  const doctor = await doctorService.createDoctor(req.body, req.user, req.ip);

  return sendSuccess(res, { status: 201, message: 'Doctor created', data: { doctor: toDoctorDto(doctor) } });
}

async function updateSchedule(req, res) {
  const doctor = await doctorService.replaceSchedule(req.params.id, req.body, req.user, req.ip);

  return sendSuccess(res, { message: 'Schedule updated', data: { doctor: toDoctorDto(doctor) } });
}

// the shape every doctor response shares: the department is always populated by the service, so the
// mapper never has to guess between an id and an object
function toDoctorDto(doctor) {
  return {
    id: doctor._id.toString(),
    name: doctor.name,
    department: {
      id: doctor.departmentId._id.toString(),
      name: doctor.departmentId.name,
      code: doctor.departmentId.code,
    },
    specialization: doctor.specialization,
    slotDurationMinutes: doctor.slotDurationMinutes,
    schedule: doctor.schedule.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      sessions: day.sessions.map(toWindowDto),
      breaks: day.breaks.map(toWindowDto),
    })),
  };
}

function toWindowDto(window) {
  return { name: window.name, start: window.start, end: window.end };
}

module.exports = { createDoctor, getDoctor, listDoctors, toDoctorDto, updateSchedule };
