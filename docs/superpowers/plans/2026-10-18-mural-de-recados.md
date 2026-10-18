# Mural de Recados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App demo containerizada (Node 20 + Express + Postgres + Redis + Adminer) para a oficina "Docker do Zero", clonável e executável com `cp .env.example .env && docker compose up`.

**Architecture:** Um único `src/server.js` (<150 linhas, comentários em português) com Express, `pg` e `redis` (node-redis v4). Tabela criada na inicialização (`CREATE TABLE IF NOT EXISTS`), Redis opcional (vazio = desativado, erro = 503 sem cair), `/saude` reportando o estado de cada dependência.

**Tech Stack:** Node.js 20 (`node:20-alpine`), Express 4, `pg`, `redis` v4, `postgres:16`, `redis:7-alpine`, `adminer`, Docker Compose. Testes: `node:test` + `supertest` (apenas devDependency, verificação de contrato; fora do produto).

**Spec:** `PRD Mural de Recados (Docker do Zero).md` (raiz do repositório)

## Global Constraints

- Stack fixa (PRD seção 3): Node 20, Express, `pg`, `redis` v4, `postgres:16`, `redis:7-alpine`, `adminer`. Sem ORM/ frameworks pesados.
- Código curto: um `src/server.js` (<150 linhas) + `src/public/index.html`. Comentários em português explicando as partes ligadas a Docker (variáveis de ambiente, nomes de host).
- Env vars e padrões exatos (PRD seção 7): `PORT=3000`, `DB_HOST=localhost` (intencional/didático — comentar no código e README), `DB_PORT=5432`, `DB_USER=admin`, `DB_PASSWORD=admin`, `DB_NAME=oficina`, `REDIS_HOST=` (vazio = desativado), `REDIS_PORT=6379`.
- Queries sempre parametrizadas (`$1`, `$2`), nunca concatenação (PRD RF1).
- Validações exatas (RF1): `autor` string com 1–50 caracteres; `mensagem` string com 1–500 caracteres; falha ⇒ 400 `{"erro": "..."}` em português.
- Portas (PRD seções 4 e 8.3): só a app publicada ampla (`3000:3000`); postgres `127.0.0.1:5432:5432`; adminer `127.0.0.1:8080:8080`; redis sem `ports`.
- Retry: 10 tentativas × 2s contra o Postgres, logando cada uma, antes de desistir com erro claro (seção 7).
- Logs no stdout: inicialização, tentativas de conexão, requisição (método, rota, status).
- Encerramento limpo em SIGTERM/SIGINT, fechando conexões (seção 7).
- Compose sem a chave `version` (obsoleta), volume nomeado `pgdata`, healthcheck `pg_isready`, `depends_on` com `service_healthy` (postgres) e `service_started` (redis), sem `restart: unless-stopped` (seção 8.3).
- `.dockerignore`: `node_modules`, `.git`, `.env`, `npm-debug.log`, `README.md`.
- Nenhum segredo real; `admin`/`admin` apenas demonstração.

## Review Focus

Os cinco modos de falha mais prováveis que os testes por tarefa não pegam integralmente (e onde cada um é fixado):

1. **Contrato `/visitas` degradado:** com `REDIS_HOST` vazio **ou** Redis inacessível, `GET /visitas` deve ser 503 `{"erro": "Redis indisponível"}` e o processo **não pode cair**, e `/recados` deve continuar funcionando. → Fixado pelos testes de fonte dupla do Task 3 (env vazio + porta inalcançável) e Task 7-step5 (critério de aceite 5).
2. **Exposição restrita:** Postgres e Adminer devem estar vinculados a `127.0.0.1` (não `0.0.0.0`); redis sem porta publicada. → Fixado por `docker compose port`/`docker compose ps` no Task 7-step6 (critério 7).
3. **Persistência via pgdata:** recados sobrevivem a `down` + `up`; são apagados por `down -v`. → Fixado no Task 7-step4 e step8 (critério 4).
4. **Parada limpa:** após SIGTERM, o processo sai em poucos segundos e fecha conexões primeiro. → Fixado no Task 4-step4 (kill -TERM com verificação).
5. **Erro didático de `DB_HOST=localhost` (critério 6):** nenhum teste automatizado cobre; fixado pelo smoke local no Task 4-step5 e pelo smoke com container no Task 7-step7 (logs PT com "Tentativa X/10" e falha clara).

---

## File Structure

