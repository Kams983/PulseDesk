// one envelope for every response, so the client only checks success and meta.code
function sendSuccess(res, { data = null, message = 'OK', meta = {}, status = 200 } = {}) {
  return res.status(status).json({ success: true, message, data, meta });
}

function sendError(res, { message = 'Something went wrong', code = 'INTERNAL_ERROR', details, status = 500 } = {}) {
  return res.status(status).json({ success: false, message, data: null, meta: details ? { code, details } : { code } });
}

module.exports = { sendSuccess, sendError };
