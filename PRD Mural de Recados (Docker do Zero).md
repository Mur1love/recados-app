# PRD: Mural de Recados (Docker do Zero)

**Uso:** projeto de demonstração da oficina "Docker do Zero". Este documento serve como especificação para gerar a aplicação completa (código, Dockerfile, docker-compose, README).

## 1. Visão geral

**Objetivo:** uma aplicação mínima, cujo único propósito é **demonstrar a integração entre containers** (app, PostgreSQL, Redis e Adminer) e o uso do Docker Compose. A aplicação deve ser simples, legível e fácil de explicar ao vivo.

**Público:** estudantes iniciantes que vão clonar o repositório no GitHub e rodar com um único comando.

**Resultado esperado:** `git clone` + `cp .env.example .env` + `docker compose up` e tudo funciona.

## 2. Objetivos e não objetivos

**Objetivos**

- Mostrar uma app falando com dois bancos diferentes (Postgres para dados permanentes, Redis para contador rápido).
- Ser demonstrável em etapas (ver seção 9), acompanhando o roteiro da oficina.
- Permitir que participantes na mesma rede acessem a app pelo IP do notebook do instrutor.
- Ter código curto, comentado em português e sem dependências desnecessárias.

**Não objetivos**

- Autenticação, paginação, testes automatizados extensos, frontend elaborado, deploy em produção.
- Uso de ORM ou frameworks pesados.

## 3. Stack

| Item | Escolha |
| --- | --- |
| Linguagem | Node.js 20 (imagem `node:20-alpine`) |
| Framework | Express |
| Cliente Postgres | `pg` |
| Cliente Redis | `redis` (node-redis v4) |
| Banco relacional | `postgres:16` |
| Cache/contador | `redis:7-alpine` |
| Interface do banco | `adminer` |

> Se preferir Python, troque esta seção por: Python 3.12, FastAPI, `psycopg` e `redis-py`. Todo o resto do documento permanece igual.

## 4. Arquitetura

Quatro containers na mesma rede do Compose, que se enxergam **pelo nome do serviço**:

| Serviço | Papel | Porta no host | Exposição |
| --- | --- | --- | --- |
| `app` | API + página HTML | 3000 | **Rede local** (`3000:3000`) |
| `postgres` | Recados (dados permanentes) | 5432 | **Somente a máquina local** (`127.0.0.1:5432:5432`) |
| `redis` | Contador de visitas | nenhuma | Interna (acesso via `docker compose exec`) |
| `adminer` | Interface web do Postgres | 8080 | **Somente a máquina local** (`127.0.0.1:8080:8080`) |

**Regra de segurança da oficina:** apenas a porta da `app` fica acessível para a rede. Adminer e Postgres ficam restritos ao notebook do instrutor.

## 5. Requisitos funcionais

### RF1. Criar recado (obrigatório)

`POST /recados`

- Corpo JSON: `{"autor": "Ana", "mensagem": "Oi!"}`
- Validação: `autor` (1 a 50 caracteres) e `mensagem` (1 a 500 caracteres) obrigatórios e do tipo string.
- Sucesso: **201** com o recado criado (`id`, `autor`, `mensagem`, `criado_em`).
- Erro de validação: **400** com `{"erro": "mensagem clara em português"}`.
- Deve usar **queries parametrizadas** (`$1`, `$2`), nunca concatenação de strings.

### RF2. Listar recados (obrigatório)

`GET /recados`

- Retorna **200** com array de recados, do mais recente para o mais antigo, limitado a 50.

### RF3. Contador de visitas (obrigatório, depende do Redis)

`GET /visitas`

- Executa `INCR visitas` no Redis e retorna **200** com `{"visitas": N}`.
- Se o Redis não estiver configurado (variável `REDIS_HOST` vazia) ou estiver indisponível, retorna **503** com `{"erro": "Redis indisponível"}`. A app **não pode cair** por isso. Esse comportamento permite usar a app só com Postgres nos Hands-on 2 e 3.

### RF4. Health check (obrigatório)

`GET /saude`

- Retorna **200** com `{"app": "ok", "postgres": "ok|erro", "redis": "ok|erro|desativado"}`.
- Útil para demonstrar o estado de cada dependência.

### RF5. Página inicial (desejável)

`GET /`

- Uma única página HTML estática (sem framework, CSS simples inline) com:
  - formulário (autor + mensagem) que faz `POST /recados` via `fetch`;
  - lista dos recados atualizada após o envio;
  - contador de visitas exibido no topo (chama `/visitas`; se falhar, mostra "contador indisponível").
- Objetivo: participantes poderem enviar recados **pelo navegador do celular** quando acessarem pelo IP da rede.
- Deve ser responsiva e legível em tela pequena.

## 6. Requisitos de dados

