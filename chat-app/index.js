const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Inicializar o Banco de Dados
const prisma = new PrismaClient();

// --- NOVA FUNÇÃO AUXILIAR (REFATORAÇÃO) ---
// Extraímos a lógica de formatação para cá.
// Isso torna o código mais limpo e fácil de manter.
function formatarMensagemParaEnvio(username, texto, data) {
  return {
    usuario: username,
    texto: texto,
    horario: new Date(data).toLocaleTimeString()
  };
}
//---------------------------------------------


app.get('/', (req, res) => {
  res.send('Chat com Banco de Dados ON! 🚀');
});

io.on('connection', (socket) => {
  console.log(`Socket conectado: ${socket.id}`);

  // 1. Evento: Usuário entra no chat
  socket.on('entrar_chat', async (usuario) => {
    socket.data.username = usuario;
    
    // Lógica de "Upsert": Se o usuário não existe, cria. Se existe, usa ele.
    try {
        const user = await prisma.user.upsert({
            where: { username: usuario },
            update: {},
            create: { username: usuario }
        });
        socket.data.userId = user.id; // Guarda o ID do banco na sessão do socket
    } catch (e) {
        console.error("Erro ao gerenciar usuário:", e);
    }

    // Carrega as últimas 50 mensagens do banco
    const historico = await prisma.message.findMany({
        take: 50,
        orderBy: { createdAt: 'asc' }, // Do mais antigo para o mais novo
        include: { user: true } // Traz o nome do usuário junto
    });

    // Manda o histórico SÓ para quem acabou de entrar
    socket.emit('historico_mensagens', historico);

    // Avisa os outros que alguém entrou
    io.emit('mensagem_sistema', `${usuario} entrou no chat!`);
  });

  // 2. Evento: Usuário manda mensagem
  socket.on('enviar_mensagem', async (dados) => {
    try {
        // Salva no banco de dados
        const novaMsg = await prisma.message.create({
            data: {
                text: dados.texto,
                userId: socket.data.userId
            },
            include: { user: true }
        });

        // --- USO DA NOVA FUNÇÃO (REFATORAÇÃO) ---
        // Antes a lógica estava "hardcoded" aqui. Agora chamamos a função.
        const msgParaEnviar = formatarMensagemParaEnvio(
            novaMsg.user.username,
            novaMsg.text,
            novaMsg.createdAt
        );
        // ----------------------------------------

        // Manda para todo mundo
        io.emit('receber_mensagem', msgParaEnviar);

    } catch (e) {
        console.error("Erro ao salvar mensagem:", e);
    }
  });

  socket.on('disconnect', () => {
    if (socket.data.username) {
      io.emit('mensagem_sistema', `${socket.data.username} saiu.`);
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});