```
recados-app/
├── src/server.js             # Express, 5 rotas, integração pg/redis, shutdown gracioso
├── src/db.js                 # Pool pg + ensureSchema + connectWithRetry + shutdownPostgres
├── src/redis.js              # Cliente lazy com flag; incrementVisitas, pingRedis, shutdownRedis
├── src/public/index.html     # Página única: contador, formulário (fetch), lista
├── tests/server.test.js      # node:test + supertest: contrato das 4 rotas JSON + /
├── package.json
├── Dockerfile                # node20-alpine, npm ci, USER node, comentários PT
├── .dockerignore
├── docker-compose.yml        # 4 serviços, seção 8.3, volume pgdata, portas seccionadas
├── .env.example
├── .gitignore
└── README.md                 # 10 seções PT-BR (seção 10) + rede local (seção 11)
```

Nota de rotulagem: as tags de etapa (PRD seção 9) são inseridas como tags pontuais no fluxo `main`:
- `passo-1-app`: no fim do Task 4 (antes do Dockerfile existir).
- `passo-2-dockerfile`: no fim do Task 6.
- `passo-3-compose`: no fim do Task 7.

---

### Task 1: `git init`, `package.json`, `.gitignore`, Express e rota `/saude` provisória

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `src/server.js` (mínimo inicial; será incrementado nos Tasks 2–4)
- Create: `tests/server.test.js` (apenas smoke)

**Interfaces:**
- Consumes: nada.
- Produces: `package.json` com deps fixas (`express@^4`, `pg`, `redis` v4; dev `supertest`) e scripts `npm start` (`node src/server.js`), `npm test` (`node --test tests/`). `src/server.js` exporta `{ app, server }` via `module.exports = { app, server }`.

- [ ] **Step 1: Inicializar o git**

```bash
git init -b main
```

- [ ] **Step 2: Criar `package.json`**

```json
{
  "name": "mural-de-recados",
  "version": "1.0.0",
  "description": "Mural de Recados para a oficina Docker do Zero (app + postgres + redis + adminer)",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test tests/"
  },
  "license": "MIT",
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 3: Criar `.gitignore`**

```
node_modules
.env
npm-debug.log
```

- [ ] **Step 4: Instalar dependências**

```bash
npm install express@^4 pg redis@^4
npm install --save-dev supertest@^7
```

- [ ] **Step 5: Criar `src/server.js` inicial**

```js
// Mural de Recados — servidor Express (oficina "Docker do Zero")
// Rotas: POST/GET /recados, GET /visitas, GET /saude, GET / (página HTML)
'use strict';

const path = require('path');
const express = require('express');

const app = express();
app.use(express.json());

// Serve os arquivos estáticos (página HTML) da pasta "public"
app.use(express.static(path.join(__dirname, 'public')));

// PORT é um exemplo clássico de configuração externa via variável de ambiente (como no Docker)
const PORT = parseInt(process.env.PORT, 10) || 3000;
const server = app.listen(PORT, () => {
  console.log(`App ouvindo em http://0.0.0.0:${PORT}`);
});

// Rota provisória para o smoke do Task 1; será substituída pela versão
// com status real de postgres/redis no Task 2
app.get('/saude', (req, res) => res.json({ app: 'ok' }));

module.exports = { app, server };
```

- [ ] **Step 6: Criar `tests/server.test.js` com um smoke**

```js
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
```

- [ ] **Step 7: Rodar o teste**

```bash
npm test
```

Expected: 1 teste passando, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore src/server.js tests/server.test.js
git commit -m "chore: scaffold express com supertest e /saude inicial"
```

---

### Task 2: /saude real + rotas /recados (validações exatas + queries parametrizadas)

**Files:**
- Create: `src/db.js`
- Modify: `src/server.js`
- Test file: `tests/server.test.js` (acrescentar testes)

**Interfaces:**
- Consumes: Task 1 (`{ app, server }`, deps npm).
- Produces (usados nos Tasks 4–7):
  - `src/db.js` exporta:
    - `getPool()` → `pg.Pool` (host/porta/user/password/database lidos de `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`, default `localhost:5432/admin/admin/oficina`)
    - `ensureSchema()` → Promise<void> executando o SQL exato do PRD seção 6
    - `pingPostgres()` → Promise<boolean> (true se `SELECT 1` funciona)
    - `shutdownPostgres()` → Promise<void> (`pool.end()`)
  - Rotas:
    - `POST /recados` → 201 `{id, autor, mensagem, criado_em}` (ISO-8601 via JSON). Validações **nesta ordem**: autor ausente/não-string/vazio/>50 chars ⇒ 400; mensagem ausente/não-string/vazio/>500 chars ⇒ 400, sempre `{"erro": "..."}` em português.
    - `GET /recados` → 200 array `[...]` com ordem decrescente do mais recente e limite de 50, IDs e datas numéricas.
    - `GET /saude` → 200 `{app: "ok", postgres: "ok" | "erro", redis: "ok" | "erro" | "desativado"}`; resposta sempre 200 para o Request (o estado é lógico).

