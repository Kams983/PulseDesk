// loading every model once at boot, so mongoose builds their indexes as soon as it connects
module.exports = {
  User: require('./user.model'),
  RefreshToken: require('./refreshToken.model'),
  Department: require('./department.model'),
  Doctor: require('./doctor.model'),
  Patient: require('./patient.model'),
  Appointment: require('./appointment.model'),
  AuditLog: require('./auditLog.model'),
};
