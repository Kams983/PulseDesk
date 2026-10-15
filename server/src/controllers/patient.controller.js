const patientService = require('../services/patientService');
const { sendSuccess } = require('../utils/response');

async function searchPatients(req, res) {
  const patients = await patientService.searchPatients(req.query.q);

  return sendSuccess(res, {
    data: { patients: patients.map(toPatientDto) },
    meta: { total: patients.length, limit: patientService.SEARCH_LIMIT },
  });
}

async function getPatient(req, res) {
  const patient = await patientService.getPatientById(req.params.id, req.user);

  return sendSuccess(res, { data: { patient: toPatientDto(patient) } });
}

function toPatientDto(patient) {
  return {
    id: patient._id.toString(),
    patientCode: patient.patientCode,
    name: patient.name,
    mobile: patient.mobile,
    gender: patient.gender,
    dateOfBirth: patient.dateOfBirth,
    createdAt: patient.createdAt,
  };
}

module.exports = { getPatient, searchPatients, toPatientDto };
