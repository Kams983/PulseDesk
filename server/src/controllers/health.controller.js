const { sendSuccess } = require('../utils/response');

// liveness probe, also the proof in tests that the response envelope works
function healthCheck(req, res) {
  return sendSuccess(res, {
    message: 'Service is healthy',
    data: { status: 'ok', uptime: Math.round(process.uptime()) },
  });
}

module.exports = { healthCheck };
