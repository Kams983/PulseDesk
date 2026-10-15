const doctorService = require('../services/doctorService');
const slotService = require('../services/slotService');
const { sendSuccess } = require('../utils/response');

async function listSlots(req, res) {
  const { doctorId, date } = req.query;

  // a doctor may only look at their own grid, everyone else may look at any doctor's
  await doctorService.assertCanViewDoctor(req.user, doctorId);

  const availability = await slotService.getSlotsForDoctorDate(doctorId, date);
  const available = availability.slots.filter((slot) => slot.status === 'available').length;

  return sendSuccess(res, {
    data: availability,
    meta: { total: availability.slots.length, available },
  });
}

module.exports = { listSlots };