- [ ] **Step 1: Subir um Postgres 16 local para os testes**

```bash
docker run -d --rm --name test-pg -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=testdb -p 127.0.0.1:5432:5432 postgres:16-alpine
```

Aguarde readiness:

```bash
for i in $(seq 1 30); do docker exec test-pg pg_isready -U test && break; sleep 1; done
```

- [ ] **Step 2: Escrever testes (TDD — devem falhar primeiro)**

Acrescentar em `tests/server.test.js` (antes de `after`): setup de env no início do arquivo (antes do `require('../src/server')`) e mais `test()`:

```js
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '5432';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'testdb';
process.env.REDIS_HOST = '';              // Redis desativado por padrão nos testes
```

Testes a escrever (todos com supertest sobre `app`):

- `GET /saude` com Postgres no ar → 200, body `{app:"ok", postgres:"ok", redis:"desativado"}`.
- `POST /recados` `{"autor":"Ana","mensagem":"Oi!"}` → 201, body com `id` numérico, `autor "Ana"`, `mensagem "Oi!"`, `criado_em` presente.
- `POST /recados` sem `autor` → 400, body com chave `erro`.
- `POST /recados` com `autor` de 51 caracteres → 400.
- `POST /recados` com `mensagem` de 501 caracteres → 400.
- `POST /recados` com `mensagem` numérica (`{"mensagem": 123}` em JSON) → 400 (validação por tipo).
- `GET /recados` após criar 2 recados → 200, array de tamanho >= 2, primeiro item é o último criado (mais recente primeiro).
- `GET /recados` respeita `LIMIT 50`: criar 60 recados (loop), retornar exatamente 50.

- [ ] **Step 3: Rodar testes: devem FALHAR**

```bash
npm test
```

Expected: falha (rotas `/recados` não existem como DB; `/saude` não checa postgres ainda).

- [ ] **Step 4: Criar `src/db.js`**

Estrutura (pool único, comentários em português explicando DNS por nome de serviço no Docker):

```js
'use strict';

const { Pool } = require('pg');

// DB_HOST=localhost é INTENCIONAL: provoca erro didático no Hands-on 3
// (app dentro de container tenta localhost e falha), veja README.
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'oficina',
});

function getPool() { return pool; }

async function ensureSchema() {
  // CREATE TABLE IF NOT EXISTS evita conflito quando o instrutor já criou a tabela no Hands-on 2
  const SQL = `CREATE TABLE IF NOT EXISTS recados (
    id SERIAL PRIMARY KEY,
    autor VARCHAR(50) NOT NULL,
    mensagem TEXT NOT NULL,
    criado_em TIMESTAMP DEFAULT NOW()
  )`;
  await pool.query(SQL);
}

async function pingPostgres() { /* SELECT 1 → true/false */ }

async function shutdownPostgres() { /* pool.end() */ }

module.exports = { getPool, ensureSchema, pingPostgres, shutdownPostgres };
```

- [ ] **Step 5: Implementar rotas em `src/server.js`**

Alterar o arquivo para, na ordem deste pseudocódigo (funções no topo do arquivo):

1. `const db = require('./db');` e `await db.ensureSchema();` antes do `app.listen` (callback: log de inicialização em português).
2. Log por requisição: `app.use((req, res, next) => { res.on('finish', () => console.log(`${req.method} ${req.path} → ${res.statusCode}`)); next(); });` (registrar antes das rotas).
3. Validação: `function validarRecado(autor, mensagem)` retorna `null` se ok, senão a mensagem de erro em português; campos exatos:
   - autor: string, `1 <= len <= 50` (tratar `undefined`, não-string e string vazia)
   - mensagem: string, `1 <= len <= 500`.
4. `POST /recados`: `const { autor, mensagem } = req.body; const erro = validarRecado(autor, mensagem); if (erro) return res.status(400).json({ erro });` e depois `INSERT ... RETURNING *` com `$1/$2`.
5. `GET /recados`: `SELECT id, autor, mensagem, criado_em FROM recados ORDER BY id DESC LIMIT 50`.
6. `GET /saude`: `app: 'ok'`, `postgres: await db.pingPostgres() ? 'ok' : 'erro'` e `redis: 'desativado'` fixo (a integração real com `pingRedis()` chega no Task 3).

- [ ] **Step 6: Rodar testes: passar**

```bash
npm test
```

Expected: PASS (todos os testes deste task).

- [ ] **Step 7: Smoke com curl**

