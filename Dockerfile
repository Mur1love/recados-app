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
