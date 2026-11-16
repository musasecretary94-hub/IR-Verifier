class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function notFound(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
}

// Last stop for every error. Never shows internal details to the user.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return;
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
  }
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: { code: 'too_large', message: 'The request is too large' } });
  }
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ error: { code: 'bad_json', message: 'The request is not valid JSON' } });
  }
  console.error('Server error:', err);
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong on the server' } });
}

// Lets a handler use throw/async without crashing the server.
const wrap = (fn) => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res, next)).catch(next);
};

module.exports = { HttpError, notFound, errorHandler, wrap };