```bash
curl -sS http://127.0.0.1:3000/saude
curl -sS -X POST http://127.0.0.1:3000/recados -H 'Content-Type: application/json' -d '{"autor":"Ana","mensagem":"Oi!"}'
curl -sS http://127.0.0.1:3000/recados
```

- [ ] **Step 8: Remover container de teste**

```bash
docker rm -f test-pg
```

- [ ] **Step 9: Commit**

```bash
git add src/db.js src/server.js tests/server.test.js
git commit -m "feat: /recados com validações exatas e /saude com status postgres"
```

---

### Task 3: /visitas com Redis OPCIONAL (degradação graciosa)

**Files:**
- Create: `src/redis.js`
- Modify: `src/server.js`, `tests/server.test.js`

**Interfaces:**
- Produces (usados nos Tasks 4–7):
  - `src/redis.js` exporta:
    - `isRedisEnabled()` → bool (`process.env.REDIS_HOST` não vazio)
    - `getVisitas()` → Promise<number|null> — executa `INCR visitas`; `null` em qualquer falha (nunca throw)
    - `pingRedis()` → Promise<string> — retorna `'ok'`/`'erro'`/`'desativado'` (usado em `/saude`)
    - `shutdownRedis()` → Promise<void> (se cliente existe, `client.quit()`)
  - Rota básica: `GET /visitas` → se `!isRedisEnabled()` ⇒ 503 `{"erro":"Redis indisponível"}`; se INCR funcionar ⇒ 200 `{"visitas": N}`; se falhar (timeout/conexão) ⇒ 503 `{"erro":"Redis indisponível"}` **sem throw**.

- [ ] **Step 1: Escrever testes (TDD)**

Acrescentar novos testes em `tests/server.test.js`. Convenções:
- Redis `enabled` teste: suba o container de Redis de teste (vazio), setar `process.env.REDIS_HOST`/`REDIS_PORT` no teste, run, depois **resetar para `''`** no `finally` (isolamento).
- Redis `down` teste: setar `process.env.REDIS_HOST='127.0.0.1'` e `REDIS_PORT='6399'` (porta sem listener); `/visitas` deve retornar 503 **e o processo sobreviver** (assert: logo depois, `GET /saude` → 200).
- Sem Redis (padrão dos testes): `/visitas` → 503.
- Corpo de resposta: `{"visitas": N}` com N numérico >= 1; incrementando testes: chamada continua subindo (N2 == N1 + 1).

```js
test('GET /visitas: evita crash quando Redis inalcançável', async () => {
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6399';
  try {
    await request(app).get('/visitas'); // 503
    const res2 = await request(app).get('/saude');
    if (res2.status !== 200) throw new Error('app caiu após erro de redis');
  } finally {
    process.env.REDIS_HOST = '';
  }
});
```

- [ ] **Step 2: Subir Redis de teste (para o teste de incremento)**

```bash
docker run -d --rm --name test-redis -p 127.0.0.1:6379:6379 redis:7-alpine
```

- [ ] **Step 3: Rodar testes: devem FALHAR** (rota `/visitas` inexistente no server ou sem degradação).

- [ ] **Step 4: Criar `src/redis.js`**

Cliente **lazy** (só conecta na primeira chamada). Pseudocódigo:

```js
'use strict';
const redis = require('redis');

// REDIS_HOST vazio = Redis desativado (degradação graciosa, PRD RF3)
function isRedisEnabled() {
  return Boolean(process.env.REDIS_HOST);
}

let client = null;

function getClient() {
  if (!client) {
    client = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        connectTimeout: 2000,
        reconnectStrategy: false,          // sem retry automático dentro de request
      },
    });
    client.on('error', () => {/* silencioso: o handler da rota trata o erro */});
  }
  return client;
}

async function withConn(fn) {
  if (!isRedisEnabled()) return null;
  const c = getClient();
  await c.connect();
  try { return await fn(c); } catch { return null; }
}

async function getVisitas() { /* withConn INCR visitas */ }
async function pingRedis() { /* 'ok' | 'erro' | 'desativado' */ }
async function shutdownRedis() { /* fecha a conexão do client com o Redis */ }

module.exports = { isRedisEnabled, getVisitas, pingRedis, shutdownRedis };
```

- [ ] **Step 4: Implementar rota em `src/server.js`**

```js
const redisMod = require('./redis'); // no topo do server.js, junto com require('./db')

app.get('/visitas', async (req, res) => {
  const n = await redisMod.getVisitas();
  if (n === null) return res.status(503).json({ erro: 'Redis indisponível' });
  return res.json({ visitas: n });
});
```

