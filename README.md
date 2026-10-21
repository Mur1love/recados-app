# Mural de Recados (Docker do Zero)

Projeto de demonstração da oficina **"Docker do Zero"**: uma aplicação mínima (Node 20 + Express) com um **mural de recados** no Postgres e um **contador de visitas** no Redis, empacotada em **4 containers** com Docker Compose.

Este README é o guia detalhado da oficina. Ele percorre os **Passos 1, 2 e 3** na ordem, com os comandos completos, o que deve aparecer na tela e o que fazer quando algo dá errado.

```
                 ┌─────────────┐   postgres:5432 (rede interna)
  celular        │    app      │──────────┐
  navegador ─────▶ (Node 3000) │          ▼
  http://IP:3000 └──────▲──────┘   ┌───────────┐
                        │           │ postgres  │  recados (volume pgdata)
                 ┌──────┴──────┐   └───────────┘
                 │    redis    │   ┌───────────┐
                 │  (interno)  │   │  adminer  │  127.0.0.1:8080
                 └─────────────┘   └───────────┘
```

> **Leia este guia no GitHub.** O README existe apenas na branch `main`. Quando você rodar `git checkout passo-1-app` (ou outra tag), ele sai da pasta local. Deixe esta página aberta no navegador durante a oficina — ou volte para a `main` com `git switch main` quando precisar consultar.

## Conceitos em 1 minuto

| Termo | Explicação em uma frase |
| --- | --- |
| **Imagem** | A receita pronta e congelada (somente leitura). |
| **Container** | Uma instância em execução dessa receita. |
| **Dockerfile** | O arquivo que descreve como montar uma imagem. |
| **Registry / Docker Hub** | A "loja" onde as imagens ficam publicadas. |
| **Volume** | Um pedaço de disco que sobrevive ao container. |
| **Rede (network)** | O "condomínio" onde os containers se enxergam pelo nome. |

A frase-chave da oficina: **"Docker empacota a aplicação com tudo que ela precisa para rodar, e roda igual em qualquer máquina."**

Uma analogia útil: o container é uma **marmita lacrada**, com a comida e os talheres dentro. Não importa a cozinha, ela chega igual. A imagem é a receita; o container é a marmita pronta.

VM x container: a máquina virtual carrega um sistema operacional inteiro; o container compartilha o kernel do host e leva só o necessário. Por isso ele sobe em segundos e ocupa megabytes em vez de gigabytes. No Windows e no Mac, o Docker Desktop usa uma VM Linux leve por baixo — não precisa se aprofundar nisso agora.

## Por que isso importa

- **Currículo:** Docker aparece em uma enorme parte das vagas de desenvolvimento, de estágio a sênior.
- **Base para o resto:** CI/CD, Kubernetes e cloud partem da ideia de container. Quem entende Docker aprende essas ferramentas mais rápido.
- **No dia a dia do dev:**
  - subir Postgres, Redis ou Kafka sem instalar nada;
  - ter um ambiente idêntico para o time inteiro (`git clone` + `docker compose up`);
  - testar versões diferentes (Postgres 14 x 16) em segundos;
  - descartar tudo e recomeçar limpo, sem sujar o computador.

## Mapa dos passos

| Passo | Tag do repositório | O que você faz | O que aprende |
| --- | --- | --- | --- |
| **1** | `passo-1-app` | Sobe o Postgres em um container e roda a aplicação com `npm start` na sua máquina. | `docker run`, `-d`, `-e`, `-p`, `-v`, `docker exec`, volume. |
| **2** | `passo-2-dockerfile` | Constrói a imagem da aplicação, vê o erro do `localhost` e cria uma rede para os containers se falarem. | Dockerfile, `docker build`, camadas, rede e DNS. |
| **3** | `passo-3-compose` | Sobe app + Postgres + Redis + Adminer com um único comando. | Docker Compose, `.env`, healthcheck, `down`/`up`. |

As tags são cumulativas: a `passo-2-dockerfile` já contém tudo do passo 1; a `passo-3-compose` contém tudo dos passos 1 e 2.

## Antes de começar

### 1. Docker

