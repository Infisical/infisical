import { Server } from 'http';
import main from '../src';
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

let server: Server;

beforeAll(async () => {
  server = await main;
});

afterAll(async () => {
  server.close();
});

describe('Healthcheck endpoint', () => {
  it('GET /healthcheck should return OK', async () => {
    const res = await request(server).get('/healthcheck');
    expect(res.status).toEqual(200);
  });
});
