import { server } from '../src/app';
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import supertest from 'supertest';
import { setUpHealthEndpoint } from '../src/services/health';

const requestWithSupertest = supertest(server);
describe('Healthcheck endpoint', () => {
  beforeAll(async () => {
    setUpHealthEndpoint(server);
  });
  afterAll(async () => {
    server.close();
  });

  it('GET /healthcheck should return OK', async () => {
    const res = await requestWithSupertest.get('/healthcheck');
    expect(res.status).toEqual(200);
  });
});