E trocar `redis: 'desativado'` fixo em `/saude` pelo `await pingRedis()`.

- [ ] **Step 5: Rodar testes: PASSAR** (incluindo `/visitas` sem Redis → 503, com Redis de teste → número crescente, Redis inexistente na porta 6399 → 503 sem crash; `/saude` reflete `'ok'`/`'erro'`).

- [ ] **Step 6: Remover Redis de teste**

```bash
docker rm -f test-redis
```

- [ ] **Step 7: Commit**

```bash
git add src/redis.js src/server.js tests/server.test.js
git commit -m "feat: /visitas opcionalmente com Redis, 503 sem cair; /saude com redis real"
```

---

### Task 4: Retry de conexão + shutdown gracioso

**Files:**
- Modify: `src/db.js` (acrescentar `connectWithRetry`)
- Modify: `src/server.js` (boot com retry, SIGTERM/SIGINT)
- Test file: `tests/server.test.js` (agora com Postgres real de teste)

**Interfaces:**
- Consumes: Tasks 1–3 (app exportada, db e redis módulos).
- Produces: binário executável `npm start` que:
  - Ao iniciar: chama `connectWithRetry()` (10 tentativas, 2s de intervalo, `console.log` em português) para rodar `ensureSchema`, e **só depois** abre o `listen`. Desiste com erro claro (exit code != 0).
  - Ao SIGTERM/SIGINT: fecha `server.close()`, aguarda pool/redis terminarem e sai em < 2s, logando em português.
- `src/db.js` ganha: `connectWithRetry()` → Promise<void> (chamado pelo server no boot).

- [ ] **Step 1: Implementar `connectWithRetry` em `src/db.js`**

Implementar de modelo simples (uma função nova, comentários em português; `10` e `2000` como constantes):

```js
const MAX_TENTATIVAS = 10;
const INTERVALO_MS = 2000;

async function connectWithRetry() {
  // Tenta conectar + criar a tabela; loga "Tentativa X/10 ..." a cada falha;
  // espera INTERVALO_MS e repete; após 10 tentativas desiste com erro claro.
}
```

- [ ] **Step 2: Atualizar `src/server.js` para usar retry + shutdown**

Boot:

```js
async function main() {
  console.log('Iniciando Mural de Recados...');
  await db.connectWithRetry();       // prepara banco antes de aceitar requisições
  server = app.listen(PORT, () => console.log(`App aguardando em http://0.0.0.0:${PORT}`));
}

main();

