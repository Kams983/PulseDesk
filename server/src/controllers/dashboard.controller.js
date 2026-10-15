const dashboardService = require('../services/dashboardService');
const { sendSuccess } = require('../utils/response');

// the shape follows the role: a clinic board for the desk, own counts for a doctor
async function getDashboard(req, res) {
  const dashboard = await dashboardService.getDashboard(req.user);

  return sendSuccess(res, { data: dashboard });
}

module.exports = { getDashboard };
