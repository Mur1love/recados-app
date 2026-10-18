'use strict';

// Módulo de acesso ao Postgres (oficina "Docker do Zero")
//
// DB_HOST=localhost é INTENCIONAL: dentro de um container ele aponta para o
// próprio container e NÃO para o Postgres — esse é o erro didático explicado
// no Hands-on 3 e no README. No docker-compose use o nome do serviço (postgres).

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'oficina',
});

function getPool() {
  return pool;
}

// A tabela é criada pela app na inicialização; IF NOT EXISTS evita conflito
// quando o instrutor já criou a tabela manualmente (Hands-on 2)
async function ensureSchema() {
  const SQL = `CREATE TABLE IF NOT EXISTS recados (
    id SERIAL PRIMARY KEY,
    autor VARCHAR(50) NOT NULL,
    mensagem TEXT NOT NULL,
    criado_em TIMESTAMP DEFAULT NOW()
  )`;
  await pool.query(SQL);
}

// true se o Postgres responde, false caso contrário (nunca joga erro)
async function pingPostgres() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function shutdownPostgres() {
  await pool.end();
}

// RETRY de conexão na subida (PRD seção 7): tenta até esgotar, logando em
// português cada tentativa; só então desiste com erro claro.
// Os limites podem ser sobrepostos por env (útil para testes); no padrão
// da oficina são 10 tentativas com 2s de intervalo.
const MAX_TENTATIVAS = parseInt(process.env.DB_RETRY_MAX_TENTATIVAS, 10) || 10;
const INTERVALO_MS = parseInt(process.env.DB_RETRY_INTERVALO_MS, 10) || 2000;

async function connectWithRetry() {
  const destino = `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}`;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      console.log(`Tentativa ${tentativa}/${MAX_TENTATIVAS} de conexão ao Postgres (${destino})...`);
      await ensureSchema();
      console.log('Postgres conectado! Tabela "recados" pronta.');
      return;
    } catch (e) {
      console.log(`Postgres não respondeu (${e.code || e.message}). Nova tentativa em ${INTERVALO_MS}ms...`);
      if (tentativa < MAX_TENTATIVAS) {
        await new Promise((r) => setTimeout(r, INTERVALO_MS));
      }
    }
  }
  throw new Error(`Postgres indisponível após ${MAX_TENTATIVAS} tentativas (${destino}).`);
}

module.exports = { getPool, ensureSchema, connectWithRetry, pingPostgres, shutdownPostgres };