['SIGTERM', 'SIGINT'].forEach((sig) => {
  process.on(sig, async () => {
    console.log(`Recebido ${sig}, encerrando...`);
    if (server) server.close();       // para de aceitar novas requisições
    await db.shutdownPostgres();
    await redisMod.shutdownRedis();
    process.exit(0);
  });
});
```

Manter export `{ app, server }` funcionando para os testes: pode-se simular com `let server = null` e atribuição após `listen` retornando, já que o testes usam `app` via supertest e fecham com `if (server) server.close()`.

- [ ] **Step 3: Verificar testes com Postgres de teste real (mesmo container do Task 2)**

```bash
docker run -d --rm --name test-pg -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=testdb -p 127.0.0.1:5432:5432 postgres:16-alpine
for i in $(seq 1 30); do docker exec test-pg pg_isready -U test && break; sleep 1; done
npm test
```

Expected: PASS. (Aqui os testes nos exercem db com Postgres real.)

- [ ] **Step 4: Smoke de `/saude` e níveis (manual, com o container acima):**

```bash
DB_HOST=127.0.0.1 DB_USER=test DB_PASSWORD=test DB_NAME=testdb node src/server.js &
sleep 2
curl -sS http://127.0.0.1:3000/saude
kill -TERM %1
```

Expected: `/saude` com `postgres:"ok"`; após `kill -TERM`, o processo sai (< 2s) com log "encerrando".

- [ ] **Step 5: Smoke do erro didático (sem Postgres — critério 6):**

```bash
DB_HOST=127.0.0.1 PORT=3001 node src/server.js
```

Expected: 10 logs "Tentativa X/10 de conexão ao Postgres..." a cada 2s, depois erro claro e exit code != 0. Verificar também que os logs do retry ficam em português independentemente do tipo de erro (ECONNREFUSED ou timeout), pois o loop trata qualquer exceção da mesma forma.

- [ ] **Step 6: Rodar `npm test` uma última vez e remover o container**

```bash
npm test
docker rm -f test-pg
```

- [ ] **Step 7: Commit + tag `passo-1-app`**

```bash
git add src/db.js src/server.js src/redis.js
git commit -m "feat: connectWithRetry e shutdown gracioso no SIGTERM/SIGINT"
git tag passo-1-app
```

---

### Task 5: Página única (`src/public/index.html`)

**Files:**
- Create: `src/public/index.html`
- Modify: `tests/server.test.js` (adicionar testes)

**Interfaces:**
- Consumes: rotas do Task 2 (`/recados`) e Task 3 (`/visitas`).
- Produces: página HTML respondida por `GET /` (via `express.static`). Estrutura exigida pelo PRD seção 5:
  - `<meta name="viewport" ...>` (responsiva)
  - contador no topo: `<p id="contador">` com fetch a `/visitas`; em erro ⇒ texto `Contador indisponível`
  - `<form id="form-recado">` com campos `autor` (input, `name="autor"`) e `mensagem` (textarea, `name="mensagem"`) que envia por `fetch('/recados')` com JSON
  - Recado criado aparece na lista `<ul id="lista-recados">`
  - Refresh da listagem após POST (nova fetch `GET /recados`)
  - CSS inline simples, sem frameworks

- [ ] **Step 1: Escrever testes (TDD — devem falhar antes da página existir)**

```js
test('Página carrega e estrutura obrigatória presente', async () => {
  const res = await request(app).get('/');
  if (res.status !== 200) throw new Error(`A página deve ter HTTP 200, veio ${res.status}`);
  const html = res.text;
  if (!html.includes('<form id="form-recado">')) throw new Error('form faltando');
  if (!html.includes('id="autor"')) throw new Error('campo autor faltando');
  if (!html.includes('name="mensagem"')) throw new Error('campo mensagem faltando');
  if (!html.includes('id="lista-recados"')) throw new Error('lista faltando');
  if (!html.includes('fetch(`/visitas') && !html.includes("fetch('/visitas")) {
    throw new Error('contador /visitas não carregado via fetch');
  }
});
```

- [ ] **Step 2: Rodar testes: FALHAM** (página não existe ainda).

- [ ] **Step 3: Criar `src/public/index.html`**

Estrutura resumida (sem framework, `<style>` inline, `<script>` inline com DOM API):

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mural de Recados</title>
  <style> /* CSS simples, responsivo, alvo telas pequenas */ </style>
</head>
<body>
  <header>
    <h1>Mural de Recados</h1>
    <p id="contador">Contador indisponível</p>
  </header>

  <form id="form-recado">
    <input id="autor" name="autor" maxlength="50" placeholder="Seu nome" required>
    <textarea name="mensagem" maxlength="500" placeholder="Sua mensagem" required></textarea>
    <button type="submit">Enviar</button>
  </form>

  <ul id="lista-recados"></ul>

  <script>
    // fetch('/visitas') no load → contador; erro → 'Contador indisponível'
    // submit do form → fetch('/recados', POST JSON) → atualiza <ul id="lista-recados">
    // fetch('/recados') GET no load e após cada POST
  </script>
</body>
</html>
```

- [ ] **Step 4: Rodar testes: PASSAM**

- [ ] **Step 5: Commit**

```bash
git add src/public/index.html tests/server.test.js
git commit -m "feat: página única com formulário, lista e contador"
```

---

### Task 6: Dockerfile + .dockerignore

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: `package.json` (Task 1) e diretório `src/` (Tasks 1–5).
- Produces: imagem `mural-recados:dev` que roda a app em container com `USER node`, `WORKDIR /app` e `CMD ["node", "src/server.js"]`.
  - Nota de divergência minWidth do PRD: PRD 8.1 literal `CMD ["node", "server.js"]`, porém a estrutura do repositório (PRD 9) coloca server.js em `src/`. Como `COPY src ./src`, o CMD correto é `node src/server.js`. Registrar o comentário no Dockerfile.

- [ ] **Step 1: Escrever `Dockerfile`** seguindo exatamente PRD 8.1, com comentários em português em cada instrução:

```dockerfile
# Imagem base leve com Node.js 20 (Alpine)
FROM node:20-alpine

# Diretório de trabalho dentro do container
WORKDIR /app

# Copia primeiro os manifests de dependências para usar cache de camadas:
# `npm ci` só reexecuta se package.json mudar
COPY package*.json ./
RUN npm ci --omit=dev

# Agora copia o código da aplicação (muda com mais frequência)
COPY src ./src

# Porta que a app usa (documentação + bind automático)
EXPOSE 3000

# Roda como usuário sem privilégio ( usuário "node" já existe na imagem oficial )
USER node

# Comando que inicia a app (código está em src/, conforme estrutura do repositório)
CMD ["node", "src/server.js"]
```

- [ ] **Step 2: Criar `.dockerignore` com a lista exata**

