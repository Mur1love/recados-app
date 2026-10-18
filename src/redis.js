'use strict';

// Cliente do Redis, LAZY e OPCIONAL (oficina "Docker do Zero")
//
// REDIS_HOST vazio = Redis desativado: a app sobe normalmente; /visitas
// responde 503 em português e NUNCA derruba o processo (PRD RF3).
// No docker-compose, use o nome do serviço (redis) em REDIS_HOST.

const redis = require('redis');

function isRedisEnabled() {
  return Boolean(process.env.REDIS_HOST);
}

// Assinatura da configuração para saber quando o cliente precisa ser refeito
function assinatura() {
  return `${process.env.REDIS_HOST || ''}:${process.env.REDIS_PORT || 6379}`;
}

let client = null;
let assinaturaAtual = null;

function createClient() {
  return redis.createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      connectTimeout: 2000,
      reconnectStrategy: false, // sem reconexão automática: cada requisição tenta de novo
    },
  });
}

// Fecha e descarta o cliente atual (troca de configuração ou encerramento)
async function descartarCliente() {
  if (client && client.isOpen) {
    try {
      await client.quit();
    } catch {
      // encerramento silencioso
    }
  }
  client = null;
  assinaturaAtual = null;
}

// Conecta na primeira chamada; devolve client pronto ou null se falhar
async function getClient() {
  if (!isRedisEnabled()) return null;
  if (client && assinaturaAtual !== assinatura()) {
    await descartarCliente(); // env mudou: refaz a conexão
  }
  if (!client) {
    client = createClient();
    assinaturaAtual = assinatura();
    client.on('error', () => {
      // silencioso: quem chama trata o erro (a rota /visitas cuida disso)
    });
  }
  try {
    if (!client.isReady) await client.connect();
    return client;
  } catch {
    await descartarCliente(); // próxima chamada tenta conectar de novo
    return null;
  }
}

// Executa fn(c) com o client conectado; devolve null em qualquer falha
async function withConnection(fn) {
  const c = await getClient();
  if (!c) return null;
  try {
    return await fn(c);
  } catch {
    return null;
  }
}

// Contador de visitas: INCR visitas (vira null se Redis indisponível)
async function getVisitas() {
  return withConnection((c) => c.incr('visitas'));
}

// Para usar no /saude: 'ok' | 'erro' | 'desativado'
async function pingRedis() {
  if (!isRedisEnabled()) return 'desativado';
  const ok = await withConnection((c) => c.ping());
  return ok ? 'ok' : 'erro';
}

async function shutdownRedis() {
  await descartarCliente();
}

module.exports = { isRedisEnabled, getVisitas, pingRedis, shutdownRedis };
