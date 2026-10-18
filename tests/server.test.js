'use strict';

// Variáveis de ambiente ANTES do require: db.js lê o env na inicialização
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '5433';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'testdb';
process.env.REDIS_HOST = ''; // Redis desativado por padrão nos testes

const { test, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const mod = require('../src/server');
const { app } = mod;
const db = require('../src/db');
const redisMod = require('../src/redis');

// Encerramento completo ao fim da suíte: fecha o listener, o Redis e o pool
after(() => {
  if (mod.server) mod.server.close();
});

after(() => redisMod.shutdownRedis());

const AUTOR_VALIDO = 'Ana';
const MENSAGEM_VALIDA = 'Oi!';

function criarRecado(autor, mensagem) {
  return request(app).post('/recados').send({ autor, mensagem });
}

test('smoke: GET /saude responde 200 com JSON', async () => {
  const res = await request(app).get('/saude').expect('Content-Type', /json/);
  assert.strictEqual(res.status, 200);
});

test('GET /saude com Postgres no ar: postgres=ok e redis=desativado', async () => {
  const res = await request(app).get('/saude');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.app, 'ok');
  assert.strictEqual(res.body.postgres, 'ok');
  assert.strictEqual(res.body.redis, 'desativado');
});

test('POST /recados com payload correto: 201 com recado completo', async () => {
  const res = await criarRecado(AUTOR_VALIDO, MENSAGEM_VALIDA);
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.autor, AUTOR_VALIDO);
  assert.strictEqual(res.body.mensagem, MENSAGEM_VALIDA);
  assert.strictEqual(typeof res.body.id, 'number');
  assert.ok(res.body.criado_em);
});

test('POST /recados sem autor: 400 com erro em português', async () => {
  const res = await request(app).post('/recados').send({ mensagem: MENSAGEM_VALIDA });
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.erro);
});

test('POST /recados com autor de 51 caracteres: 400', async () => {
  const res = await criarRecado('a'.repeat(51), MENSAGEM_VALIDA);
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.erro);
});

test('POST /recados com mensagem de 501 caracteres: 400', async () => {
  const res = await criarRecado(AUTOR_VALIDO, 'm'.repeat(501));
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.erro);
});

test('POST /recados com mensagem numérica: 400 (validação por tipo)', async () => {
  const res = await request(app).post('/recados').send({ autor: AUTOR_VALIDO, mensagem: 123 });
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.erro);
});

test('GET /recados: lista do mais recente para o mais antigo', async () => {
  await criarRecado('Primeiro', 'um');
  const segunda = await criarRecado('Segundo', 'dois');
  const res = await request(app).get('/recados');
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 2);
  assert.strictEqual(res.body[0].mensagem, 'dois');
  assert.strictEqual(res.body[0].autor, 'Segundo');
  assert.ok(res.body[0].id >= res.body[1].id);
  assert.strictEqual(segunda.status, 201);
});

test('GET /recados respeita LIMIT 50', async () => {
  for (let i = 0; i < 60; i++) {
    await criarRecado('Enxame', `m-${i}`);
  }
  const res = await request(app).get('/recados');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 50);
  assert.strictEqual(res.body[0].mensagem, 'm-59');
});

test('GET /visitas sem Redis (padrão dos testes): 503 com erro', async () => {
  process.env.REDIS_HOST = '';
  try {
    const res = await request(app).get('/visitas');
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.erro, 'Redis indisponível');
  } finally {
    process.env.REDIS_HOST = '';
  }
});

test('GET /visitas com Redis real: INCR crescente e 200', async () => {
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  try {
    const r1 = await request(app).get('/visitas');
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(typeof r1.body.visitas, 'number');
    assert.ok(r1.body.visitas >= 1);
    const r2 = await request(app).get('/visitas');
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.body.visitas, r1.body.visitas + 1);
  } finally {
    process.env.REDIS_HOST = '';
    process.env.REDIS_PORT = '6379';
  }
});

test('GET /visitas com Redis inalcançável: 503 sem crash e /saude segue viva', async () => {
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6399';
  try {
    const res = await request(app).get('/visitas');
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.erro, 'Redis indisponível');
    const saude = await request(app).get('/saude');
    assert.strictEqual(saude.status, 200);
  } finally {
    process.env.REDIS_HOST = '';
  }
});

test('GET /saude com Redis configurado e no ar: redis=ok', async () => {
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  try {
    const res = await request(app).get('/saude');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.redis, 'ok');
  } finally {
    process.env.REDIS_HOST = '';
  }
});
