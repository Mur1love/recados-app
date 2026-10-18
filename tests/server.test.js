'use strict';

const { test, after } = require('node:test');
const request = require('supertest');
const { app, server } = require('../src/server');

after(() => server.close());

test('smoke: GET /saude responde 200 com JSON', async () => {
  const res = await request(app).get('/saude').expect('Content-Type', /json/);
  if (res.status !== 200) {
    throw new Error(`esperava 200, veio ${res.status}`);
  }
});
