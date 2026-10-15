// validates one request source and replaces it with the parsed result, so services only ever see clean data
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return next(result.error);
    }

    if (source === 'query') {
      // express 5 exposes query as a getter, so a plain assignment silently does nothing
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else {
      req[source] = result.data;
    }

    return next();
  };
}

module.exports = validate;
