// Mural de Recados — servidor Express (oficina "Docker do Zero")
// Rotas: POST/GET /recados, GET /visitas, GET /saude, GET / (página HTML)
'use strict';

const path = require('path');
const express = require('express');
const db = require('./db');
const redisMod = require('./redis');

const app = express();
app.use(express.json());

// A app só responde depois do banco estar pronto (espera o CREATE TABLE)
let bancoPronto = db.ensureSchema();
app.use((req, res, next) => bancoPronto.then(() => next(), next));

// Log de requisições no stdout (método, rota, status) — pedido no PRD
app.use((req, res, next) => {
  res.on('finish', () => console.log(`${req.method} ${req.path} → ${res.statusCode}`));
  next();
});

// Serve os arquivos estáticos (página HTML) da pasta "public"
app.use(express.static(path.join(__dirname, 'public')));

// PORT é um exemplo clássico de configuração externa via variável de ambiente (como no Docker)
const PORT = parseInt(process.env.PORT, 10) || 3000;
const server = app.listen(PORT, () => {
  console.log(`App ouvindo em http://0.0.0.0:${PORT}`);
});

// Validação do PRD (RF1): autor 1–50 caracteres, mensagem 1–500, ambos string
function validarRecado(autor, mensagem) {
  if (typeof autor !== 'string' || autor.length < 1 || autor.length > 50) {
    return "O campo 'autor' é obrigatório e deve ter entre 1 e 50 caracteres.";
  }
  if (typeof mensagem !== 'string' || mensagem.length < 1 || mensagem.length > 500) {
    return "O campo 'mensagem' é obrigatório e deve ter entre 1 e 500 caracteres.";
  }
  return null;
}

// POST /recados — cria um recado com query PARAMETRIZADA ($1, $2), nunca concatenação
app.post('/recados', async (req, res, next) => {
  try {
    const { autor, mensagem } = req.body || {};
    const erro = validarRecado(autor, mensagem);
    if (erro) return res.status(400).json({ erro });
    const { rows } = await db
      .getPool()
      .query(
        'INSERT INTO recados (autor, mensagem) VALUES ($1, $2) RETURNING id, autor, mensagem, criado_em',
        [autor, mensagem]
      );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// GET /recados — lista do mais recente para o mais antigo, no máximo 50
app.get('/recados', async (req, res, next) => {
  try {
    const { rows } = await db
      .getPool()
      .query('SELECT id, autor, mensagem, criado_em FROM recados ORDER BY id DESC LIMIT 50');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// GET /visitas — contador de visitas no Redis; 503 em português se indisponível
app.get('/visitas', async (req, res) => {
  const n = await redisMod.getVisitas();
  if (n === null) return res.status(503).json({ erro: 'Redis indisponível' });
  res.json({ visitas: n });
});

// GET /saude — estado de cada dependência
app.get('/saude', async (req, res) => {
  const postgres = (await db.pingPostgres()) ? 'ok' : 'erro';
  res.json({ app: 'ok', postgres, redis: await redisMod.pingRedis() });
});

module.exports = { app, server };
