'use strict';

// Testes de ciclo de vida do processo (subida com retry e desligamento limpo)
// Não importam src/server: exercitam o binário real em subprocessos.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');

const SERVER = `${__dirname}/../src/server.js`;

function esperarSaida(proc, timeoutMs) {
  let stdout = '';
  proc.stdout.on('data', (chunk) => (stdout += chunk));
  proc.stderr.on('data', (chunk) => (stdout += chunk));
  return new Promise((resolve, reject) => {
    const registro = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`processo não saiu em ${timeoutMs}ms; saída até então:\n${stdout}`));
    }, timeoutMs);
    proc.on('exit', (code) => {
      clearTimeout(registro);
      resolve({ code, stdout });
    });
  });
}

function envBase(overrides) {
  return {
    DB_HOST: '127.0.0.1',
    REDIS_HOST: '',
    ...overrides,
  };
}

test('retry: desiste com erro claro após esgotar as tentativas', async () => {
  const proc = spawn(process.execPath, [SERVER], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: envBase({
      PORT: '3101',
      DB_PORT: '5439', // porta sem nenhum serviço
      DB_USER: 'test',
      DB_PASSWORD: 'test',
      DB_NAME: 'testdb',
      DB_RETRY_MAX_TENTATIVAS: '3',
      DB_RETRY_INTERVALO_MS: '150',
    }),
  });
  const { code, stdout } = await esperarSaida(proc, 30000);
  assert.notStrictEqual(code, 0, `esperava saída com erro, veio ${code}\n${stdout}`);
  assert.ok(stdout.includes('Tentativa 1/'), `faltou log de tentativa:\n${stdout}`);
  assert.ok(stdout.includes('Postgres indisponível após'), `faltou erro final claro:\n${stdout}`);
});

test('SIGTERM: encerra de forma limpa e rápida', async () => {
  const proc = spawn(process.execPath, [SERVER], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: envBase({
      PORT: '3102',
      DB_PORT: '5433', // Postgres de teste da suíte
      DB_USER: 'test',
      DB_PASSWORD: 'test',
      DB_NAME: 'testdb',
    }),
  });
  let stdout = '';
  proc.stdout.on('data', (chunk) => (stdout += chunk));

  // espera o log de inicio (app ouvindo) antes de enviar o sinal
  const ini = Date.now();
  while (!stdout.includes('ouvindo')) {
    if (Date.now() - ini > 15000) throw new Error(`app não iniciou:\n${stdout}`);
    await new Promise((r) => setTimeout(r, 100));
  }

  proc.kill('SIGTERM');
  const { code, stdout: saida } = await esperarSaida(proc, 10000);
  assert.strictEqual(code, 0, `esperava exit 0, veio ${code}\n${saida}`);
  assert.ok(saida.includes('encerrando'), `faltou log de encerramento:\n${saida}\n(${stdout})`);
  // O fechamento do HTTP deve COMPLETAR (callback do server.close) antes do exit:
  // requisições em andamento precisam terminar com o Postgres ainda de pé.
  assert.ok(
    saida.includes('Servidor HTTP fechado após drenar'),
    `Server.close deve completar antes do exit (requisições em andamento):\n${saida}\n(${stdout})`
  );
});
