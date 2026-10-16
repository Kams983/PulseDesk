const dashboardService = require('../services/dashboardService');
const { sendSuccess } = require('../utils/response');

// the shape follows the role: a clinic board for the desk, own counts for a doctor
async function getDashboard(req, res) {
  const dashboard = await dashboardService.getDashboard(req.user);

  return sendSuccess(res, { data: dashboard });
}

// the chart series behind the dashboard card, one entry per day ending today
async function getTrend(req, res) {
  const trend = await dashboardService.getTrend(req.query.days || dashboardService.DEFAULT_TREND_DAYS, req.user);

  return sendSuccess(res, { data: trend });
}

// the month behind the mini calendar, zero filled so a quiet day is a zero rather than a gap
async function getCalendar(req, res) {
  const calendar = await dashboardService.getCalendar(req.user, req.query.month);

  return sendSuccess(res, { data: calendar });
}

module.exports = { getCalendar, getDashboard, getTrend };