```
node_modules
.git
.env
npm-debug.log
README.md
```

- [ ] **Step 3: Construir a imagem**

```bash
docker build -t mural-recados:dev .
```

Expected: build termina sem erro.

- [ ] **Step 4: Smoke de rodar o container contra Postgres em rede Docker manual (simula Hands-on 3)**

```bash
docker run -d --rm --name manual-pg -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=admin -e POSTGRES_DB=oficina postgres:16-alpine
docker network create oficina-net 2>/dev/null || true
docker network connect oficina-net manual-pg
docker run -d --rm --name manual-app --network oficina-net -p 127.0.0.1:3000:3000 -e DB_HOST=manual-pg mural-recados:dev
for i in $(seq 1 20); do docker exec manual-pg pg_isready -U admin && break; sleep 1; done
curl -sS http://127.0.0.1:3000/saude
docker rm -f manual-app manual-pg
docker network rm oficina-net
```

Expected: `/saude` com `postgres:"ok"`. (Porta publicada restrita a 127.0.0.1, coerente com a regra de segurança eventual do Task 7.)

- [ ] **Step 5: Commit + tag `passo-2-dockerfile`**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: Dockerfile com npm ci, USER node, cache e comentários em português"
git tag passo-2-dockerfile
```

---

### Task 7: docker-compose.yml + .env.example (critérios de aceite 1–7)

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

**Interfaces:**
- Consumes: Tasks 2–6 (rotas, retry, imagem construída).
- Produces: `docker compose up` com 4 serviços, portas seccionadas, volume `pgdata` nomeado, healthcheck pg, Redis sem portas.

- [ ] **Step 1: Criar `.env.example`** com as env vars da seção 7 (valores do compose):

```env
# Porta da aplicação no host
PORT=3000

# Endereço do Postgres. Dentro do Compose, use o nome do serviço.
# DB_HOST=localhost é intencional para o Hands-on 3 (erro didático).
DB_HOST=postgres
DB_PORT=5432
DB_USER=admin
DB_PASSWORD=admin
DB_NAME=oficina

# Redis — dentro do Compose use o nome do serviço.
# Vazio (REDIS_HOST=) desativa o contador de visitas.
REDIS_HOST=redis
REDIS_PORT=6379
```

- [ ] **Step 2: Criar `docker-compose.yml`** exatamente conforme PRD 8.3, **sem `version:`**:

```yaml
# Mural de Recados — os quatro serviços da oficina
services:
  app:
    build: .
    ports:
      - "3000:3000"              # única porta acessível pela rede local
    environment:
      PORT: 3000
      DB_HOST: postgres          # nome do serviço no Compose, não localhost
      DB_PORT: 5432
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ${DB_NAME}
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - pgdata:/var/lib/postgresql/data    # persistência dos recados
    ports:
      - "127.0.0.1:5432:5432"    # restrito ao notebook do instrutor
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER:-admin} -d $${POSTGRES_DB:-oficina}"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine        # sem ports: só a app fala com ele, pela rede interna

  adminer:
    image: adminer
    ports:
      - "127.0.0.1:8080:8080"    # interface do Postgres, só na máquina local
    depends_on:
      - postgres

volumes:
  pgdata:
```

- [ ] **Step 3: Subir com o `.env` do passo 1, verificar critério 1 e contrato das rotas:**

```bash
cp .env.example .env
docker compose up -d --build
sleep 8
curl -sS http://127.0.0.1:3000/saude
curl -sS -X POST http://127.0.0.1:3000/recados -H 'Content-Type: application/json' -d '{"autor":"Ana","mensagem":"Compose!"}'
curl -sS http://127.0.0.1:3000/recados
curl -sS http://127.0.0.1:3000/visitas
```

Expected: `/saude` com `postgres:"ok"` e `redis:"ok"`; POST → 201; GET lista; `/visitas` → número >= 1; `curl http://127.0.0.1:8080/` → 200 Html de Adminer.

- [ ] **Step 4: Critério 4 (persistence):**

```bash
docker compose down
docker compose up -d
sleep 5
curl -sS http://127.0.0.1:3000/recados     # recado "Compose!" deve ainda estar lá
```

- [ ] **Step 5: Critério 5 (redis opcional), vários cenários — reiniciar app com REDIS_HOST vazio (a env, sem alterar o código):**

```bash
docker compose down
# editar .env: REDIS_HOST= (linha vazia; é o cenário do Hands-on de degradação)
docker compose up -d
sleep 8
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/visitas   # deve imprimir 503
curl -sS http://127.0.0.1:3000/recados     # deve funcionar normalmente
```

