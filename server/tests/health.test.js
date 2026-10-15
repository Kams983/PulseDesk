const request = require('supertest');
const app = require('../src/app');

describe('health endpoint', () => {
  it('answers with the standard envelope', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'ok' }, meta: {} });
  });

  it('uses the same envelope for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, data: null, meta: { code: 'NOT_FOUND' } });
  });

  it('does not leak a stack trace on errors', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(JSON.stringify(res.body)).not.toContain('at ');
  });
});
