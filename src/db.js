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

module.exports = { getPool, ensureSchema, pingPostgres, shutdownPostgres };