- [ ] **Step 6: Critério 7 (exposição restrita):**

```bash
docker compose ps          # app: 0.0.0.0:3000; postgres: 127.0.0.1:5432; adminer: 127.0.0.1:8080
docker compose port postgres 5432
docker compose port adminer 8080
```

Expected: `127.0.0.1:5432` e `127.0.0.1:8080` (não `0.0.0.0`).

- [ ] **Step 7: Critério 6 (erro didático de `DB_HOST=localhost` dentro do container):**

Não é gate automático — é a checagem que o instrutor fará no Hands-on 3. Rodar a app com `DB_HOST=localhost` dentro de um container (sem rede compartilhada com o Postgres):

```bash
docker compose stop app
docker compose run --rm -e DB_HOST=localhost -p 3000:3000 app   # observa 10 tentativas e erro claro nos logs; Ctrl+C depois
docker compose start app
```

Expected nos logs: "Tentativa X/10" em português e falha final clara — é justamente o erro didático do Hands-on 3.

- [ ] **Step 8: Critério 4 completo (limpa tudo):**

```bash
docker compose down -v
cp .env.example .env
docker compose up -d
sleep 8
curl -sS http://127.0.0.1:3000/recados     # deve voltar `[]` (dados apagados)
```

- [ ] **Step 9: Commit + tag `passo-3-compose`**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: compose 4 serviços com pgdata, healthcheck e portas restritas"
git tag passo-3-compose
```

---

### Task 8: README.md

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: todos os artefatos dos Tasks 1–7 (rotas reais, tags reais).
- Produces: README em português, na estrutura exata do PRD seção 10+11.

- [ ] **Step 1: Criar `README.md`** com estas seções (em português, na ordem do PRD 10):

1. **O que é o projeto** (2–3 linhas) + diagrama ASCII dos containers (app ↔ postgres, app ↔ redis, adminer ↔ postgres).
2. **Pré-requisitos:** Docker Desktop (Windows/Mac) ou Docker Engine + Compose (Linux); WSL2 no Windows; `docker --version`; `docker compose version`.
3. **Preparação antes da oficina:** `docker pull ubuntu`, `docker pull node:20-alpine`, `docker pull postgres:16`, `docker pull redis:7-alpine`, `docker pull adminer`.
4. **Como rodar:** `git clone`, `cp .env.example .env`, `docker compose up --build`, link `http://localhost:3000`.
5. **Como testar:** curl de `/saude`, `POST /recados`, `GET /recados`, `GET /visitas` e a homepage.
6. **Ver os dados:** Adminer em `localhost:8080` (Sistema: PostgreSQL, Servidor: `postgres`, Usuário/Senha: `admin`, Base: `oficina`), `docker compose exec postgres psql -U admin oficina` e `docker compose exec redis redis-cli GET visitas`.
7. **Acessar de outro dispositivo na mesma rede** (seção 11, 6 sub-passos, com plano de B hotspot).
8. **Comandos úteis:** `ps`, `logs -f`, `exec`, `stop`, `down`, `down -v` (explicando que `-v` apaga os dados).
9. **Problemas comuns:** porta já em uso, Docker não iniciado, Postgres ainda subindo, `localhost` dentro do container (o erro didático).
10. **Seguindo por etapas:** tabela das tags `passo-1-app`, `passo-2-dockerfile`, `passo-3-compose` com `git checkout`.

- [ ] **Step 2: Verificação manual** — conferir item a item da seção 10 e o checklist completo da seção 11, comparando com os requisitos do PRD (validação de conteúdo, não de execução).

- [ ] **Step 3: Commit final**

```bash
git add README.md
git commit -m "docs: README com todas as seções do PRD"
```

---

## Execution Notes

- **Sequenciamento obrigatório:** os tasks dependem uns dos outros por interface e scaffolding (Task 2 constrói sobre o Task 1, e assim por diante). Não paralelizar.
- **Testes por contrato (não extensos, respeitando PRD seção 2):** ~10 testes de rotas via supertest, contra Postgres/Redis reais de `docker run` sempre que o teste exercita banco — nada de mocks.
- **Tags:** criadas no fim de cada task correspondente (`passo-1-app` no Task 4, `passo-2-dockerfile` no Task 6, `passo-3-compose` no Task 7), na mesma linha do `main`; sem branches paralelos.
- **Containers de teste:** subir explicitamente com `docker run` antes dos testes que precisam de banco e remover com `docker rm -f test-pg` / `docker rm -f test-redis` ao final de cada task.
- **`.env`:** nunca commitado (`.gitignore` cobre); apenas `.env.example` entra no repositório. O `cp .env.example .env` do Task 7 é manual e local.
