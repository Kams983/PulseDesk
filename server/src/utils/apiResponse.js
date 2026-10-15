// one envelope for every response so the client only checks success and meta.code
function sendSuccess(res, { status = 200, message = 'OK', data = null, meta = {} } = {}) {
  return res.status(status).json({ success: true, message, data, meta });
}

function sendError(res, { status = 500, message = 'Something went wrong', code = 'INTERNAL_ERROR', details } = {}) {
  return res.status(status).json({ success: false, message, data: null, meta: details ? { code, details } : { code } });
}

module.exports = { sendSuccess, sendError };
