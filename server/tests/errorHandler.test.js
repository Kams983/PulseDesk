const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { z } = require('zod');
const errorHandler = require('../src/middlewares/errorHandler');
const AppError = require('../src/utils/AppError');

// runs the middleware directly, so every mapping is covered without a route
function handle(err) {
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  errorHandler(err, {}, res, () => {});

  return res;
}

describe('error handler mappings', () => {
  let consoleError;

  beforeAll(() => {
    // the handler logs real errors server side, the test output does not need them
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleError.mockRestore();
  });

  it('passes an AppError through with its own status and code', () => {
    const res = handle(AppError.conflict('Slot already taken'));

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ success: false, data: null, meta: { code: 'CONFLICT' } });
  });

  it('maps zod issues to a 400 with field details', () => {
    const parsed = z.object({ date: z.string(), startTime: z.string().min(1) }).safeParse({ date: 5, startTime: '' });
    const res = handle(parsed.error);

    expect(res.statusCode).toBe(400);
    expect(res.body.meta.code).toBe('VALIDATION_ERROR');
    expect(res.body.meta.details).toEqual([
      { field: 'date', message: expect.any(String) },
      { field: 'startTime', message: expect.any(String) },
    ]);
  });

  it('maps a mongoose validation error to a 400 with field details', () => {
    const validationError = new mongoose.Error.ValidationError();
    validationError.addError('mobile', new mongoose.Error.ValidatorError({ path: 'mobile', message: 'mobile is required' }));

    const res = handle(validationError);

    expect(res.statusCode).toBe(400);
    expect(res.body.meta.details).toEqual([{ field: 'mobile', message: 'mobile is required' }]);
  });

  it('maps a cast error to a 400 with the offending path', () => {
    const res = handle(new mongoose.Error.CastError('ObjectId', 'not-an-id', 'patientId'));

    expect(res.statusCode).toBe(400);
    expect(res.body.meta.code).toBe('INVALID_ID');
    expect(res.body.message).toBe('Invalid value for patientId');
  });

  it('maps jwt errors to a 401', () => {
    const expired = handle(new jwt.TokenExpiredError('jwt expired', new Date()));
    const tampered = handle(new jwt.JsonWebTokenError('invalid signature'));

    expect(expired.statusCode).toBe(401);
    expect(tampered.statusCode).toBe(401);
    expect(expired.body.meta.code).toBe('INVALID_TOKEN');
  });

  it('maps a duplicate key to a 409 without leaking driver internals', () => {
    const duplicateKey = Object.assign(new Error('E11000 duplicate key error collection: emr.appointments'), {
      code: 11000,
      keyValue: { doctorId: '507f1f77bcf86cd799439011' },
    });

    const res = handle(duplicateKey);

    expect(res.statusCode).toBe(409);
    expect(res.body.meta.code).toBe('DUPLICATE_KEY');
    expect(JSON.stringify(res.body)).not.toContain('507f1f77bcf86cd799439011');
  });

  it('answers anything unknown as a 500 without a stack trace', () => {
    const res = handle(new Error('connection reset by peer'));

    expect(res.statusCode).toBe(500);
    expect(res.body.meta.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('at ');
  });
});

describe('production hides internal messages', () => {
  let productionHandler;
  let consoleError;

  beforeAll(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.resetModules();
    jest.doMock('../src/config/env', () => ({ nodeEnv: 'production', isProduction: true }));
    productionHandler = require('../src/middlewares/errorHandler');
  });

  afterAll(() => {
    jest.dontMock('../src/config/env');
    jest.resetModules();
    consoleError.mockRestore();
  });

  it('replaces an unexpected message with a generic one', () => {
    const res = {
      statusCode: 0,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };

    productionHandler(new Error('mongo connection string leaked here'), {}, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe('Something went wrong');
  });
});
