# Mural de Recados (Docker do Zero)

Projeto de demonstração da oficina **"Docker do Zero"**: uma app mínima (Node 20 + Express) com um **mural de recados** no Postgres e um **contador de visitas** no Redis, empacotada em **4 containers** com Docker Compose. O objetivo é mostrar integração entre containers — tudo roda com um único comando.

```
                 ┌─────────────┐   127.0.0.1:5432
  celular        │    app      │──────────┐
  navegador ─────▶ (Node 3000) │          ▼
  http://IP:3000 └──────▲──────┘   ┌───────────┐
                        │           │ postgres  │  recados (volume pgdata)
                 ┌──────┴──────┐   └───────────┘
                 │    redis    │   ┌───────────┐
                 │  (interno)  │   │  adminer  │  127.0.0.1:8080
                 └─────────────┘   └───────────┘
```

## 1. Pré-requisitos

- **Windows/Mac:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) com WSL2 habilitado (Windows).
- **Linux:** Docker Engine + plugin do Compose.

Verifique se tudo está instalado:

```bash
docker --version
docker compose version
```

## 2. Preparação antes da oficina

Baixe as imagens que serão usadas (evita lentidão na rede do local):

```bash
docker pull ubuntu
docker pull node:20-alpine
docker pull postgres:16
docker pull redis:7-alpine
docker pull adminer
```

## 3. Como rodar

```bash
git clone <url-do-repositorio>
cd docker-do-zero
cp .env.example .env
docker compose up --build
```

A página fica em **http://localhost:3000**.

> O `.env.example` já vem com `DB_HOST=postgres`, que é o **nome do serviço** no Compose. O padrão do código é `DB_HOST=localhost` **de propósito**: é o erro didático do Hands-on 3 (ver seção "Problemas comuns").

## 4. Como testar (curl)

```bash
# Estado das dependências
curl http://localhost:3000/saude

# Criar um recado
curl -X POST http://localhost:3000/recados \
  -H 'Content-Type: application/json' \
  -d '{"autor":"Ana","mensagem":"Oi!"}'

# Listar os recados (mais recente primeiro, no máximo 50)
curl http://localhost:3000/recados

# Contador de visitas (INCR no Redis)
curl http://localhost:3000/visitas
```

A mesma interação dá para fazer direto no navegador em http://localhost:3000.

## 5. Ver os dados

**Adminer** (interface web do Postgres): http://localhost:8080

| Campo    | Valor       |
| -------- | ----------- |
| Sistema  | PostgreSQL  |
| Servidor | `postgres`  |
| Usuário  | `admin`     |
| Senha    | `admin`     |
| Base     | `oficina`   |

**psql** pelo container (rota da oficina):

```bash
docker compose exec postgres psql -U admin oficina
# dentro do psql: SELECT * FROM recados;
```

**redis-cli** pelo container:

```bash
docker compose exec redis redis-cli GET visitas
```

## 6. Acessar de outro dispositivo na mesma rede

1. **Descubra o IP da máquina do instrutor:**
   - Windows: `ipconfig` (procure **Endereço IPv4**, ex.: `192.168.0.25`)
   - Linux: `ip a`
   - Mac: `ifconfig`
2. **Suba a aplicação:** `docker compose up -d` (a porta 3000 já está publicada para a rede).
3. **Acesse do celular** conectado na **mesma rede Wi-Fi**: abra `http://IP-DO-NOTEBOOK:3000` no navegador, ou teste do outro notebook/celular com:
   ```bash
   curl -X POST http://IP-DO-NOTEBOOK:3000/recados \
     -H 'Content-Type: application/json' \
     -d '{"autor":"Ana","mensagem":"Teste pela rede"}'
   ```
4. **Se não funcionar**, verifique nesta ordem:
   - **Isolamento de clientes no Wi-Fi** (client isolation): impede dispositivos de se enxergarem. Solução: use o **hotspot do celular**.
   - **Firewall do Windows** bloqueando a porta 3000 ou o Docker Desktop para redes privadas.
   - Dispositivos em **redes diferentes** (Wi-Fi vs. cabeado/VLAN).
5. **Aviso de segurança:** só a porta **3000** é publicada para a rede; **Postgres (5432) e Adminer (8080)** ficam restritos a `127.0.0.1` do notebook. Nunca publique o Adminer na rede.
6. **Plano B:** se a rede do local bloquear tudo, cada participante clona o projeto e roda `docker compose up` na própria máquina, com seus próprios dados.

### Checklist de teste na universidade (para o instrutor)

- [ ] Notebook e celular na mesma rede: abrir `http://IP:3000` no celular.
- [ ] Enviar um recado pelo formulário do celular.
- [ ] Ver o recado no Adminer (http://localhost:8080) do notebook.
- [ ] `docker compose exec redis redis-cli GET visitas` sobe a cada acesso.
- [ ] Se falhar: testar com o hotspot do celular e anotar o resultado.
- [ ] Testar os `docker pull` na rede do local (velocidade).

## 7. Comandos úteis

```bash
docker compose ps          # containers e portas
docker compose logs -f     # logs seguindo em tempo real
docker compose exec app sh # terminal dentro de um container
docker compose stop        # para os containers (dados preservados)
docker compose down        # para e remove containers (dados preservados)
docker compose down -v     # para, remove containers E O VOLUME (apaga os recados!)
docker compose up -d       # sobe em segundo plano
```

## 8. Problemas comuns

| Problema                           | Causa provável e solução |
| ---------------------------------- | ------------------------ |
| `Bind for 0.0.0.0:3000 failed`     | Porta 3000 já em uso. Feche quem usa (`docker ps`, `lsof -i :3000`) ou mude a publicação no `docker-compose.yml`. |
| `Cannot connect to the Docker...`  | Docker Desktop não iniciado / daemon parado. Abra o Docker Desktop (`service docker start` no Linux). |
| `/saude` mostra `postgres: "erro"` | Postgres ainda subindo (10 tentativas de 2s no log). Espere e recarregue. |
| Erro didático de `localhost`       | A app em container chama `localhost:5432` e cai no CONTAINER dela. Use `DB_HOST=postgres` (nome do serviço) — é exatamente o ponto do Hands-on 3. |
| Postgres não fica healthy (healthcheck) | Healthcheck aguardando `pg_isready`; confira os logs com `docker compose logs postgres`. |

## 9. Seguindo por etapas (tags)

Cada etapa da oficina está congelada em uma tag git; use `git checkout <tag>` para acompanhá-la:

| Tag                  | Conteúdo                                        | Etapa da oficina |
| -------------------- | ----------------------------------------------- | ---------------- |
| `passo-1-app`        | A app rodando local com `npm start`             | Hands-on 2       |
| `passo-2-dockerfile` | Dockerfile + `.dockerignore` (rede manual)      | Hands-on 3       |
| `passo-3-compose`    | Compose + `.env.example` + Redis + Adminer      | Hands-on 4       |
| `main`               | Versão final + README                           | —                |

## 10. Sobre senhas e segredos

Usuário/senha `admin/admin` funcionam aqui **apenas para demonstração**; não há segredos reais no repositório. Para outro ambiente, troque as credenciais no `.env` (nunca versionado).
