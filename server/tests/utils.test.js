const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const env = require('../src/config/env');
const errorHandler = require('../src/middlewares/errorHandler');
const validate = require('../src/middlewares/validate');
const AppError = require('../src/utils/AppError');
const { sendSuccess, sendError } = require('../src/utils/response');
const { isPastDate, isPastSlot, minutesToTime, nowInClinicTz, timeToMinutes } = require('../src/utils/time');

// a throwaway app, so the middleware can be exercised without a feature route
function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/echo', validate(z.object({ name: z.string().min(2) })), (req, res) => sendSuccess(res, { data: req.body }));
  app.get('/search', validate(z.object({ page: z.coerce.number().int().min(1).default(1) }), 'query'), (req, res) =>
    sendSuccess(res, { data: req.query })
  );
  app.use(errorHandler);

  return app;
}

// captures what a controller wrote, so the helpers can be checked without a server
function fakeRes() {
  return {
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
}

describe('time helpers', () => {
  it('converts between HH:mm and minutes since midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:15')).toBe(555);
    expect(timeToMinutes('23:59')).toBe(1439);
    expect(minutesToTime(555)).toBe('09:15');
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(timeToMinutes('16:45'))).toBe('16:45');
  });

  it('runs the past checks in the configured clinic timezone', () => {
    expect(nowInClinicTz().zoneName).toBe(env.clinicTimezone);
  });

  it('treats yesterday as past and tomorrow as future', () => {
    const today = nowInClinicTz().startOf('day');
    const yesterday = today.minus({ days: 1 }).toISODate();
    const tomorrow = today.plus({ days: 1 }).toISODate();

    expect(isPastDate(yesterday)).toBe(true);
    expect(isPastDate(tomorrow)).toBe(false);
    expect(isPastSlot(yesterday, '23:59')).toBe(true);
    expect(isPastSlot(tomorrow, '00:00')).toBe(false);
  });
});

describe('response envelope', () => {
  it('wraps success data with the standard keys', () => {
    const res = fakeRes();
    sendSuccess(res, { data: { id: 1 }, message: 'Created', status: 201, meta: { total: 1 } });

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, message: 'Created', data: { id: 1 }, meta: { total: 1 } });
  });

  it('keeps errors in the same shape with a code', () => {
    const res = fakeRes();
    sendError(res, { status: 409, message: 'Slot taken', code: 'SLOT_TAKEN' });

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ success: false, message: 'Slot taken', data: null, meta: { code: 'SLOT_TAKEN' } });
  });

  it('only adds details when there are some', () => {
    const res = fakeRes();
    sendError(res, { status: 400, message: 'Validation failed', code: 'VALIDATION_ERROR', details: [{ field: 'date' }] });

    expect(res.body.meta.details).toEqual([{ field: 'date' }]);
  });
});

describe('AppError helpers', () => {
  it('carries a status and a code', () => {
    expect(AppError.badRequest('Bad input', [{ field: 'x' }])).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Bad input',
      details: [{ field: 'x' }],
    });
    expect(AppError.unauthorized().statusCode).toBe(401);
    expect(AppError.forbidden().statusCode).toBe(403);
    expect(AppError.notFound().statusCode).toBe(404);
    expect(AppError.conflict('Slot taken').statusCode).toBe(409);
  });

  it('is a real Error, so it stacks and logs like one', () => {
    expect(AppError.notFound('nope')).toBeInstanceOf(Error);
  });
});

describe('validate middleware', () => {
  it('replaces the body with the parsed result and drops unknown keys', async () => {
    const res = await request(buildApp()).post('/echo').send({ name: 'Ada', sneaky: true });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ name: 'Ada' });
  });

  it('replaces query data even though express 5 exposes query as a getter', async () => {
    const res = await request(buildApp()).get('/search?page=3&extra=1');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ page: 3 });
  });

  it('answers 400 with the failing field when the body is invalid', async () => {
    const res = await request(buildApp()).post('/echo').send({ name: 'A' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.meta.code).toBe('VALIDATION_ERROR');
    expect(res.body.meta.details).toEqual([{ field: 'name', message: 'Too small: expected string to have >=2 characters' }]);
  });

  it('answers 400 when query data is invalid', async () => {
    const res = await request(buildApp()).get('/search?page=0');

    expect(res.status).toBe(400);
    expect(res.body.meta.details[0].field).toBe('page');
  });
});
