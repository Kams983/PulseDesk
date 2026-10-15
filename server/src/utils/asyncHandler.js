// wraps async controllers so a rejected promise reaches the error middleware
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = asyncHandler;