- **Windows/Mac:** instale o [Docker Desktop](https://www.docker.com/products/docker-desktop/) e, no Windows, habilite o **WSL2**.
- **Linux:** instale o Docker Engine e o plugin do Compose.

Confira se está tudo funcionando:

```bash
docker --version
docker compose version
docker run --rm hello-world
```

O último comando deve terminar com uma mensagem parecida com `Hello from Docker!`.

Se aparecer `Cannot connect to the Docker daemon`, o Docker não está iniciado:

- **Windows/Mac:** abra o Docker Desktop e espere o ícone ficar verde.
- **Linux:** rode `sudo systemctl start docker` (ou o comando equivalente da sua distribuição).

### 2. Git e Node

```bash
git --version
node --version    # precisa ser v20 ou superior
npm --version
```

O Node é necessário apenas para rodar a aplicação **fora do Docker** no Passo 1. Se você não tiver Node instalado, pode pular a seção 1.6 e seguir para o Passo 2 — o restante funciona normalmente.

### 3. Baixe as imagens antes da oficina

Isso evita esperar downloads grandes durante a aula:

```bash
docker pull hello-world
docker pull ubuntu
docker pull node:20-alpine
docker pull postgres:16
docker pull redis:7-alpine
docker pull adminer
```

Se a internet estiver lenta, não tem problema: o Docker baixa cada imagem na primeira vez que ela for usada.

### 4. Clone o repositório

```bash
git clone https://github.com/Mur1love/recados-app.git
cd recados-app
```

Se você usa SSH e já tem uma chave configurada no GitHub:

```bash
git clone git@github.com:Mur1love/recados-app.git
cd recados-app
```

> Se o repositório for privado, use o link e o acesso fornecidos pelo instrutor.

### 5. Convenções deste guia

- Os blocos `bash` valem para Linux, macOS e **Git Bash** no Windows.
- No **PowerShell**, alguns comandos mudam:
  - `cp .env.example .env` → `Copy-Item .env.example .env`;
  - `curl` → `curl.exe` (o `curl` do PowerShell é um alias para `Invoke-WebRequest` e não aceita os mesmos parâmetros);
  - quando a continuação de linha com `\` não funcionar, use a versão de **uma linha só** que aparece logo abaixo do comando.
- Linhas começadas por `#` são comentários: não precisa digitá-las.
- Dentro do `psql` ou do `redis-cli`, o prompt `>` faz parte da ferramenta: digite apenas o comando que vem depois dele.
- `<...>` significa "troque pelo seu valor".

## Aquecimento opcional — um Ubuntu em container

Se você nunca usou Docker, faça este exercício curto antes do Passo 1. Ele mostra o ciclo de vida de um container.

```bash
docker run hello-world
```

O Docker não achou a imagem localmente, baixou do Docker Hub, criou um container, executou e encerrou. Agora entre em um Ubuntu de verdade:

```bash
docker run -it ubuntu bash
```

Dentro do container, rode:

```bash
cat /etc/os-release     # estamos em um Ubuntu, mesmo que seu PC seja Windows ou Mac
whoami                  # root
curl --version          # command not found: o Ubuntu mínimo não traz curl
apt update && apt install -y curl
curl --version          # agora funciona
exit
```

`-i` mantém a entrada interativa; `-t` aloca um terminal. Ao sair com `exit`, o container para.

```bash
docker ps          # vazio: nada está rodando
docker ps -a       # o container aparece como "Exited"
docker images      # as imagens baixadas: hello-world e ubuntu
```

Agora prove que cada `docker run` cria um container novo a partir da mesma imagem:

```bash
docker run -it --rm ubuntu bash
curl --version     # command not found! O curl que você instalou ficou no container antigo
exit
```

`--rm` apaga o container assim que ele termina. A imagem não mudou: o que você instalou ficou no container anterior. **Containers são descartáveis.**

Limpeza:

```bash
docker rm <id-ou-nome>        # remove um container parado
docker container prune        # remove todos os containers parados
```

Opcional: um **bind mount** (pasta do seu computador dentro do container):

```bash
docker run -it --rm -v "$(pwd)":/dados ubuntu bash
```

No PowerShell, use `${PWD}` no lugar de `$(pwd)`. Crie um arquivo em `/dados`, saia do container e veja que ele apareceu na pasta do seu computador.

---

## Passo 1 — PostgreSQL em container

**Objetivo:** subir um banco real em um comando e provar que o **volume** preserva os dados. Neste passo a aplicação roda na sua máquina (fora do Docker) e conversa com o banco pela porta publicada.

### 1.1 Entre na tag do passo 1

```bash
git checkout passo-1-app
git status
```

O Git vai avisar que você está em **detached HEAD**. Isso é normal: uma tag é um retrato do repositório, não uma branch de trabalho. Não faça commits nesse estado. Para voltar à versão final depois:

```bash
git switch main
```

### 1.2 Suba o Postgres

Este é o comando principal do passo. Digite com calma e observe cada flag:

```bash
docker run -d --name meu-postgres \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=admin \
  -e POSTGRES_DB=oficina \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  postgres:16
```

No **PowerShell**, ou se preferir digitar tudo em uma linha só:

```bash
docker run -d --name meu-postgres -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=admin -e POSTGRES_DB=oficina -p 5432:5432 -v pgdata:/var/lib/postgresql/data postgres:16
```

O que cada parte significa:

| Flag | Significado |
| --- | --- |
| `-d` | Roda em segundo plano (*detached*), liberando o terminal. |
| `--name meu-postgres` | Dá um nome ao container. É por esse nome que vamos nos conectar. |
| `-e POSTGRES_USER=admin` | Variável de ambiente que cria o usuário do banco. |
| `-e POSTGRES_PASSWORD=admin` | Senha do usuário. |
| `-e POSTGRES_DB=oficina` | Nome do banco criado na primeira inicialização. |
| `-p 5432:5432` | Publica a porta `5432` do container na porta `5432` da sua máquina (`host:container`). |
| `-v pgdata:/var/lib/postgresql/data` | Cria o volume nomeado `pgdata` e o monta na pasta de dados do Postgres. |
| `postgres:16` | Imagem usada. A tag `16` fixa a versão — evite `latest` em projetos reais. |

> **Segurança:** `-p 5432:5432` publica a porta em todas as interfaces da sua máquina. Para a oficina tudo bem; no Compose (Passo 3) vamos restringir o banco a `127.0.0.1`.

### 1.3 Confirme que o banco subiu

```bash
docker ps
docker logs meu-postgres
```

Em `docker ps`, você deve ver algo como:

```
CONTAINER ID   IMAGE         COMMAND                  STATUS         PORTS
...            postgres:16   "docker-entrypoint.s…"   Up 10 seconds  0.0.0.0:5432->5432/tcp
```

Em `docker logs`, procure a linha:

```
database system is ready to accept connections
```

Se ela ainda não apareceu, acompanhe os logs em tempo real e saia com `Ctrl+C` depois:

```bash
docker logs -f meu-postgres
```

### 1.4 Crie a tabela e insira o primeiro recado

Entre no banco:

```bash
docker exec -it meu-postgres psql -U admin -d oficina
```

O `docker exec` executa um comando **dentro de um container que já está rodando**. Dentro do `psql`, rode:

```sql
CREATE TABLE recados (
  id SERIAL PRIMARY KEY,
  autor VARCHAR(50) NOT NULL,
  mensagem TEXT NOT NULL,
  criado_em TIMESTAMP DEFAULT NOW()
);

INSERT INTO recados (autor, mensagem) VALUES ('Instrutor', 'Primeiro recado!');

SELECT * FROM recados;

\dt

\q
```

Você deve ver uma tabela com o `id` 1, o autor `Instrutor`, a mensagem `Primeiro recado!` e a data de criação. `\dt` lista as tabelas e `\q` sai do `psql`.

> Se a tabela já existir (porque a aplicação já rodou alguma vez), o `CREATE TABLE` vai reclamar. Nesse caso, pule essa parte e rode apenas o `INSERT`.

### 1.5 Prove que o volume preserva os dados

Destrua o container:

```bash
docker rm -f meu-postgres
docker ps -a
```

O container sumiu da lista de containers em execução. Agora suba de novo, usando **o mesmo volume**:

```bash
docker run -d --name meu-postgres \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=admin \
  -e POSTGRES_DB=oficina \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  postgres:16
```

Consulte os recados:

```bash
docker exec -it meu-postgres psql -U admin -d oficina -c "SELECT * FROM recados;"
```

O recado do Instrutor continua lá. **O container é descartável; o dado, não.** Veja o volume:

```bash
docker volume ls
```

Deve aparecer o volume `pgdata`. Se quiser começar do zero (isso **apaga os dados**):

```bash
docker rm -f meu-postgres
docker volume rm pgdata
```

### 1.6 Rode a aplicação na sua máquina

Com o Postgres rodando, instale as dependências e inicie a app localmente:

```bash
npm install
npm start
```

A saída esperada é parecida com:

```
Iniciando Mural de Recados...
Tentativa 1/10 de conexão ao Postgres (localhost:5432)...
Postgres conectado! Tabela "recados" pronta.
App ouvindo em http://0.0.0.0:3000
```

Neste passo ainda não existe a página HTML (ela chega no Passo 2), então use o `curl` em outro terminal:

```bash
curl http://localhost:3000/saude
```

```bash
curl -X POST http://localhost:3000/recados \
  -H "Content-Type: application/json" \
  -d '{"autor":"Ana","mensagem":"Oi!"}'
```

```bash
curl http://localhost:3000/recados
```

Resultados esperados:

- `/saude` → `{"app":"ok","postgres":"ok","redis":"desativado"}`
- `POST /recados` → status `201` com o recado criado (incluindo `id` e `criado_em`)
- `GET /recados` → lista com o recado da Ana e o do Instrutor, do mais recente para o mais antigo

Confira no banco:

```bash
docker exec -it meu-postgres psql -U admin -d oficina -c "SELECT * FROM recados;"
```

Pare a aplicação com `Ctrl+C` no terminal em que ela está rodando.

> **Windows:** use `curl.exe` no lugar de `curl`. Se a porta `5432` já estiver ocupada na sua máquina, volte na seção 1.2 e use `-p 5433:5432`; depois inicie a app com `DB_PORT=5433 npm start` (no PowerShell: `$env:DB_PORT=5433; npm start`).

### 1.7 Problemas comuns do Passo 1

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| `Cannot connect to the Docker daemon` | Docker não iniciado. | Abra o Docker Desktop ou rode `sudo systemctl start docker`. |
| `Bind for 0.0.0.0:5432 failed: port is already allocated` | Já existe um Postgres local ou outro container usando a porta. | Pare o serviço local ou use `-p 5433:5432` e `DB_PORT=5433`. |
| `The container name "/meu-postgres" is already in use` | Já existe um container com esse nome. | `docker rm -f meu-postgres` e suba de novo. |
| `password authentication failed for user "admin"` | O volume `pgdata` foi criado antes com outra senha. As variáveis `POSTGRES_*` só valem na primeira inicialização. | Remova o container e o volume (`docker volume rm pgdata`) e suba de novo. Isso apaga os dados. |
| `psql: error: connection ...` logo após o `docker run` | O Postgres ainda está inicializando. | Espere alguns segundos e confira `docker logs meu-postgres`. |
| A app mostra `ECONNREFUSED 127.0.0.1:5432` | O container do Postgres não está rodando ou a porta não está publicada. | `docker ps`, `docker logs meu-postgres` e confira o `-p`. |
| `EADDRINUSE: address already in use :::3000` | Outra aplicação está usando a porta 3000. | Pare a outra aplicação ou rode `PORT=3001 npm start`. |

### 1.8 O que ficou pronto

Você subiu um Postgres real sem instalar nada, criou uma tabela, inseriu um recado e provou que o **volume** mantém os dados mesmo quando o container é destruído. A aplicação rodou **fora** do Docker e chegou ao banco por `localhost:5432`.

**Deixe o `meu-postgres` rodando** para o próximo passo. No Passo 2 a aplicação também vira container — e aí `localhost` deixa de funcionar.

---

## Passo 2 — Dockerfile: a aplicação em container

**Objetivo:** construir uma imagem da aplicação, rodá-la em um container e entender por que ela **não enxerga** o Postgres em `localhost`. No fim, os containers vão se falar pelo **nome** dentro de uma rede.

### 2.1 Entre na tag do passo 2

```bash
git checkout passo-2-dockerfile
```

Se você estava com a app local rodando, pare com `Ctrl+C`. Confirme que o Postgres do passo anterior continua de pé:

```bash
docker ps
```

Você deve ver o `meu-postgres` com status `Up`.

> Lembrete: ao trocar de tag, este README sai da pasta. Consulte-o no GitHub.

### 2.2 Leia o Dockerfile

O arquivo `Dockerfile` deste passo é:

```dockerfile
# Dockerfile do Mural de Recados (oficina "Docker do Zero")

# Imagem base leve: Node.js 20 no Alpine (pequena e rápida de baixar)
FROM node:20-alpine

# Diretório de trabalho dentro do container
WORKDIR /app

# Estratégia de CACHE DE CAMADAS: copiamos os manifests de dependência
# primeiro; a camada de `npm ci` só reconstrói se o package.json/package-lock
# mudarem — o código em `src/` muda com frequência e não derruba o cache
COPY package*.json ./
RUN npm ci --omit=dev

# Agora sim, o código da aplicação
COPY src ./src

# Porta que a app escuta (documentação da imagem; quem publica é o Compose)
EXPOSE 3000

# Boa prática: rodar como usuário sem privilégios de root
# (o usuário "node" já existe na imagem oficial do Node)
USER node

# Comando padrão da imagem (código está em src/, conforme estrutura do repositório)
CMD ["node", "src/server.js"]
```

Linha a linha:

| Instrução | O que faz |
| --- | --- |
| `FROM node:20-alpine` | Parte da imagem oficial do Node 20 sobre Alpine Linux (leve). |
| `WORKDIR /app` | Define `/app` como pasta de trabalho dentro do container. |
| `COPY package*.json ./` | Copia `package.json` e `package-lock.json` primeiro. |
| `RUN npm ci --omit=dev` | Instala exatamente as dependências do lockfile, sem as de desenvolvimento. |
| `COPY src ./src` | Copia o código da aplicação. |
| `EXPOSE 3000` | Documenta a porta que a app usa (não publica nada sozinho). |
| `USER node` | Roda como usuário sem privilégios de root. |
| `CMD ["node", "src/server.js"]` | Comando executado quando o container inicia. |

A ordem importa por causa do **cache de camadas**: se só o código mudar, o Docker reaproveita a camada do `npm ci` e o build fica rápido. O `.dockerignore` funciona como um `.gitignore` do build:

```
node_modules
.git
.env
npm-debug.log
README.md
```

Ele evita copiar lixo e segredos para dentro da imagem. Neste passo também existe a página HTML em `src/public/index.html`, que será servida pela aplicação.

### 2.3 Construa a imagem

```bash
docker build -t mural-app .
docker images
```

- `-t mural-app` dá o nome (e a tag implícita `latest`) à imagem.
- O ponto `.` no final é o **contexto de build**: a pasta atual. **Não esqueça o ponto.**

Na primeira vez, o Docker baixa a imagem base `node:20-alpine`. No fim, deve aparecer algo como `naming to docker.io/library/mural-app:latest`. Em `docker images`, a imagem `mural-app` aparece na lista.

### 2.4 Rode e veja o erro didático

```bash
docker run --rm -p 3000:3000 mural-app
```

A aplicação vai tentar conectar e falhar:

```
Tentativa 1/10 de conexão ao Postgres (localhost:5432)...
Postgres não respondeu (ECONNREFUSED). Nova tentativa em 2000ms...
...
FALHA AO INICIAR: Postgres indisponível após 10 tentativas (localhost:5432).
DICA: dentro de um container, o Postgres não está em localhost. Use o nome do serviço (ex.: DB_HOST=postgres).
```

O container encerra sozinho depois das 10 tentativas (cerca de 20 segundos). Se quiser parar antes, use `Ctrl+C`.

**Por que não conecta?** O Postgres está rodando e a porta 5432 está publicada na sua máquina, mas dentro do container a palavra `localhost` aponta para o **próprio container**, não para o seu computador e muito menos para o container do Postgres. Cada container tem sua própria rede.

```
[ container app ]   localhost:5432  ──▶  ele mesmo (ninguém escutando)
[ container postgres ]   postgres:5432
```

O `-p 5432:5432` publica o banco para a **máquina host**; isso não faz o Postgres existir dentro do container da app.

### 2.5 Crie uma rede em comum

```bash
docker network create oficina-net
docker network connect oficina-net meu-postgres
```

Agora o Postgres e a futura app estão na mesma rede. Em redes **definidas pelo usuário** (como `oficina-net`), o Docker faz o papel de DNS: cada container é encontrado pelo **nome**.

Confira:

```bash
docker network inspect oficina-net
```

Na lista de containers, deve aparecer o `meu-postgres`.

> Se você removeu o `meu-postgres` no Passo 1, suba-o novamente com o comando da seção 1.2 e rode o `docker network connect` de novo.

### 2.6 Rode a app na rede, apontando para o nome do Postgres

```bash
docker run --rm -p 3000:3000 \
  --network oficina-net \
  -e DB_HOST=meu-postgres \
  mural-app
```

Em uma linha só (PowerShell):

```bash
docker run --rm -p 3000:3000 --network oficina-net -e DB_HOST=meu-postgres mural-app
```

Agora a saída deve ser parecida com:

```
Tentativa 1/10 de conexão ao Postgres (meu-postgres:5432)...
Postgres conectado! Tabela "recados" pronta.
App ouvindo em http://0.0.0.0:3000
```

O valor de `DB_HOST` precisa ser **exatamente o nome do container** (`meu-postgres`). É o Docker fazendo o papel de DNS.

Teste em outro terminal:

```bash
curl http://localhost:3000/saude
curl http://localhost:3000/recados
```

Você também pode abrir **http://localhost:3000** no navegador: a página com o formulário e a lista de recados já existe neste passo.

O recado que você criou no Passo 1 deve aparecer na lista, porque o **Postgres continua usando o mesmo volume** `pgdata` (a app apenas se conecta a ele).

Para ver os dois containers na rede:

```bash
docker ps
docker network inspect oficina-net
```

Pare a aplicação com `Ctrl+C`. O `--rm` remove o container da app automaticamente.

### 2.7 Problemas comuns do Passo 2

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| `docker build` reclama de caminho ou contexto | O comando foi rodado fora da pasta do repositório ou faltou o ponto final. | `cd recados-app` e rode `docker build -t mural-app .` (com o ponto). |
| `npm ci` falha durante o build | Tag errada ou `package-lock.json` inconsistente. | Confira `git status` e `git checkout passo-2-dockerfile`. |
| A app ainda tenta `localhost:5432` | Faltou `-e DB_HOST=meu-postgres`. | Repita o `docker run` com a variável. |
| `getaddrinfo EAI_AGAIN meu-postgres` ou `ECONNREFUSED` | Faltou `--network oficina-net` ou o Postgres não está conectado à rede. | Rode `docker network connect oficina-net meu-postgres`. |
| `network oficina-net not found` | A rede não foi criada. | `docker network create oficina-net`. |
| `network with name oficina-net already exists` | A rede já foi criada em uma tentativa anterior. | Siga em frente e rode o `docker network connect`; ou remova a rede antiga com `docker network rm oficina-net` se ela estiver sem uso. |
| `port is already allocated` na 3000 | Já existe uma app ou container usando a porta. | `docker ps`, pare o processo/container e tente de novo. |
| `meu-postgres` não aparece em `docker ps` | O container do Passo 1 foi removido. | Suba de novo com o comando da seção 1.2. |

### 2.8 O que ficou pronto

Você escreveu (ou leu) um Dockerfile, construiu uma imagem e rodou a aplicação em um container. Descobriu na prática que **`localhost` dentro do container é o próprio container** e que containers se encontram pelo **nome** em uma rede.

O problema agora é a quantidade de comandos: criar rede, conectar container, `docker run` com várias flags... No próximo passo, tudo isso vira um arquivo só.

---

## Passo 3 — Docker Compose: tudo em um arquivo

**Objetivo:** substituir todos os comandos manuais por um único `docker-compose.yml`, adicionar Redis e Adminer e mostrar o fluxo `git clone` + `docker compose up`.

### 3.1 Limpe o ambiente do passo anterior

Isso evita conflito de portas e nomes:

```bash
docker rm -f meu-postgres
docker network rm oficina-net
docker ps -a
```

O volume `pgdata` do Passo 1 **não** é removido por esses comandos. O Compose vai criar um volume próprio, com o nome do projeto (por exemplo, `recados-app_pgdata`), então os recados do Passo 1 não aparecem automaticamente no Compose. Isso é esperado.

Confira também se as portas `3000`, `5432` e `8080` estão livres:

```bash
docker ps
```

Se houver algum container dos passos anteriores rodando, remova-o antes de continuar.

### 3.2 Entre na tag do passo 3

```bash
git checkout passo-3-compose
```

### 3.3 Leia o docker-compose.yml

O arquivo deste passo é:

```yaml
# Compose do Mural de Recados — os 4 serviços da oficina "Docker do Zero"
# Eles se enxergam pelo NOME do serviço na rede interna do Compose:
# a app fala com postgres e redis; adminer fala com o postgres.
services:
  app:
    build: .
    ports:
      - "3000:3000" # ÚNICA porta publicada para a rede local
    environment:
      PORT: 3000
      DB_HOST: postgres   # não é localhost! é o nome do serviço no Compose
      DB_PORT: 5432
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ${DB_NAME}
      REDIS_HOST: ${REDIS_HOST:-}   # do .env; vazio desativa o contador
      REDIS_PORT: 6379
    depends_on:
      postgres:
        condition: service_healthy # espera o pg_isready decidir
      redis:
        condition: service_started

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - pgdata:/var/lib/postgresql/data   # os recados sobrevivem ao `compose down`
    ports:
      - "127.0.0.1:5432:5432" # restrito AO NOTEBOOK do instrutor (não à rede)
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER:-admin} -d $${POSTGRES_DB:-oficina}"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine # SEM ports: só a app fala com ele, pela rede interna

  adminer:
    image: adminer
    ports:
      - "127.0.0.1:8080:8080" # interface do Postgres, só na máquina local
    depends_on:
      - postgres

volumes:
  pgdata:
```

Cada serviço corresponde a algo que você já fez à mão:

| Antes (comando manual) | Agora (Compose) |
| --- | --- |
| `docker build -t mural-app .` | `build: .` |
| `-p 3000:3000` | `ports: ["3000:3000"]` |
| `-e DB_HOST=meu-postgres` | `environment: DB_HOST: postgres` (nome do serviço) |
| `-v pgdata:...` | `volumes: [pgdata:...]` |
| `docker network create` + `docker network connect` | automático: o Compose cria a rede e conecta todos os serviços |
| `docker run ...` para cada serviço | `docker compose up` |

Pontos importantes:

- O Compose cria a rede sozinho e todos os serviços se enxergam pelo **nome do serviço**: a app fala com `postgres` e `redis`.
- `depends_on` com `condition: service_healthy` faz a app esperar o Postgres responder ao `pg_isready` antes de iniciar.
- `127.0.0.1:5432:5432` e `127.0.0.1:8080:8080` restringem o banco e o Adminer à sua máquina. Apenas a porta 3000 fica aberta para a rede local.
- O Redis **não** publica porta: só a app fala com ele, pela rede interna.
- A chave `version:` não aparece porque é obsoleta no Compose moderno.

### 3.4 Crie o arquivo .env

```bash
cp .env.example .env
```

No PowerShell:

```powershell
Copy-Item .env.example .env
```

O `.env.example` contém os valores da oficina:

```
PORT=3000
DB_HOST=postgres
DB_PORT=5432
DB_USER=admin
DB_PASSWORD=admin
DB_NAME=oficina
REDIS_HOST=redis
REDIS_PORT=6379
```

O Compose lê esse arquivo para substituir `${DB_USER}`, `${DB_PASSWORD}`, `${DB_NAME}` e `${REDIS_HOST}`. O `.env` está no `.gitignore` e no `.dockerignore`: **nunca coloque segredos reais no repositório ou dentro da imagem**. Para a oficina, `admin/admin` é só demonstração.

### 3.5 Suba tudo

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

- `-d` sobe em segundo plano.
- `--build` reconstrói a imagem da app antes de subir.
- `docker compose ps` mostra os quatro serviços. O Postgres deve aparecer como `healthy`.
- `docker compose logs -f app` acompanha os logs da app; saia com `Ctrl+C` (os containers continuam rodando).

A saída da app deve mostrar a conexão com `postgres:5432` e `App ouvindo em http://0.0.0.0:3000`.

### 3.6 Teste a aplicação

Abra **http://localhost:3000** no navegador: há um formulário para enviar recados, a lista atualizada e o contador de visitas.

Pela linha de comando:

```bash
curl http://localhost:3000/saude
```

```bash
curl -X POST http://localhost:3000/recados \
  -H "Content-Type: application/json" \
  -d '{"autor":"Ana","mensagem":"Oi!"}'
```

```bash
curl http://localhost:3000/recados
curl http://localhost:3000/visitas
```

Resultados esperados:

- `/saude` → `{"app":"ok","postgres":"ok","redis":"ok"}`
- `POST /recados` → `201` com o recado criado
- `GET /recados` → lista do mais recente para o mais antigo
- `GET /visitas` → `{"visitas":N}`, incrementando a cada chamada

**Adminer** (interface web do Postgres): **http://localhost:8080**

| Campo | Valor |
| --- | --- |
| Sistema | PostgreSQL |
| Servidor | `postgres` |
| Usuário | `admin` |
| Senha | `admin` |
| Base | `oficina` |

> No Adminer, o servidor é `postgres` (o nome do serviço), **não** `localhost`.

**psql** pelo container:

```bash
docker compose exec postgres psql -U admin oficina
# dentro do psql: SELECT * FROM recados;
```

**redis-cli** pelo container:

```bash
docker compose exec redis redis-cli GET visitas
```

### 3.7 Prove a persistência

Pare e remova os containers, mas **sem** remover o volume:

```bash
docker compose down
docker compose up -d
curl http://localhost:3000/recados
```

Os recados continuam lá. O `down` remove containers e rede, mas preserva o volume nomeado `pgdata`.

Agora a diferença importante:

```bash
docker compose down -v
```

O `-v` remove também o volume — **e todos os dados**. Use com consciência. Para continuar depois de um `down -v`, suba de novo:

```bash
docker compose up -d --build
```

### 3.8 Veja o Redis ao vivo

```bash
docker compose exec redis redis-cli
```

Dentro do `redis-cli`:

```
GET visitas
INCR visitas
KEYS *
exit
```

Cada acesso a `/visitas` executa um `INCR visitas`. O `GET` mostra o valor atual; o `INCR` soma 1; o `KEYS *` lista as chaves.

### 3.9 O fluxo final: clone + up

Pare o conjunto atual para liberar a porta 3000:

```bash
docker compose down
```

Agora simule um novo integrante do time entrando no projeto:

```bash
cd ..
git clone https://github.com/Mur1love/recados-app.git teste-limpo
cd teste-limpo
cp .env.example .env
docker compose up -d --build
```

No PowerShell, troque o `cp` por `Copy-Item`.

Abra **http://localhost:3000** e confirme que tudo funciona. A mensagem da oficina: **"Um novo integrante entra no time, clona e roda. Dois dias de onboarding viraram dois minutos."**

Quando terminar, remova o conjunto de teste:

```bash
docker compose down -v
```

### 3.10 Problemas comuns do Passo 3

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| `Bind for 0.0.0.0:3000 failed` | A porta 3000 já está em uso (outro container ou app). | `docker ps` para achar o culpado; `docker compose down` ou `docker rm -f <nome>`. |
| `Bind for 127.0.0.1:5432 failed` | Ainda há um Postgres local ou o `meu-postgres` do Passo 1 rodando. | `docker ps`, remova o container antigo ou pare o serviço local. |
| `The DB_USER variable is not set. Defaulting to a blank string` | Faltou criar o `.env`. | `cp .env.example .env` e rode `docker compose up -d --build` de novo. |
| Adminer não conecta | Servidor digitado como `localhost`. | Use `postgres` no campo Servidor. |
| App reiniciando ou `/saude` com `postgres: "erro"` | O Postgres ainda está subindo ou o healthcheck falhou. | `docker compose logs postgres` e `docker compose logs app`; espere o `healthy`. |
| `docker compose` não existe | Plugin do Compose não instalado. | Instale o plugin (`docker-compose-plugin`) ou use uma versão do Docker Desktop que já o inclui. |
| Os dados sumiram | Você rodou `docker compose down -v`. | O volume foi apagado; os dados não voltam. Suba de novo para um banco vazio. |

### 3.11 O que ficou pronto

Você descreveu quatro serviços em um arquivo, subiu tudo com um comando e viu a app conversar com Postgres e Redis pelo nome. Aprendeu também a diferença entre `down` (preserva dados) e `down -v` (apaga tudo).

---

## Comandos essenciais (cola)

| Comando | Para quê |
| --- | --- |
| `docker ps` / `docker ps -a` | Listar containers (rodando / todos). |
| `docker logs -f <nome>` | Ver os logs de um container em tempo real. |
| `docker exec -it <nome> bash` | Entrar em um container. No Alpine, use `sh`. |
| `docker stop <nome>` / `docker rm <nome>` | Parar / remover um container. |
| `docker images` | Listar imagens. |
| `docker volume ls` | Listar volumes. |
| `docker network ls` | Listar redes. |
| `docker compose ps` | Estado dos serviços do Compose. |
| `docker compose logs -f` | Logs de todos os serviços (ou de um: `... app`). |
| `docker compose up -d` / `docker compose down` | Subir / derrubar o conjunto. |
| `docker compose down -v` | Derrubar **e apagar o volume** (cuidado!). |
| `docker compose exec <serviço> sh` | Terminal dentro de um serviço. |
| `docker system prune` | Limpar o que não está em uso (cuidado). |

## Acessar de outro dispositivo na mesma rede

1. **Descubra o IP da máquina do instrutor:**
   - Windows: `ipconfig` (procure **Endereço IPv4**, ex.: `192.168.0.25`)
   - Linux: `ip a`
   - Mac: `ifconfig`
2. **Suba a aplicação:** `docker compose up -d` (a porta 3000 já está publicada para a rede).
3. **Acesse do celular** conectado na **mesma rede Wi-Fi**: abra `http://IP-DO-NOTEBOOK:3000` no navegador, ou teste de outro computador:
   ```bash
   curl -X POST http://IP-DO-NOTEBOOK:3000/recados \
     -H "Content-Type: application/json" \
     -d '{"autor":"Ana","mensagem":"Teste pela rede"}'
   ```
4. **Se não funcionar**, verifique nesta ordem:
   - **Isolamento de clientes no Wi-Fi** (*client isolation*): impede dispositivos de se enxergarem. Solução: use o **hotspot do celular**.
   - **Firewall do Windows** bloqueando a porta 3000 ou o Docker Desktop para redes privadas.
   - Dispositivos em **redes diferentes** (Wi-Fi x cabeado/VLAN).
5. **Aviso de segurança:** só a porta **3000** é publicada para a rede; **Postgres (5432) e Adminer (8080)** ficam restritos a `127.0.0.1` do notebook. Nunca publique o Adminer na rede.
6. **Plano B:** se a rede do local bloquear tudo, cada participante clona o projeto e roda `docker compose up` na própria máquina, com seus próprios dados.

### Checklist de teste na universidade (para o instrutor)

- [ ] Notebook e celular na mesma rede: abrir `http://IP:3000` no celular.
- [ ] Enviar um recado pelo formulário do celular.
- [ ] Ver o recado no Adminer (http://localhost:8080) do notebook.
- [ ] `docker compose exec redis redis-cli GET visitas` sobe a cada acesso.
- [ ] Se falhar: testar com o hotspot do celular e anotar o resultado.
- [ ] Testar os `docker pull` na rede do local (velocidade).

## Rotas da API

| Método | Rota | O que faz | Resposta esperada |
| --- | --- | --- | --- |
| `GET` | `/` | Página HTML com formulário, lista e contador. | HTML |
| `GET` | `/saude` | Estado da app e das dependências. | `{"app":"ok","postgres":"ok","redis":"ok"}` |
| `POST` | `/recados` | Cria um recado. | `201` com o recado criado |
| `GET` | `/recados` | Lista os recados, do mais recente para o mais antigo (máx. 50). | Array JSON |
| `GET` | `/visitas` | Incrementa e retorna o contador no Redis. | `{"visitas":N}` ou `503` se o Redis estiver indisponível |

Validações do `POST /recados`:

- `autor`: string de 1 a 50 caracteres;
- `mensagem`: string de 1 a 500 caracteres;
- erro de validação → `400` com `{"erro":"..."}` em português.

## Estrutura do repositório e tags

| Tag / branch | Conteúdo | Etapa da oficina |
| --- | --- | --- |
| `passo-1-app` | App + testes; sem Dockerfile nem Compose. Postgres subido à mão. | Passo 1 |
| `passo-2-dockerfile` | Dockerfile, `.dockerignore` e página HTML; rede manual. | Passo 2 |
| `passo-3-compose` | `docker-compose.yml` e `.env.example`; 4 serviços. | Passo 3 |
| `main` | Versão final + README + PRD + documentação. | Consulta |

O README existe **apenas na `main`**. As tags são fotos do código naquele momento e não incluem este arquivo.

## Segurança e boas práticas

- Use **tags fixas** (`postgres:16`), nunca `latest` em projetos reais.
- Tenha um `.dockerignore` para não copiar `node_modules`, `.git` e `.env`.
- **Nunca** coloque segredos dentro da imagem ou no repositório. Use `.env` fora do Git.
- Adminer e portas de banco não vão para produção; na oficina ficam em `127.0.0.1`.
- Uma preocupação por container: app, banco, cache e interface separados.
- Rode como usuário sem privilégios (`USER node` no Dockerfile).
- Lembre-se: `docker compose down -v` **apaga os dados**.
- `admin/admin` é apenas demonstração; troque as credenciais em qualquer outro ambiente.

## Socorro — checklist geral

Se algo não funcionar, siga esta ordem:

1. **O Docker está rodando?** `docker ps`
2. **O que está no ar?** `docker ps -a` e `docker compose ps`
3. **O que os logs dizem?** `docker compose logs -f` (ou `docker logs <nome>`)
4. **A porta está ocupada?**
   - Linux/Mac: `lsof -i :3000` (ou `:5432`, `:8080`)
   - Windows: `netstat -ano | findstr :3000`
5. **A tag está certa?** `git status` e `git describe --tags`
6. **Tente um recomeço limpo:** `docker compose down` e `docker compose up -d --build`.
7. **Último recurso:** `docker compose down -v` (apaga os dados) e suba de novo.

## Limpeza final

```bash
# Parar e manter os dados
docker compose down

# Parar e apagar os dados do Compose
docker compose down -v

# Remover o volume do Passo 1 (se ainda existir)
docker volume rm pgdata

# Remover a rede do Passo 2 (se ainda existir)
docker network rm oficina-net
```

> **Cuidado:** `docker system prune -a --volumes` remove imagens, containers, redes e volumes não usados de **todos** os projetos da máquina. Não rode isso sem conferir o que será apagado.
