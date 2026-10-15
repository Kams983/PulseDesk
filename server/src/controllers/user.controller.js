const doctorService = require('../services/doctorService');
const { sendSuccess } = require('../utils/response');

async function createReceptionist(req, res) {
  const user = await doctorService.createReceptionist(req.body, req.user, req.ip);

  return sendSuccess(res, {
    status: 201,
    message: 'Receptionist created',
    data: { user: toSafeUser(user) },
  });
}

// the same safe field list the auth responses use, so no hash can ever ride along
function toSafeUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
}

module.exports = { createReceptionist };
