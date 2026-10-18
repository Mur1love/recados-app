// Mural de Recados — servidor Express (oficina "Docker do Zero")
// Rotas: POST/GET /recados, GET /visitas, GET /saude, GET / (página HTML)
'use strict';

const path = require('path');
const express = require('express');
const db = require('./db');
const redisMod = require('./redis');

const app = express();
app.use(express.json());

// Prontidão: UMA promessa única, resolvida pelo main após o retry bem-sucedido.
// (Reatribuir a variável não liberaria quem já aguardava a promessa antiga!)
let liberarBanco;
const bancoPronto = new Promise((res) => {
  liberarBanco = res;
});
app.use((req, res, next) => bancoPronto.then(() => next(), next));

// Log de requisições no stdout (método, rota, status) — pedido no PRD
app.use((req, res, next) => {
  res.on('finish', () => console.log(`${req.method} ${req.path} → ${res.statusCode}`));
  next();
});

// PORT é um exemplo clássico de configuração externa via variável de ambiente (como no Docker)
const PORT = parseInt(process.env.PORT, 10) || 3000;

let server = null;
let encerramentoEmAndamento = false;

// Subida: conecta no Postgres com RETRY (10 tentativas) ANTES de ouvir a porta
async function main() {
  console.log('Iniciando Mural de Recados...');
  await db.connectWithRetry();
  liberarBanco(); // libera as requisições que estavam esperando
  server = app.listen(PORT, () => {
    console.log(`App ouvindo em http://0.0.0.0:${PORT}`);
  });
}

main().catch((e) => {
  console.error('FALHA AO INICIAR:', e.message);
  if ((process.env.DB_HOST || 'localhost') === 'localhost') {
    console.error('DICA: dentro de um container, o Postgres não está em localhost. Use o nome do serviço (ex.: DB_HOST=postgres).');
  }
  process.exit(1);
});

// Encerramento limpo no SIGTERM/SIGINT: primeiro ESPERAMOS terminar as
// requisições HTTP em andamento (server.close completa de verdade), depois
// fechamos pool do Postgres e Redis, e só então saímos — para o
// `docker compose stop` terminar em poucos segundos sem cortar respostas no meio
async function encerrar() {
  if (encerramentoEmAndamento) return;
  encerramentoEmAndamento = true;
  if (server) {
    try {
      // closeIdleConnections derruba conexões keep-alive ociosas; requisições
      // EM ANDAMENTO continuam até terminar (o callback do close só dispara então)
      if (typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }
      await new Promise((resolve) => server.close(() => resolve()));
      console.log('Servidor HTTP fechado após drenar conexões');
    } catch {
      // listener já fechado
    }
  }
  try {
    await db.shutdownPostgres();
  } catch {
    // já fechado
  }
  try {
    await redisMod.shutdownRedis();
  } catch {
    // já fechado
  }
  process.exit(0);
}

['SIGTERM', 'SIGINT'].forEach((sinal) => {
  process.on(sinal, () => {
    console.log(`Recebido ${sinal}, encerrando...`);
    encerrar();
  });
});

// Serve os arquivos estáticos (página HTML) da pasta "public"
app.use(express.static(path.join(__dirname, 'public')));

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

// Última camada de erros: a API responde {"erro": "..."} em português para
// QUALQUER falha — JSON malformado do corpo e erros imprevistos de banco/rota
// (senão o Express devolve a página HTML padrão do erro, sem campo "erro")
app.use((erro, req, res, next) => {
  if (erro && (erro.type === 'entity.parse.failed' || erro instanceof SyntaxError)) {
    return res.status(400).json({ erro: 'O corpo da requisição não é um JSON válido.' });
  }
  console.error('Erro não tratado:', erro && erro.message ? erro.message : erro);
  if (res.headersSent) return next(erro);
  return res.status(500).json({ erro: 'Erro interno no servidor.' });
});

module.exports = {
  app,
  // getter: o listener nasce depois do retry — avaliado no momento do uso
  get server() {
    return server;
  },
};