Tabela criada **automaticamente pela app na inicialização** (`CREATE TABLE IF NOT EXISTS`):

```sql
CREATE TABLE IF NOT EXISTS recados (
  id SERIAL PRIMARY KEY,
  autor VARCHAR(50) NOT NULL,
  mensagem TEXT NOT NULL,
  criado_em TIMESTAMP DEFAULT NOW()
);
```

- Redis: uma única chave `visitas` (inteiro).
- Como o instrutor cria a tabela manualmente no Hands-on 2, o `IF NOT EXISTS` evita conflito quando a app rodar depois.

## 7. Requisitos não funcionais

- **Configuração por variáveis de ambiente**, com estes nomes e padrões:

| Variável | Padrão | Observação |
| --- | --- | --- |
| `PORT` | `3000` | Porta da app |
| `DB_HOST` | `localhost` | No compose: `postgres` |
| `DB_PORT` | `5432` |  |
| `DB_USER` | `admin` |  |
| `DB_PASSWORD` | `admin` |  |
| `DB_NAME` | `oficina` |  |
| `REDIS_HOST` | *(vazio)* | No compose: `redis`. Vazio = Redis desativado |
| `REDIS_PORT` | `6379` |  |

- O padrão `DB_HOST=localhost` é **intencional**: ele provoca o erro didático do Hands-on 3 (app em container tentando `localhost`). Comentar isso no código e no README.
- **Retry de conexão:** ao iniciar, a app tenta conectar no Postgres até 10 vezes, com 2 segundos de intervalo, logando cada tentativa em português. Só depois desiste com erro claro.
- **Logs** simples no stdout (`console.log`): inicialização, tentativas de conexão, cada requisição (método, rota, status).
- **Encerramento limpo:** tratar `SIGTERM`/`SIGINT` fechando conexões, para o `docker compose stop` ser rápido.
- **Código curto:** idealmente um `server.js` (menos de 150 linhas) + `public/index.html`. Comentários em português explicando as partes ligadas a Docker (variáveis de ambiente, nomes de host).
- Sem segredos reais no repositório: usuário e senha `admin` são apenas para demonstração.

## 8. Requisitos de Docker

### 8.1 Dockerfile

- Base `node:20-alpine`, `WORKDIR /app`.
- Copiar `package*.json` primeiro, rodar `npm ci --omit=dev`, depois copiar o código (aproveitar cache de camadas, e comentar isso).
- `EXPOSE 3000` e `CMD ["node", "server.js"]`.
- Rodar como usuário não root (`USER node`).
- Comentários em português em cada instrução (FROM, WORKDIR, COPY, RUN, CMD), pois será escrito/explicado ao vivo.

### 8.2 .dockerignore

`node_modules`, `.git`, `.env`, `npm-debug.log`, `README.md`.

### 8.3 docker-compose.yml

- Serviços: `app`, `postgres`, `redis`, `adminer` (sem a chave `version`, que é obsoleta).
- Variáveis lidas do arquivo `.env`.
- `app`: `build: .`, `ports: ["3000:3000"]`, `DB_HOST=postgres`, `REDIS_HOST=redis`, `depends_on` com `postgres: service_healthy` e `redis: service_started`.
- `postgres`: imagem `postgres:16`, volume nomeado `pgdata:/var/lib/postgresql/data`, `ports: ["127.0.0.1:5432:5432"]`, healthcheck com `pg_isready`.
- `redis`: imagem `redis:7-alpine`, **sem** `ports`.
- `adminer`: imagem `adminer`, `ports: ["127.0.0.1:8080:8080"]`, `depends_on: [postgres]`.
- `restart: unless-stopped` não é necessário (é demonstração).
- Comentários em português explicando cada bloco.

### 8.4 Arquivos de ambiente

- `.env.example` com todas as variáveis da seção 7 (valores do compose).
- `.gitignore` com `.env` e `node_modules`.

## 9. Estrutura do repositório e etapas da oficina

