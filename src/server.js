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
