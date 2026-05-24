import request from 'supertest';
import { describe, it, expect } from 'vitest';
import app from './app.js'; // Make sure you export app instance without calling listen

describe('GET /test', () => {
  it('responds with JSON data', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    // optionally check res.body contents depending on your db mock
  });
});