```
docker-do-zero/
├── src/
│   ├── server.js
│   └── public/index.html
├── package.json
├── Dockerfile
├── .dockerignore
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

Criar **uma tag por etapa** (para quem se perder poder pular), cada uma funcionando sozinha:

| Tag | Conteúdo | Corresponde a |
| --- | --- | --- |
| `passo-1-app` | Só a app (sem Dockerfile/compose), rodando local com `npm start` contra o Postgres do `docker run` | Hands-on 2 |
| `passo-2-dockerfile` | Adiciona Dockerfile e `.dockerignore` (app roda em container, rede manual com `docker network`) | Hands-on 3 |
| `passo-3-compose` | Adiciona `docker-compose.yml`, `.env.example`, Redis e Adminer | Hands-on 4 |
| `main` | Versão final + README completo | Todos |

## 10. README (requisitos de conteúdo)

Escrito em português, com estas seções:

1. **O que é o projeto** (2 a 3 linhas) e diagrama simples dos containers em ASCII.
2. **Pré-requisitos:** Docker Desktop (Windows/Mac) ou Docker Engine + Compose (Linux); no Windows, WSL2 habilitado. Comando de verificação: `docker --version` e `docker compose version`.
3. **Preparação antes da oficina:** `docker pull ubuntu`, `docker pull postgres:16`, `docker pull redis:7-alpine`, `docker pull adminer`, `docker pull node:20-alpine`.
4. **Como rodar:** `git clone`, `cp .env.example .env`, `docker compose up --build`.
5. **Como testar** (exemplos de `curl` para cada rota e o link da página inicial).
6. **Ver os dados:** login no Adminer (`localhost:8080`) com a tabela de campos (Sistema: PostgreSQL, Servidor: `postgres`, Usuário/Senha: `admin`, Base: `oficina`) e como entrar no `psql` e no `redis-cli` via `docker compose exec`.
7. **Acessar de outro dispositivo na mesma rede** (ver seção 11).
8. **Comandos úteis:** `ps`, `logs -f`, `exec`, `stop`, `down`, `down -v` (explicar que o `-v` apaga os dados).
9. **Problemas comuns:** porta já em uso, Docker não iniciado, Postgres ainda subindo, `localhost` dentro do container.
10. **Seguindo por etapas:** tabela das tags (seção 9) com `git checkout passo-X`.

## 11. Acesso pela rede local (seção obrigatória no README)

O README deve explicar, em passos curtos:

1. **Descobrir o IP da máquina:** `ipconfig` (Windows, procurar "Endereço IPv4"), `ip a` (Linux) ou `ifconfig` (Mac). Exemplo: `192.168.0.25`.
2. **Subir a aplicação** com `docker compose up -d`. A porta 3000 já está publicada para a rede.
3. **Acessar de outro dispositivo na mesma rede:** `http://IP-DO-NOTEBOOK:3000` no navegador, ou `curl` com o mesmo endereço para `POST /recados`.
4. **Se não funcionar**, listar as causas prováveis nesta ordem:
   - **Isolamento de clientes (client isolation)** no Wi-Fi do local, que impede um dispositivo de enxergar outro. Solução: usar o hotspot do celular.
   - **Firewall do Windows** bloqueando a conexão de entrada (permitir a porta 3000 ou o Docker Desktop para redes privadas).
   - Dispositivos em **redes diferentes** (Wi-Fi vs. cabeado/VLAN).
5. **Aviso de segurança:** apenas a porta 3000 é exposta; Adminer e Postgres ficam em `127.0.0.1` de propósito. Nunca publicar o Adminer na rede.
6. **Plano B:** se a rede não permitir, cada participante roda o projeto na própria máquina (`docker compose up`), com seus próprios dados.

### Checklist de teste na universidade (para o instrutor)

- [ ] Notebook e celular conectam na mesma rede e o celular abre `http://IP:3000`.
- [ ] O celular consegue enviar um recado pelo formulário.
- [ ] O recado aparece no Adminer (`localhost:8080`) no notebook.
- [ ] `docker compose exec redis redis-cli GET visitas` mostra o número subindo a cada acesso.
- [ ] Se falhar: testar o hotspot do celular e anotar o resultado.
- [ ] Testar também o `docker pull` das imagens na rede do local (velocidade).

## 12. Critérios de aceite

A entrega está pronta quando:

1. `docker compose up --build` sobe os 4 containers sem erros, em máquina limpa, a partir do repositório clonado e de `.env.example` copiado para `.env`.
2. `POST /recados` grava e `GET /recados` devolve o recado; os dados aparecem no Adminer.
3. `GET /visitas` incrementa a cada chamada; o valor é visível com `redis-cli`.
4. `docker compose down` seguido de `docker compose up` **preserva os recados** (volume `pgdata`); `docker compose down -v` os apaga.
5. Sem `REDIS_HOST`, a app sobe normalmente, `/recados` funciona e `/visitas` retorna 503.
6. Com `DB_HOST=localhost` dentro de um container (sem rede compartilhada), a app mostra no log uma mensagem clara de falha de conexão ao Postgres (o erro didático).
7. Dispositivo na mesma rede acessa `http://IP:3000` (quando a rede permitir). Adminer e Postgres **não** são acessíveis por outro dispositivo.
8. O README segue a seção 10 e todas as tags da seção 9 existem e funcionam isoladamente.
9. Nenhum segredo real no repositório.

## 13. Fora do escopo / ideias futuras

- Multi-stage build e imagem menor.
- Publicar a imagem no Docker Hub.
- GitHub Actions para build automático.
- Migrar para Kubernetes.

Esses itens podem ser citados no encerramento como próximos passos, mas **não** fazem parte da entrega.
